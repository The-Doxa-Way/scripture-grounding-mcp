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

test('a verbatim KJV wording of Philippians 4:13, claimed as BSB, is recognized as an accurate different-translation quote, not a misquote', async () => {
  // "I can do all things through Christ which strengtheneth me" is not a typo
  // or paraphrase — it's KJV's own real wording of this verse, verbatim
  // (fixtures/kjv/philippians-4-13.json). It diverges enough from BSB's "...
  // who gives me strength" to fall below the minor_variance threshold, but
  // flatly calling it a "misquote" would be dishonest: it's a different,
  // real, publicly-verifiable translation of the SAME verse, not wrong
  // wording — exactly the version-fidelity distinction `different_translation`
  // exists to make (src/alt-translations.js).
  const kjvStyle = 'I can do all things through Christ which strengtheneth me.';
  const result = await verifyQuote({ quote: kjvStyle, claimedReference: 'Philippians 4:13' });
  assert.equal(result.verdict, 'different_translation');
  assert.equal(result.closestTranslation, 'KJV (King James Version, public domain)');
  assert.equal(result.similarityToClosest, 1);
  assert.ok(result.similarityScore < 0.95, `similarity to requested BSB should still be <0.95, got ${result.similarityScore}`);
  assert.equal(result.similarityToRequested, result.similarityScore);
});

test('a mixed/blended paraphrase of 1 Corinthians 13:4-7 (real ungrounded benchmark output, NIV-influenced but not verbatim NIV/WEB/KJV) still verifies as a plain misquote, not different_translation', async () => {
  // "It always protects, always trusts, always hopes, always perseveres" is
  // NIV-style phrasing, but this project ships no NIV corpus — so the
  // closest LOCAL canon (BSB/WEB/KJV) for this quote is still just BSB
  // itself, and the verdict correctly stays `misquote` rather than being
  // mistaken for an accurate quote of some other translation.
  const blended =
    'Love is patient, love is kind. It does not envy, it does not boast, it is not proud. It is not rude, it is not self-seeking, ' +
    'it is not easily angered, it keeps no account of wrongs. Love takes no pleasure in evil, but rejoices in the truth. ' +
    'It always protects, always trusts, always hopes, always perseveres.';
  const result = await verifyQuote({ quote: blended, claimedReference: '1 Corinthians 13:4-7' });
  assert.equal(result.verdict, 'misquote');
  assert.equal(result.closestTranslation, 'BSB (Berean Standard Bible, public domain)');
});

test('an exact BSB quote (the requested/default translation) still verifies exact, with closestTranslation also BSB', async () => {
  const fixture = findByReference('Genesis 1:1-3');
  const result = await verifyQuote({ quote: fixture.text, claimedReference: 'Genesis 1:1-3' });
  assert.equal(result.verdict, 'exact');
  assert.equal(result.closestTranslation, 'BSB (Berean Standard Bible, public domain)');
  assert.equal(result.similarityToClosest, 1);
  assert.equal(result.verdictAgainstClosest, 'exact');
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

test('a quote correctly omitting a psalm\'s superscription (e.g. Psalm 46) verifies exact — the header is not the quoted passage (integrity fix, 2026-07-27)', async () => {
  const fixture = findByReference('Psalm 46:1-3');
  assert.ok(!fixture.superscription || !fixture.text.includes(fixture.superscription));
  const result = await verifyQuote({ quote: fixture.text, claimedReference: 'Psalm 46:1-3' });
  assert.equal(result.verdict, 'exact');
  assert.equal(result.similarityScore, 1);
});

test('a quote that INCLUDES a psalm\'s superscription still verifies exact — the quote side is normalized symmetrically with the canonical side', async () => {
  const fixture = findByReference('Psalm 46:1-3');
  const withHeader = `${fixture.superscription} ${fixture.text}`;
  const result = await verifyQuote({ quote: withHeader, claimedReference: 'Psalm 46:1-3' });
  assert.equal(result.verdict, 'exact');
  assert.equal(result.similarityScore, 1);
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

// --- Licensed-translation multi-version comparison (deps.multiVersion) ---
// (founder-directed 2026-07-27, flag-gated in src/index.js — see README's
// "Multi-version detection" section). All fetchVersion fakes below; no real
// network call, no licensed text anywhere near the test suite.

test('flag OFF (no deps.multiVersion): behavior is byte-identical to the pre-existing local-only path', async () => {
  const kjvStyle = 'I can do all things through Christ which strengtheneth me.';
  const result = await verifyQuote({ quote: kjvStyle, claimedReference: 'Philippians 4:13' });
  assert.equal(result.verdict, 'different_translation');
  assert.equal(result.closestTranslation, 'KJV (King James Version, public domain)');
  assert.equal(result.remoteVersionsChecked, null);
});

test('flag ON (deps.multiVersion with a fake fetchVersion): a licensed-translation-verbatim quote verifies different_translation and names the fetched version', async () => {
  const fetchVersion = async (reference, versionId) => ({
    text: 'FAKE NIV-style rendering of this verse, word for word.',
    translation: 'NIV (New International Version)',
    source: 'youversion-api',
  });
  const result = await verifyQuote(
    { quote: 'FAKE NIV-style rendering of this verse, word for word.', claimedReference: 'Philippians 4:13' },
    { multiVersion: { fetchVersion, versionIds: ['111'] } }
  );
  assert.equal(result.verdict, 'different_translation');
  assert.equal(result.closestTranslation, 'NIV (New International Version)');
  assert.equal(result.similarityToClosest, 1);
  assert.equal(result.remoteVersionsChecked.length, 1);
  assert.equal(result.remoteVersionsChecked[0].skipped, undefined);
});

test('flag ON but every remote version fails: verdict/closest fall back to the local corpora, and the failure is reported (not thrown) in remoteVersionsChecked', async () => {
  const fetchVersion = async () => {
    throw new Error('simulated: access denied for this key');
  };
  const kjvStyle = 'I can do all things through Christ which strengtheneth me.';
  const result = await verifyQuote(
    { quote: kjvStyle, claimedReference: 'Philippians 4:13' },
    { multiVersion: { fetchVersion, versionIds: ['111'] } }
  );
  assert.equal(result.verdict, 'different_translation');
  assert.equal(result.closestTranslation, 'KJV (King James Version, public domain)');
  assert.equal(result.remoteVersionsChecked.length, 1);
  assert.equal(result.remoteVersionsChecked[0].skipped, true);
  assert.match(result.remoteVersionsChecked[0].note, /simulated: access denied/);
});
