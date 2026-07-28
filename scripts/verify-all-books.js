#!/usr/bin/env node
/**
 * Whole-canon proof: for every one of the 66 books, retrieve the complete
 * book keyless from the committed BSB corpus, verify a full read-through as
 * `exact` (similarity exactly 1), then plant a one-word corruption mid-book
 * and confirm it is never verified as exact. This is the claim behind the
 * demo video's "we verified a perfect read-through of all sixty-six books,
 * Genesis to Revelation. Test it yourself." — this script is the test.
 *
 * Run: npm run test:books   (~40s; kept out of the default `npm test` suite
 * for speed — the seeded property tests in tests/long-verify-property.test.js
 * cover the same invariants on generated samples in CI time.)
 */
import { parseHumanRef } from '../src/usfm.js';
import { loadBible, resolveRef, getBibleText } from '../src/bible.js';
import { verifyQuote } from '../src/verify-quote.js';

const books = [...loadBible().byCode.values()].map((b) => b.name);

function lookup(reference) {
  const got = getBibleText(resolveRef(parseHumanRef(reference)));
  return {
    reference: got.reference,
    text: got.text,
    translation: 'BSB (Berean Standard Bible, public domain)',
    source: 'bsb-corpus',
    segments: got.segments,
  };
}
const deps = { canonicalLookup: async (r) => lookup(r) };

const t0 = Date.now();
let failures = 0;

for (const book of books) {
  const canon = lookup(book);
  const exact = await verifyQuote({ quote: canon.text, claimedReference: book }, deps);
  const readThroughOk = exact.verdict === 'exact' && exact.similarityScore === 1;

  const tokens = canon.text.split(/\s+/);
  tokens[Math.floor(tokens.length / 2)] = 'zzcorrupted';
  const corrupted = await verifyQuote({ quote: tokens.join(' '), claimedReference: book }, deps);
  const corruptionCaught = corrupted.verdict !== 'exact' && corrupted.similarityScore < 1;

  const ok = readThroughOk && corruptionCaught;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${book.padEnd(16)} read-through: ${exact.verdict} (${exact.similarityScore})` +
      `  corruption: ${corrupted.verdict} (${corrupted.similarityScore.toFixed(5)})`
  );
}

const seconds = ((Date.now() - t0) / 1000).toFixed(1);
if (failures === 0) {
  console.log(`\nAll 66 books: perfect word-for-word read-through verified and planted corruption caught, in ${seconds}s.`);
} else {
  console.error(`\n${failures} book(s) FAILED in ${seconds}s.`);
  process.exit(1);
}
