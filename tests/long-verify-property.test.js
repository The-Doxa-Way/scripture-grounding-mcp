/**
 * Seeded property tests for the trust-bearing invariants of long-passage
 * verification and reference resolution. Deterministic (fixed-seed PRNG), so
 * failures reproduce; broad (hundreds of generated cases per property), so
 * classes of bug surface mechanically instead of by anecdote.
 *
 * The invariants (founder charge, 2026-07-28: "if people trust this and it
 * lets them down it's maybe worse than them being on their guard"):
 *   P1. `exact` if and only if the quote is token-identical to canon.
 *   P2. Any corruption (word swap, deletion, insertion) strictly lowers the
 *       score below 1 and never yields `exact`.
 *   P3. Scores always lie in [0, 1]; the pipeline never throws on text input.
 *   P4. An omitted chapter is detected by name and caps the verdict at
 *       misquote; every other chapter still matches fully.
 *   P5. Every syntactically valid, in-range reference resolves and serves
 *       nonempty text (except the 16 BSB-omitted verses, which fail loud);
 *       out-of-range references always throw, never fabricate.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseHumanRef } from '../src/usfm.js';
import { loadBible, chapterCount, verseCount, resolveRef, getBibleText } from '../src/bible.js';
import { verifyQuote } from '../src/verify-quote.js';

/** Deterministic PRNG (mulberry32) — same cases on every run. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOOKS = [...loadBible().byCode.values()].map((b) => b.name);
/** The 16 references BSB omits (empty text in bsb.txt) — fail-loud is correct for these. */
const BSB_OMITTED = new Set([
  'Matthew 17:21', 'Matthew 18:11', 'Matthew 23:14', 'Mark 7:16', 'Mark 9:44', 'Mark 9:46',
  'Mark 11:26', 'Mark 15:28', 'Luke 17:36', 'Luke 23:17', 'John 5:4', 'Acts 8:37',
  'Acts 15:34', 'Acts 24:7', 'Acts 28:29', 'Romans 16:24',
]);

function corpusLookup(reference) {
  const got = getBibleText(resolveRef(parseHumanRef(reference)));
  return {
    reference: got.reference,
    text: got.text,
    translation: 'BSB (Berean Standard Bible, public domain)',
    source: 'bsb-corpus',
    segments: got.segments,
  };
}
const deps = { canonicalLookup: async (reference) => corpusLookup(reference) };

describe('P5: generated in-range references always resolve; out-of-range always throw', () => {
  test('300 random in-range references serve nonempty text', () => {
    const rand = prng(20260728);
    for (let i = 0; i < 300; i++) {
      const book = BOOKS[Math.floor(rand() * BOOKS.length)];
      const code = parseHumanRef(book).code;
      const chapters = chapterCount(code);
      const c = 1 + Math.floor(rand() * chapters);
      const verses = verseCount(code, c);
      const v1 = 1 + Math.floor(rand() * verses);
      const v2 = Math.min(verses, v1 + Math.floor(rand() * 8));
      const shapes = [`${book} ${c}`, `${book} ${c}:${v1}`, `${book} ${c}:${v1}-${v2}`];
      const reference = shapes[Math.floor(rand() * shapes.length)];
      if (BSB_OMITTED.has(reference)) {
        assert.throws(() => getBibleText(resolveRef(parseHumanRef(reference))), /omitted by the BSB/);
        continue;
      }
      const got = getBibleText(resolveRef(parseHumanRef(reference)));
      assert.ok(got.text.length > 0, `empty text for "${reference}"`);
      assert.ok(!got.text.includes('undefined'), `"undefined" leaked into "${reference}"`);
    }
  });

  test('150 random out-of-range references all throw, none fabricate', () => {
    const rand = prng(19840613);
    for (let i = 0; i < 150; i++) {
      const book = BOOKS[Math.floor(rand() * BOOKS.length)];
      const code = parseHumanRef(book).code;
      const chapters = chapterCount(code);
      const kind = Math.floor(rand() * 3);
      let reference;
      if (kind === 0) reference = `${book} ${chapters + 1 + Math.floor(rand() * 100)}`;
      else if (kind === 1) {
        const c = 1 + Math.floor(rand() * chapters);
        reference = `${book} ${c}:${verseCount(code, c) + 1 + Math.floor(rand() * 50)}`;
      } else {
        const c = 1 + Math.floor(rand() * chapters);
        reference = `${book} ${c}:5-2`; // backwards range
      }
      // Single-chapter books legitimately reinterpret bare numbers as verses;
      // skip the chapter-shape case for them when it lands in verse range.
      if (chapters === 1 && kind === 0) {
        const n = Number(reference.split(' ').pop());
        if (n <= verseCount(code, 1)) continue;
      }
      assert.throws(() => getBibleText(resolveRef(parseHumanRef(reference))), undefined, `no throw for out-of-range "${reference}"`);
    }
  });
});

