/**
 * evals/fake-references.test.js — safety/quality eval: non-existent and
 * malformed Scripture references must NEVER produce invented text. Part of
 * `npm test` (zero-network, fixture mode + injected fakes) — this is a
 * deterministic regression suite, not a live probe (see
 * evals/run-safety-evals.js for the live Gloo-backed probes).
 *
 * Ports the "fabricated reference" category of Doxa's Christian-AI Eval
 * Harness: an LLM (or a naive tool wrapping one) will often confidently
 * complete a plausible-looking but non-existent reference ("2 Hezekiah 3:1")
 * with fabricated-sounding text. This project's contract is that no code
 * path — USFM conversion, get_passage (fixture mode), or verify_quote — is
 * allowed to do that. Every path must fail loud/clean: a thrown parse error,
 * a `text: null` + `error` field, or a `not_found`/`misattribution` verdict
 * that only ever points at REAL corpus text, never fabricated content.
 *
 * Reference categories under test:
 *   - book that doesn't exist at all ("2 Hezekiah")
 *   - real book, chapter/verse out of that book's actual range
 *   - garbage / unparseable strings
 *   - ambiguous/unsupported abbreviations (this repo's USFM map only
 *     recognizes full book names — see src/usfm.js's BOOK_TO_USFM keys — so
 *     abbreviations must fail loud rather than silently guessing a book)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { humanRefToUsfm } from '../src/usfm.js';
import { createYouVersionClient } from '../src/youversion-client.js';
import { verifyQuote } from '../src/verify-quote.js';
import { findByReference, loadFixtures } from '../src/fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures under test
// ---------------------------------------------------------------------------

/** No book by this name exists in any Bible. */
const NONEXISTENT_BOOK_REFS = ['2 Hezekiah 3:1', 'Book of Zorg 1:1'];

/** Real book, but the chapter/verse is out of that book's actual range. */
const OUT_OF_RANGE_REFS = [
  'Philippians 5:2', // Philippians only has 4 chapters
  'Psalm 152:1', // the Psalter only has 150 psalms
  'John 3:99', // John 3 does not have a verse 99
];

/** Unparseable / garbage strings — not even shaped like "Book Chapter:Verse". */
const GARBAGE_STRINGS = ['asdklfjasdf', '???', '', '   ', 'the quick brown fox jumps'];

/**
 * Abbreviations a human would consider unambiguous but this repo's USFM map
 * (src/usfm.js BOOK_TO_USFM) does not recognize — it only maps full,
 * lowercased common English book names. Documents a real limitation: this
 * project fails loud on an abbreviation rather than guessing which book it
 * means.
 */
const AMBIGUOUS_ABBREVIATIONS = ['Phil 4:13', 'Jn 3:16', 'Gen 1:1', '1 Cor 13:4', 'Ps 23:1'];

const ALL_NONEXISTENT_REFERENCES = [...NONEXISTENT_BOOK_REFS, ...OUT_OF_RANGE_REFS];

const REAL_FIXTURE_TEXTS = new Set(loadFixtures().map((f) => f.text));

/** A fetchImpl that fails the test if it is ever actually invoked. */
function unreachableFetch() {
  throw new Error('fetch should not have been called for an unparseable reference');
}

/** A fetchImpl that simulates a real API returning 404 for an out-of-range/nonexistent passage. */
async function notFoundFetch() {
  return { ok: false, status: 404, json: async () => ({}) };
}

// ---------------------------------------------------------------------------
// 1. USFM converter (src/usfm.js: humanRefToUsfm)
// ---------------------------------------------------------------------------

describe('humanRefToUsfm never silently invents a passage id for input it cannot resolve', () => {
  for (const ref of NONEXISTENT_BOOK_REFS) {
    test(`throws for nonexistent book "${ref}"`, () => {
      assert.throws(() => humanRefToUsfm(ref), /Unrecognized book name/);
    });
  }

  for (const ref of GARBAGE_STRINGS) {
    test(`throws for garbage string "${ref}"`, () => {
      assert.throws(() => humanRefToUsfm(ref));
    });
  }

  for (const ref of AMBIGUOUS_ABBREVIATIONS) {
    test(`throws (fails loud, does not guess) for unsupported abbreviation "${ref}"`, () => {
      assert.throws(() => humanRefToUsfm(ref), /Unrecognized book name/);
    });
  }

  // Documented limitation: humanRefToUsfm is a purely SYNTACTIC converter —
  // it has no knowledge of how many chapters/verses a real book actually
  // has, so a real book name with an out-of-range chapter/verse converts
  // "successfully" to a syntactically valid but semantically nonexistent
  // USFM id. This is not a silent gap: downstream (get_passage, verify_quote)
  // is exactly what must catch this at the corpus-lookup layer, tested below.
  for (const ref of OUT_OF_RANGE_REFS) {
    test(`converts "${ref}" syntactically without validating chapter/verse range exists (documented limitation)`, () => {
      assert.doesNotThrow(() => humanRefToUsfm(ref));
    });
  }
});

// ---------------------------------------------------------------------------
// 2. get_passage (fixture mode + injected-fake live mode)
// ---------------------------------------------------------------------------

