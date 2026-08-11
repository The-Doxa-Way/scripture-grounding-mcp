/**
 * evals/fake-references.test.js — safety/quality eval: non-existent and
 * malformed Scripture references must NEVER produce invented text. Part of
 * `npm test` (zero-network, fixture mode + injected fakes) — this is a
 * deterministic regression suite. The dated live-probe results this repo
 * once ran against a hosted model are kept in evals/results/.
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
 *   - common abbreviations of REAL books ("Jn 3:16", "1 Cor 13:4" — see
 *     src/usfm.js's BOOK_ABBREVIATIONS, added 2026-07-27 adversarial-review
 *     fix). humanRefToUsfm resolves these successfully (an LLM client
 *     abbreviating a real book is not the same failure mode as a fabricated
 *     reference). Since the whole-Bible BSB corpus landed (src/bible.js,
 *     2026-07-28), keyless mode RESOLVES these to real text — so the
 *     invariant under test for this category is that the text returned is
 *     byte-verifiable against data/bsb.txt itself (checked here with an
 *     independent parse of the raw file, not via src/bible.js), never
 *     invented.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
 * Common, unambiguous abbreviations of REAL books that src/usfm.js's
 * BOOK_ABBREVIATIONS table resolves successfully (see humanRefToUsfm tests
 * below). Since the whole-Bible corpus landed, keyless get_passage serves
 * these with REAL text (source: 'bsb-corpus') — the anti-fabrication
 * invariant for them is verified against an INDEPENDENT parse of
 * data/bsb.txt (RAW_VERSE_BY_REF below), not via src/bible.js, so the test
 * cannot inherit a bug from the module it checks.
 */
const AMBIGUOUS_ABBREVIATIONS = ['Phil 4:13', 'Jn 3:16', 'Gen 1:1', '1 Cor 13:4', 'Ps 23:1'];

/** Full-name bsb.txt key for each abbreviation above. */
const ABBREVIATION_TO_BSB_KEY = {
  'Phil 4:13': 'Philippians 4:13',
  'Jn 3:16': 'John 3:16',
  'Gen 1:1': 'Genesis 1:1',
  '1 Cor 13:4': '1 Corinthians 13:4',
  'Ps 23:1': 'Psalm 23:1',
};

/**
 * Independent ground truth: parse the needed verse lines straight out of the
 * committed raw data/bsb.txt with this file's own three-line parser.
 */