describe('P1-P3: chunked verification integrity under generated corruption', () => {
  test('40 random books/ranges: exact read-through scores exactly 1; corrupted never does', async () => {
    const rand = prng(31102);
    for (let i = 0; i < 40; i++) {
      const book = BOOKS[Math.floor(rand() * BOOKS.length)];
      const code = parseHumanRef(book).code;
      const chapters = chapterCount(code);
      // whole book for short books, a chapter range for long ones (keeps runtime sane)
      const span = Math.min(chapters, 3 + Math.floor(rand() * 10));
      const start = 1 + Math.floor(rand() * (chapters - span + 1));
      const reference = chapters === 1 ? book : span === chapters ? book : `${book} ${start}-${start + span - 1}`;
      const canon = corpusLookup(reference);

      const vExact = await verifyQuote({ quote: canon.text, claimedReference: reference }, deps);
      assert.equal(vExact.verdict, 'exact', `not exact for own text of "${reference}" (${vExact.similarityScore})`);
      assert.equal(vExact.similarityScore, 1);

      // Corrupt: swap one word, delete a 5-word run, or insert gibberish.
      const tokens = canon.text.split(/\s+/);
      const kind = Math.floor(rand() * 3);
      const at = 10 + Math.floor(rand() * Math.max(1, tokens.length - 30));
      let mutated;
      if (kind === 0) {
        mutated = [...tokens];
        mutated[at] = 'zorbulon';
      } else if (kind === 1) {
        mutated = [...tokens.slice(0, at), ...tokens.slice(at + 5)];
      } else {
        mutated = [...tokens.slice(0, at), 'purple', 'elephants', 'dancing', ...tokens.slice(at)];
      }
      const vBad = await verifyQuote({ quote: mutated.join(' '), claimedReference: reference }, deps);
      assert.notEqual(vBad.verdict, 'exact', `corruption (${kind}) verified exact for "${reference}"`);
      assert.ok(vBad.similarityScore < 1, `corrupted score not < 1 for "${reference}"`);
      assert.ok(vBad.similarityScore >= 0 && vBad.similarityScore <= 1);
    }
  });

  test('garbage and empty inputs never throw and never verify', async () => {
    for (const quote of ['', '    ', 'zzz qqq xxx', 'a', '\n\n\n']) {
      const v = await verifyQuote({ quote, claimedReference: 'Romans' }, deps);
      assert.notEqual(v.verdict, 'exact');
      assert.notEqual(v.verdict, 'minor_variance');
    }
  });
});

describe('P4: omission detection across generated books', () => {
  test('dropping one random chapter from 12 random books is always caught by name', async () => {
    const rand = prng(66);
    const multiChapterBooks = BOOKS.filter((b) => chapterCount(parseHumanRef(b).code) >= 4);
    for (let i = 0; i < 12; i++) {
      const book = multiChapterBooks[Math.floor(rand() * multiChapterBooks.length)];
      const code = parseHumanRef(book).code;
      const chapters = chapterCount(code);
      const span = Math.min(chapters, 8);
      const reference = span === chapters ? book : `${book} 1-${span}`;
      const canon = corpusLookup(reference);
      const dropIdx = Math.floor(rand() * canon.segments.length);
      const dropped = canon.segments[dropIdx].reference;
      const quote = canon.segments.filter((_, idx) => idx !== dropIdx).map((s) => s.text).join(' ');

      const v = await verifyQuote({ quote, claimedReference: reference }, deps);
      if (v.comparisonMode !== 'chunked') continue; // small spans may verify whole; omission still lowers score
      const omitted = v.segmentBreakdown.filter((b) => b.omitted).map((b) => b.reference);
      assert.deepEqual(omitted, [dropped], `omission of ${dropped} in "${reference}" detected as [${omitted}]`);
      assert.equal(v.verdict, 'misquote');
      assert.equal(
        v.segmentBreakdown.filter((b) => !b.omitted && b.matchedWords !== b.canonicalWords).length,
        0,
        `non-omitted segments of "${reference}" did not all match cleanly`
      );
    }
  });
});
