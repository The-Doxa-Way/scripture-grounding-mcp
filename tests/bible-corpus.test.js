/**
 * Tests for the whole-Bible corpus layer added 2026-07-28:
 *   - src/usfm.js parseHumanRef (book / chapter-range / cross-chapter scopes)
 *   - src/bible.js (parse, bounds, single-chapter-book convention, segments,
 *     superscriptions)
 *   - src/youversion-client.js corpus routing + keyed multi-chapter stitching
 *   - src/long-verify.js + verify_quote's chunked long-passage path
 *     (exact-at-length, corruption pinpointing, omitted-chapter detection)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseHumanRef, humanRefToUsfm } from '../src/usfm.js';
import { loadBible, chapterCount, verseCount, resolveRef, getBibleText } from '../src/bible.js';
import { createYouVersionClient } from '../src/youversion-client.js';
import { verifyQuote } from '../src/verify-quote.js';
import { chunkedVerify, pseudoSegments } from '../src/long-verify.js';
import { lcsConsumedPrefix } from '../src/diff.js';
import { tokenize } from '../src/normalize.js';

// ---------------------------------------------------------------------------
// parseHumanRef
// ---------------------------------------------------------------------------

describe('parseHumanRef covers every supported reference scope', () => {
  test('verse and verse-range (existing behavior)', () => {
    assert.deepEqual(parseHumanRef('John 3:16'), { book: 'John', code: 'JHN', scope: 'verse', chapter: 3, verseStart: 16, verseEnd: 16 });
    assert.equal(parseHumanRef('John 3:16-17').verseEnd, 17);
  });

  test('chapter-only', () => {
    assert.deepEqual(parseHumanRef('Romans 8'), { book: 'Romans', code: 'ROM', scope: 'chapter', chapter: 8 });
  });

  test('chapter range', () => {
    const p = parseHumanRef('Romans 1-3');
    assert.equal(p.scope, 'chapter-range');
    assert.equal(p.chapter, 1);
    assert.equal(p.endChapter, 3);
  });

  test('cross-chapter verse range', () => {
    const p = parseHumanRef('John 3:16-4:2');
    assert.deepEqual(p, { book: 'John', code: 'JHN', scope: 'cross-chapter', chapter: 3, verseStart: 16, endChapter: 4, endVerse: 2 });
  });

  test('same-chapter range written in cross-chapter form normalizes to verse scope', () => {
    const p = parseHumanRef('John 3:16-3:17');
    assert.equal(p.scope, 'verse');
    assert.equal(p.verseEnd, 17);
  });

  test('book-only, including numbered books and abbreviations', () => {
    assert.deepEqual(parseHumanRef('Romans'), { book: 'Romans', code: 'ROM', scope: 'book' });
    assert.equal(parseHumanRef('1 John').code, '1JN');
    assert.equal(parseHumanRef('Psalms').code, 'PSA');
  });

  test('en-dash ranges parse like hyphens at every scope', () => {
    assert.equal(parseHumanRef('Romans 1–3').scope, 'chapter-range');
    assert.equal(parseHumanRef('John 3:16–4:2').scope, 'cross-chapter');
  });

  test('unrecognized book and garbage still throw', () => {
    assert.throws(() => parseHumanRef('2 Hezekiah 3:1'), /Unrecognized book name/);
    assert.throws(() => parseHumanRef('the quick brown fox jumps'));
  });

  test('humanRefToUsfm contract unchanged: single ids for verse/chapter, throws for wider scopes', () => {
    assert.equal(humanRefToUsfm('John 3:16-17'), 'JHN.3.16-17');
    assert.equal(humanRefToUsfm('Psalm 23'), 'PSA.23');
    assert.throws(() => humanRefToUsfm('Romans'), /spans more than one chapter/);
    assert.throws(() => humanRefToUsfm('John 3:16-4:2'), /spans more than one chapter/);
  });
});

// ---------------------------------------------------------------------------
// bible.js corpus
// ---------------------------------------------------------------------------

describe('bible.js parses the committed BSB and serves any scope', () => {
  test('corpus parses completely: 66 books, 31,086 verses with text + 16 BSB-omitted positions', () => {
    const { byCode, verseCount: total, omittedCount } = loadBible();
    assert.equal(byCode.size, 66);
    // 31,102 verse lines in bsb.txt; 16 (e.g. Matthew 17:21, Acts 8:37) are
    // omitted by the BSB (empty text — absent from the earliest manuscripts).
    assert.equal(total, 31086);
    assert.equal(omittedCount, 16);
    assert.equal(chapterCount('ROM'), 16);
    assert.equal(verseCount('ROM', 8), 39);
    assert.equal(chapterCount('PSA'), 150);
  });

  test('BSB-omitted verses fail loud when requested directly, and never inject gaps into chapter text', () => {
    assert.throws(() => getBibleText(parseHumanRef('Matthew 17:21')), /omitted by the BSB/);
    const ch = getBibleText(parseHumanRef('Matthew 17'));
    assert.ok(!ch.text.includes('undefined'));
    assert.ok(!/\s{2,}/.test(ch.text));
    // a range spanning an omitted verse serves the verses that exist
    const range = getBibleText(parseHumanRef('Matthew 17:20-22'));
    assert.match(range.text, /mustard seed/);
  });

  test('whole book returns one segment per chapter and joined text', () => {
    const rom = getBibleText(parseHumanRef('Romans'));
    assert.equal(rom.reference, 'Romans');
    assert.equal(rom.chapterCount, 16);
    assert.equal(rom.segments.length, 16);
    assert.equal(rom.segments[7].reference, 'Romans 8');
    assert.match(rom.segments[7].text, /^Therefore, there is now no condemnation/);
  });

  test('cross-chapter range stitches partial first/last chapters', () => {
    const got = getBibleText(parseHumanRef('John 3:16-4:2'));
    assert.equal(got.reference, 'John 3:16-4:2');
    assert.deepEqual(
      got.segments.map((s) => s.reference),
      ['John 3:16-36', 'John 4:1-2']
    );
    assert.match(got.segments[0].text, /^For God so loved the world/);
  });

  test('single-chapter book convention: "Jude 3" means Jude 1:3', () => {
    const got = getBibleText(resolveRef(parseHumanRef('Jude 3')));
    assert.equal(got.reference, 'Jude 1:3');
    assert.match(got.text, /^Beloved/);
    const range = getBibleText(resolveRef(parseHumanRef('Jude 3-4')));
    assert.equal(range.reference, 'Jude 1:3-4');
  });

  test('single-chapter book ranges STARTING at 1 are verse ranges — the standard whole-book citation works', () => {
    // Review finding 2026-07-28: these threw "chapter N out of range".
    assert.equal(getBibleText(resolveRef(parseHumanRef('Jude 1-25'))).reference, 'Jude 1');
    assert.equal(getBibleText(resolveRef(parseHumanRef('Obadiah 1-21'))).reference, 'Obadiah 1');
    assert.equal(getBibleText(resolveRef(parseHumanRef('Jude 1-3'))).reference, 'Jude 1:1-3');
    assert.equal(getBibleText(resolveRef(parseHumanRef('Philemon 1-3'))).reference, 'Philemon 1:1-3');
    assert.equal(getBibleText(resolveRef(parseHumanRef('3 John 1-4'))).reference, '3 John 1:1-4');
    // and a bare "Jude 1" is still the whole (only) chapter
    assert.equal(getBibleText(resolveRef(parseHumanRef('Jude 1'))).reference, 'Jude 1');
  });

  test('bounds-checking fails loud with real counts in the message', () => {
    assert.throws(() => resolveRef(parseHumanRef('Philippians 5')), /4 chapters/);
    assert.throws(() => resolveRef(parseHumanRef('John 3:99')), /out of range/);
    assert.throws(() => resolveRef(parseHumanRef('Psalm 152')), /150 chapters/);
    assert.throws(() => resolveRef(parseHumanRef('Romans 9-3')), /backwards/);
  });

  test('psalm superscriptions are split out of chapter text, matching fixture semantics', () => {
    const ps23 = getBibleText(parseHumanRef('Psalm 23'));
    assert.equal(ps23.segments[0].superscription, 'A Psalm of David.');
    assert.match(ps23.segments[0].text, /^The LORD is my shepherd/);
    // Historic-note form (extended pattern set, 2026-07-28)
    const ps3 = getBibleText(parseHumanRef('Psalm 3'));
    assert.match(ps3.segments[0].superscription, /^A Psalm of David, when he fled/);
    // No superscription -> none invented
    const ps1 = getBibleText(parseHumanRef('Psalm 1'));
    assert.equal(ps1.segments[0].superscription, undefined);
  });
});

// ---------------------------------------------------------------------------
// youversion-client routing
// ---------------------------------------------------------------------------

describe('youversion-client serves corpus keyless and stitches keyed multi-chapter requests', () => {
  test('keyless: uncurated verse, chapter, and whole book come from bsb-corpus', async () => {
    const client = createYouVersionClient({ appKey: undefined });
    const verse = await client.getPassage('Obadiah 1:3');
    assert.equal(verse.source, 'bsb-corpus');
    assert.ok(verse.text.length > 0);

    const chapter = await client.getPassage('Romans 8');
    assert.equal(chapter.source, 'bsb-corpus');
    assert.match(chapter.text, /^Therefore, there is now no condemnation/);

    const book = await client.getPassage('Romans');
    assert.equal(book.source, 'bsb-corpus');
    assert.equal(book.chapterCount, 16);
    assert.equal(book.segments.length, 16);
  });

  test('keyless: curated fixture still wins for its exact reference string', async () => {
    const client = createYouVersionClient({ appKey: undefined });
    const result = await client.getPassage('John 3:16-17');
    assert.equal(result.source, 'fixture');
  });

  test('keyed + default BSB: multi-chapter served locally with zero API calls', async () => {
    const client = createYouVersionClient({
      appKey: 'fake-key',
      fetchImpl: () => {
        throw new Error('no API call should be made for a BSB multi-chapter request');
      },
    });
    const book = await client.getPassage('Romans');
    assert.equal(book.source, 'bsb-corpus');
    assert.match(book.note, /committed BSB corpus/);
  });

  test('keyed + non-BSB version: whole book stitched from per-chapter API calls', async () => {
    const calls = [];
    const client = createYouVersionClient({
      appKey: 'fake-key',
      fetchImpl: async (url) => {
        calls.push(url);
        const id = decodeURIComponent(url.split('/passages/')[1]);
        return { ok: true, status: 200, json: async () => ({ id, reference: id, content: `text of ${id}` }) };
      },
    });
    const book = await client.getPassage('Jude', '206');
    assert.equal(book.source, 'youversion-api');
    assert.equal(calls.length, 1); // Jude has one chapter
    const range = await client.getPassage('Romans 1-3', '206');
    assert.equal(range.segments.length, 3);
    assert.match(range.note, /per-chapter YouVersion API calls/);
  });

  test('keyed + non-BSB version: over-cap request errors clearly instead of hammering the API', async () => {
    const client = createYouVersionClient({
      appKey: 'fake-key',
      fetchImpl: () => {
        throw new Error('should not fetch when over the stitch cap');
      },
    });
    const book = await client.getPassage('Psalms', '206');
    assert.equal(book.text, null);
    assert.match(book.error, /150 chapters/);
    assert.match(book.error, /chapter ranges/);
  });

  test('keyed + non-BSB version: one failed chapter fails the whole request — never a silent partial book', async () => {
    const client = createYouVersionClient({
      appKey: 'fake-key',
      fetchImpl: async (url) => {
        if (url.includes('ROM.2')) return { ok: false, status: 500, json: async () => ({}) };
        const id = decodeURIComponent(url.split('/passages/')[1]);
        return { ok: true, status: 200, json: async () => ({ id, reference: id, content: `text of ${id}` }) };
      },
    });
    const range = await client.getPassage('Romans 1-3', '206');
    assert.equal(range.text, null);
    assert.match(range.error, /refusing to return a partial/);
  });
});

// ---------------------------------------------------------------------------
// long-verify + verify_quote chunked path
// ---------------------------------------------------------------------------

describe('long-passage verification: exact at length, pinpointed errors, omission detection', () => {
  const client = createYouVersionClient({ appKey: undefined });
  async function lookup(reference, version) {
    const r = await client.getPassage(reference, version);
    if (!r.text) return null;
    return { reference: r.reference, text: r.text, translation: r.translation, source: r.source, ...(r.segments ? { segments: r.segments } : {}) };
  }

  test('lcsConsumedPrefix returns the minimal matching prefix, not a tail-matched overshoot', () => {
    const a = tokenize('in the beginning god created the heavens and the earth');
    // window = the real segment text, then next-chapter text that reuses common words
    const b = [...a, ...tokenize('now the earth was formless and god said let there be light')];
    const { lcsLength, consumed } = lcsConsumedPrefix(a, b);
    assert.equal(lcsLength, a.length);
    assert.equal(consumed, a.length);
  });

  test('whole-book exact read (with inline chapter numbers) verifies exact with zero differing segments', async () => {
    const rom = await client.getPassage('Romans');
    const quote = rom.segments.map((s, i) => `${i + 1} ${s.text}`).join(' ');
    const v = await verifyQuote({ quote, claimedReference: 'Romans' }, { canonicalLookup: lookup });
    assert.equal(v.verdict, 'exact');
    assert.equal(v.similarityScore, 1);
    assert.equal(v.comparisonMode, 'chunked');
    assert.equal(v.segmentsWithDifferences, 0);
    assert.equal(v.segmentsCompared, 16);
  });

  test('a two-word slip across a whole book is minor_variance, pinpointed to its chapter — never exact', async () => {
    const rom = await client.getPassage('Romans');
    const quote = rom.segments.map((s) => s.text).join(' ').replace('no condemnation', 'no more shame');
    const v = await verifyQuote({ quote, claimedReference: 'Romans' }, { canonicalLookup: lookup });
    assert.equal(v.verdict, 'minor_variance');
    assert.ok(v.similarityScore < 1 && v.similarityScore > 0.999);
    const diffSegs = v.segmentBreakdown.filter((b) => b.matchedWords !== b.canonicalWords);
    assert.deepEqual(diffSegs.map((b) => b.reference), ['Romans 8']);
  });

  test('an omitted chapter is detected by name and caps the verdict at misquote', async () => {
    const rom = await client.getPassage('Romans');
    const quote = rom.segments.filter((s) => s.reference !== 'Romans 7').map((s) => s.text).join(' ');
    const v = await verifyQuote({ quote, claimedReference: 'Romans' }, { canonicalLookup: lookup });
    assert.equal(v.verdict, 'misquote');
    const omitted = v.segmentBreakdown.filter((b) => b.omitted);
    assert.deepEqual(omitted.map((b) => b.reference), ['Romans 7']);
    assert.match(v.reason, /OMITTED from the quote entirely: Romans 7/);
    // every other chapter still attributed cleanly
    assert.equal(v.segmentBreakdown.filter((b) => !b.omitted && b.matchedWords !== b.canonicalWords).length, 0);
  });

  test('chapter-scale references still verify on the single-table path with unchanged response shape', async () => {
    const rom8 = await client.getPassage('Romans 8');
    const v = await verifyQuote({ quote: rom8.text, claimedReference: 'Romans 8' }, { canonicalLookup: lookup });
    assert.equal(v.verdict, 'exact');
    assert.equal(v.comparisonMode, undefined);
  });

  test('pseudo-segments make the chunked path work even without per-chapter segments', () => {
    const tokens = tokenize('one two three four five six seven eight');
    const segs = pseudoSegments(tokens, 'Somewhere', 3);
    assert.equal(segs.length, 3);
    assert.equal(segs[0].reference, 'Somewhere (part 1)');
    const result = chunkedVerify(segs, tokens);
    assert.equal(result.similarityScore, 1);
  });

  test('quote covering only part of a book scores honestly low, never inflated', async () => {
    const rom = await client.getPassage('Romans');
    const v = await verifyQuote({ quote: rom.segments[7].text, claimedReference: 'Romans' }, { canonicalLookup: lookup });
    assert.notEqual(v.verdict, 'exact');
    assert.notEqual(v.verdict, 'minor_variance');
    assert.ok(v.similarityScore < 0.5);
  });
});