const RAW_BSB = readFileSync(new URL('../data/bsb.txt', import.meta.url), 'utf8');
const RAW_VERSE_BY_REF = Object.fromEntries(
  Object.entries(ABBREVIATION_TO_BSB_KEY).map(([abbr, key]) => {
    const line = RAW_BSB.split('\n').find((l) => l.startsWith(`${key}\t`));
    if (!line) throw new Error(`eval setup: "${key}" not found in data/bsb.txt`);
    return [abbr, line.slice(line.indexOf('\t') + 1).trim()];
  })
);

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

  // Adversarial-review fix (2026-07-27): these are common, unambiguous
  // abbreviations of REAL books ("Jn" = John, "1 Cor" = 1 Corinthians) — an
  // LLM client typing "Jn 3:16" instead of "John 3:16" is not attempting to
  // invent a passage, so humanRefToUsfm now resolves them via
  // BOOK_ABBREVIATIONS rather than failing loud. (Previously this threw
  // "Unrecognized book name" — a real gap, not a safety feature: it is the
  // out-of-corpus and garbage-string cases below, not real-book
  // abbreviations, that must fail loud.)
  const EXPECTED_ABBREVIATION_USFM = {
    'Phil 4:13': 'PHP.4.13',
    'Jn 3:16': 'JHN.3.16',
    'Gen 1:1': 'GEN.1.1',
    '1 Cor 13:4': '1CO.13.4',
    'Ps 23:1': 'PSA.23.1',
  };
  for (const ref of AMBIGUOUS_ABBREVIATIONS) {
    test(`resolves the common abbreviation "${ref}" to its real USFM passage id, rather than failing loud`, () => {
      assert.equal(humanRefToUsfm(ref), EXPECTED_ABBREVIATION_USFM[ref]);
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

  for (const ref of [...ALL_NONEXISTENT_REFERENCES, ...GARBAGE_STRINGS]) {
    test(`getPassage("${ref}") returns text: null with an error, never fabricated text`, async () => {
      const result = await client.getPassage(ref);
      assert.equal(result.text, null);
      assert.equal(result.source, 'fixture');
      assert.equal(typeof result.error, 'string');
      assert.ok(result.error.length > 0);
    });
  }

  // Whole-Bible corpus (2026-07-28): abbreviated real references now resolve
  // keyless. Anti-fabrication invariant: the served text must be verifiable
  // byte-for-byte against this eval's OWN independent parse of data/bsb.txt.
  // (`.includes`, not equality, because a psalm's superscription is split off
  // the raw line by design — the body is a strict suffix of the raw line.)
  for (const ref of AMBIGUOUS_ABBREVIATIONS) {
    test(`getPassage("${ref}") serves REAL corpus text, byte-verifiable against raw data/bsb.txt`, async () => {
      const result = await client.getPassage(ref);
      assert.equal(result.source, 'bsb-corpus');
      assert.ok(typeof result.text === 'string' && result.text.length > 0);
      assert.ok(
        RAW_VERSE_BY_REF[ref].includes(result.text),
        `text for "${ref}" is not contained in the raw bsb.txt verse line:\n  served: ${result.text}\n  raw:    ${RAW_VERSE_BY_REF[ref]}`
      );
    });
  }
});

describe('get_passage (injected-fake live mode) falls back cleanly for non-existent/malformed references, even when a live client is configured', () => {
  for (const ref of OUT_OF_RANGE_REFS) {
    test(`getPassage("${ref}") with a configured client + a fake 404 response falls back to fixture with no text`, async () => {
      const client = createYouVersionClient({ appKey: 'fake-key', fetchImpl: notFoundFetch });
      const result = await client.getPassage(ref);
      assert.equal(result.text, null);
      assert.equal(result.source, 'fixture');
      assert.match(result.note ?? result.error, /YouVersion API/);
    });
  }

  // Abbreviated REAL references reach fetch (valid USFM id); on a live-API
  // 404 the client now falls back to the committed whole-Bible corpus and
  // serves REAL text — disclosed via `note`, verified against this eval's
  // independent raw-bsb.txt parse, never fabricated.
  for (const ref of AMBIGUOUS_ABBREVIATIONS) {
    test(`getPassage("${ref}") with a configured client + a fake 404 response falls back to REAL corpus text with a disclosure note`, async () => {
      const client = createYouVersionClient({ appKey: 'fake-key', fetchImpl: notFoundFetch });
      const result = await client.getPassage(ref);
      assert.equal(result.source, 'bsb-corpus');
      assert.match(result.note, /YouVersion API/);
      assert.ok(
        RAW_VERSE_BY_REF[ref].includes(result.text),
        `fallback text for "${ref}" is not contained in the raw bsb.txt verse line`
      );
    });
  }

  for (const ref of [...NONEXISTENT_BOOK_REFS, ...GARBAGE_STRINGS]) {
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

  for (const ref of GARBAGE_STRINGS) {
    test(`verifyQuote against malformed reference "${ref}" fails safe as not_found, never throws, never invents text`, async () => {
      await assert.doesNotReject(() => verifyQuote({ quote: 'purple elephants dance on tuesdays', claimedReference: ref }));
      const result = await verifyQuote({ quote: 'purple elephants dance on tuesdays', claimedReference: ref });
      assert.equal(result.verdict, 'not_found');
      assert.equal(result.canonicalText, null);
    });
  }

  // Abbreviated REAL references now resolve to real corpus text, so a
  // garbage quote against them is judged against REAL canon: never
  // exact/minor_variance, and the canonicalText surfaced is byte-verifiable
  // against the raw bsb.txt line — real text, not invention.
  for (const ref of AMBIGUOUS_ABBREVIATIONS) {
    test(`verifyQuote against abbreviated real reference "${ref}" judges a garbage quote against REAL corpus text, never invents`, async () => {
      await assert.doesNotReject(() => verifyQuote({ quote: 'purple elephants dance on tuesdays', claimedReference: ref }));
      const result = await verifyQuote({ quote: 'purple elephants dance on tuesdays', claimedReference: ref });
      assert.notEqual(result.verdict, 'exact');
      assert.notEqual(result.verdict, 'minor_variance');
      assert.ok(
        result.canonicalText === null || RAW_VERSE_BY_REF[ref].includes(result.canonicalText),
        `canonicalText for "${ref}" is not contained in the raw bsb.txt verse line`
      );
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
            // Real = a curated fixture's text, or literally present in the
            // raw committed bsb.txt (corpus-served text is always a
            // substring of its source line) — never invented content.
            REAL_FIXTURE_TEXTS.has(result.canonicalText) || RAW_BSB.includes(result.canonicalText),
            `canonicalText for ref="${ref}" quote="${quote}" was not real corpus-backed text: ${result.canonicalText}`
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