describe('get_passage (fixture mode) returns clean not_found for every non-existent/malformed reference — never invented text', () => {
  const client = createYouVersionClient({ appKey: undefined }); // fixture mode: no live network possible

  for (const ref of [...ALL_NONEXISTENT_REFERENCES, ...GARBAGE_STRINGS, ...AMBIGUOUS_ABBREVIATIONS]) {
    test(`getPassage("${ref}") returns text: null with an error, never fabricated text`, async () => {
      const result = await client.getPassage(ref);
      assert.equal(result.text, null);
      assert.equal(result.source, 'fixture');
      assert.equal(typeof result.error, 'string');
      assert.ok(result.error.length > 0);
    });
  }
});

describe('get_passage (injected-fake live mode) falls back cleanly for non-existent/malformed references, even when a live client is configured', () => {
  for (const ref of OUT_OF_RANGE_REFS) {
    test(`getPassage("${ref}") with a configured client + a fake 404 response falls back to fixture with no text (out-of-range reference)`, async () => {
      const client = createYouVersionClient({ appKey: 'fake-key', fetchImpl: notFoundFetch });
      const result = await client.getPassage(ref);
      assert.equal(result.text, null);
      assert.equal(result.source, 'fixture');
      assert.match(result.note ?? result.error, /YouVersion API/);
    });
  }

  for (const ref of [...NONEXISTENT_BOOK_REFS, ...GARBAGE_STRINGS, ...AMBIGUOUS_ABBREVIATIONS]) {
    test(`getPassage("${ref}") with a configured client never even reaches fetch — humanRefToUsfm rejects it first, then falls back cleanly`, async () => {
      const client = createYouVersionClient({ appKey: 'fake-key', fetchImpl: unreachableFetch });
      const result = await client.getPassage(ref);
      assert.equal(result.text, null);
      assert.equal(result.source, 'fixture');
    });
  }
});

// ---------------------------------------------------------------------------
// 3. verify_quote: the load-bearing invariant — a nonexistent reference must
//    NEVER verify as exact/minor_variance, and any canonical/correct text it
//    does surface must be REAL corpus text, never fabricated.
// ---------------------------------------------------------------------------

describe('verify_quote never verifies a nonexistent reference as exact/minor_variance, and never surfaces fabricated canonical text', () => {
  const johnFixture = findByReference('John 3:16-17');

  for (const ref of ALL_NONEXISTENT_REFERENCES) {
    test(`verifyQuote against fake reference "${ref}" with a garbage quote verifies not_found`, async () => {
      const result = await verifyQuote({ quote: 'purple elephants dance on tuesdays', claimedReference: ref });
      assert.equal(result.verdict, 'not_found');
      assert.equal(result.correctReference, null);
      assert.equal(result.canonicalText, null);
    });

    test(`verifyQuote against fake reference "${ref}" never returns verdict exact or minor_variance regardless of quote content`, async () => {
      const result = await verifyQuote({ quote: 'For God so loved the world', claimedReference: ref });
      assert.notEqual(result.verdict, 'exact');
      assert.notEqual(result.verdict, 'minor_variance');
    });

    test(`verifyQuote against fake reference "${ref}" with a REAL fixture's exact text detects misattribution to that REAL passage, never invents new text`, async () => {
      const result = await verifyQuote({ quote: johnFixture.text, claimedReference: ref });
      assert.equal(result.verdict, 'misattribution');
      assert.equal(result.correctReference, 'John 3:16-17');
      // The only text ever surfaced is real, corpus-backed text — nothing fabricated.
      assert.equal(result.canonicalText, null);
    });
  }

  for (const ref of [...GARBAGE_STRINGS, ...AMBIGUOUS_ABBREVIATIONS]) {
    test(`verifyQuote against malformed reference "${ref}" fails safe as not_found, never throws, never invents text`, async () => {
      await assert.doesNotReject(() => verifyQuote({ quote: 'purple elephants dance on tuesdays', claimedReference: ref }));
      const result = await verifyQuote({ quote: 'purple elephants dance on tuesdays', claimedReference: ref });
      assert.equal(result.verdict, 'not_found');
      assert.equal(result.canonicalText, null);
    });
  }

  test('across every fake/malformed reference case above, any canonicalText or correctReference verify_quote ever returns is real, corpus-backed text — never invented', async () => {
    const allRefs = [...ALL_NONEXISTENT_REFERENCES, ...GARBAGE_STRINGS, ...AMBIGUOUS_ABBREVIATIONS];
    const quotes = ['purple elephants dance on tuesdays', johnFixture.text, 'For God so loved the world', ''];
    for (const ref of allRefs) {
      for (const quote of quotes) {
        const result = await verifyQuote({ quote, claimedReference: ref });
        if (result.canonicalText !== null) {
          assert.ok(
            REAL_FIXTURE_TEXTS.has(result.canonicalText),
            `canonicalText for ref="${ref}" quote="${quote}" was not a real fixture text: ${result.canonicalText}`
          );
        }
        if (result.correctReference !== null) {
          assert.ok(
            findByReference(result.correctReference),
            `correctReference "${result.correctReference}" for ref="${ref}" quote="${quote}" does not exist in the fixture corpus`
          );
        }
      }
    }
  });
});
