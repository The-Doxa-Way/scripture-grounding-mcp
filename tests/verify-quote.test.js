import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyQuote } from '../src/verify-quote.js';
import { findByReference } from '../src/fixtures.js';

test('exact quote against its correct reference verifies as exact with similarity 1.0', async () => {
  const fixture = findByReference('Philippians 4:13');
  const result = await verifyQuote({ quote: fixture.text, claimedReference: 'Philippians 4:13' });
  assert.equal(result.verdict, 'exact');
  assert.equal(result.similarityScore, 1);
  assert.equal(result.canonicalText, fixture.text);
  assert.equal(result.canonicalSource, 'fixture');
});

test('quote decorated with smart quotes, inline verse numbers, mixed case, and extra whitespace still verifies exact (normalization robustness)', async () => {
  const decorated =
    '“16 FOR   god so loved the world that He gave His one and only Son, that everyone ' +
    'who believes in Him shall not perish but have eternal life. 17 For God did not send ' +
    'His Son into the world to condemn   the world, but to save the world through Him.”';
  const result = await verifyQuote({ quote: decorated, claimedReference: 'John 3:16-17' });
  assert.equal(result.verdict, 'exact');
  assert.equal(result.similarityScore, 1);
});

test('one-word substitution ("declares" -> "says") on a 29-word verse scores just above 0.95 and verifies as minor_variance, not misquote', async () => {
  const fixture = findByReference('Jeremiah 29:11');
  const variant = fixture.text.replace('declares', 'says');
  const result = await verifyQuote({ quote: variant, claimedReference: 'Jeremiah 29:11' });
  assert.equal(result.verdict, 'minor_variance');
  assert.ok(result.similarityScore > 0.95 && result.similarityScore < 1, `expected >0.95 and <1, got ${result.similarityScore}`);
});

test('a well-known archaic (KJV-style) wording of Philippians 4:13 diverges enough from BSB to verify as misquote, not minor_variance', async () => {
  // "I can do all things through Christ which strengtheneth me" (KJV) vs BSB's
  // "I can do all things through Christ who gives me strength" — this is a
  // real, commonly-quoted wording, not a typo, but it replaces 3 of the
  // final 4 content words, so word-level similarity falls well below the
  // 0.95 minor_variance threshold.
  const kjvStyle = 'I can do all things through Christ which strengtheneth me.';
  const result = await verifyQuote({ quote: kjvStyle, claimedReference: 'Philippians 4:13' });
  assert.equal(result.verdict, 'misquote');
  assert.ok(result.similarityScore < 0.95, `expected <0.95, got ${result.similarityScore}`);
  assert.ok(result.similarityScore >= 0.3, `expected >=0.3 (still recognizably related), got ${result.similarityScore}`);
});

test('a materially reworded paraphrase attributed to its real reference verifies as misquote', async () => {
  const result = await verifyQuote({
    quote:
      'I know the good plans I have in store for you, so says the Lord, plans to bless you and not to hurt you, giving you great hope for tomorrow.',
    claimedReference: 'Jeremiah 29:11',
  });
  assert.equal(result.verdict, 'misquote');
  assert.ok(result.similarityScore >= 0.3 && result.similarityScore < 0.95);
});

test('an exact quote pinned to the wrong (but real, fixture) reference verifies as misattribution and names the correct reference', async () => {
  const johnFixture = findByReference('John 3:16-17');
  const result = await verifyQuote({ quote: johnFixture.text, claimedReference: 'Psalm 23:1-6' });
  assert.equal(result.verdict, 'misattribution');
  assert.equal(result.correctReference, 'John 3:16-17');
});

test('an exact quote attributed to a reference outside the corpus still verifies as misattribution against the best in-corpus match', async () => {
  const philFixture = findByReference('Philippians 4:13');
  const result = await verifyQuote({ quote: philFixture.text, claimedReference: 'Zephaniah 3:99' });
  assert.equal(result.verdict, 'misattribution');
  assert.equal(result.correctReference, 'Philippians 4:13');
});

test('a reference outside the corpus with an unrelated/garbage quote verifies as not_found', async () => {
  const result = await verifyQuote({ quote: 'purple elephants dance on tuesdays', claimedReference: 'Zephaniah 3:99' });
  assert.equal(result.verdict, 'not_found');
  assert.equal(result.correctReference, null);
});

test('an in-corpus reference with an unrelated/garbage quote verifies as not_found (fail-safe, no crash)', async () => {
  const result = await verifyQuote({ quote: 'purple elephants dance on tuesdays in the marketplace', claimedReference: 'Philippians 4:13' });
  assert.equal(result.verdict, 'not_found');
});

test('empty quote fails safe as not_found rather than throwing', async () => {
  const result = await verifyQuote({ quote: '', claimedReference: 'Philippians 4:13' });
  assert.equal(result.verdict, 'not_found');
});

test('missing/empty claimed_reference fails safe as not_found rather than throwing', async () => {
  const result = await verifyQuote({ quote: 'I can do all things through Christ who gives me strength.', claimedReference: '' });
  assert.equal(result.verdict, 'not_found');
});

test('null/undefined inputs fail safe as not_found rather than throwing (rejects never, resolves to not_found)', async () => {
  await assert.doesNotReject(() => verifyQuote({ quote: undefined, claimedReference: undefined }));
  const result = await verifyQuote({ quote: undefined, claimedReference: undefined });
  assert.equal(result.verdict, 'not_found');
});

test('a custom canonicalLookup (simulating live YouVersion API mode) is used instead of the fixture corpus', async () => {
  const calls = [];
  const canonicalLookup = async (reference, version) => {
    calls.push({ reference, version });
    return { reference: 'John 3:16-17', text: 'Some live-API text.', translation: 'BSB', source: 'youversion-api' };
  };
  const result = await verifyQuote(
    { quote: 'Some live-API text.', claimedReference: 'John 3:16-17', version: '3034' },
    { canonicalLookup }
  );
  assert.equal(result.verdict, 'exact');
  assert.equal(result.canonicalSource, 'youversion-api');
  assert.deepEqual(calls, [{ reference: 'John 3:16-17', version: '3034' }]);
});

test('when canonicalLookup resolves null (reference not resolvable live or in fixtures), an unrelated quote verifies as not_found', async () => {
  const canonicalLookup = async () => null;
  const result = await verifyQuote(
    { quote: 'purple elephants dance on tuesdays', claimedReference: 'Some Unresolvable 1:1' },
    { canonicalLookup }
  );
  assert.equal(result.verdict, 'not_found');
});
