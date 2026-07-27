#!/usr/bin/env node
/**
 * Dumps a small, representative set of verify_quote cases (JS implementation,
 * unmodified) to notebook/test-vectors.json, so the Kaggle submission
 * notebook's Python port of normalize/diff/verify-quote can assert equality
 * against ground truth produced by the actual shipped Node code — proving
 * the Python port is faithful, not just "looks right."
 *
 * Covers all six verify_quote verdicts (including different_translation —
 * src/alt-translations.js's closest-canon detection), plus normalization-
 * robustness cases (curly quotes, inline verse numbers, mixed case) and a
 * named KJV-vs-BSB wording case, mirroring tests/verify-quote.test.js.
 *
 * Run: node scripts/dump-test-vectors.js
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifyQuote } from '../src/verify-quote.js';
import { findByReference } from '../src/fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'notebook', 'test-vectors.json');

const johnFixture = findByReference('John 3:16-17');
const philFixture = findByReference('Philippians 4:13');
const jeremiahFixture = findByReference('Jeremiah 29:11');

const cases = [
  {
    label: 'exact quote against its correct reference',
    input: { quote: philFixture.text, claimedReference: 'Philippians 4:13' },
  },
  {
    label: 'curly quotes + inline verse numbers + mixed case + extra whitespace (normalization robustness)',
    input: {
      quote:
        '“16 FOR   god so loved the world that He gave His one and only Son, that everyone ' +
        'who believes in Him shall not perish but have eternal life. 17 For God did not send ' +
        'His Son into the world to condemn   the world, but to save the world through Him.”',
      claimedReference: 'John 3:16-17',
    },
  },
  {
    label: 'one-word substitution ("declares" -> "says") lands just above 0.95: minor_variance',
    input: {
      quote: jeremiahFixture.text.replace('declares', 'says'),
      claimedReference: 'Jeremiah 29:11',
    },
  },
  {
    label: 'verbatim KJV wording of Philippians 4:13, claimed as BSB: different_translation, not misquote',
    input: {
      quote: 'I can do all things through Christ which strengtheneth me.',
      claimedReference: 'Philippians 4:13',
    },
  },
  {
    label: 'materially reworded paraphrase attributed to its real reference: misquote',
    input: {
      quote:
        'I know the good plans I have in store for you, so says the Lord, plans to bless you and not to hurt you, giving you great hope for tomorrow.',
      claimedReference: 'Jeremiah 29:11',
    },
  },
  {
    label: 'exact quote pinned to the wrong (but real, in-corpus) reference: misattribution',
    input: { quote: johnFixture.text, claimedReference: 'Psalm 23:1-6' },
  },
  {
    label: 'exact quote attributed to a reference outside the corpus: misattribution against best in-corpus match',
    input: { quote: philFixture.text, claimedReference: 'Zephaniah 3:99' },
  },
  {
    label: 'unrelated/garbage quote against an in-corpus reference: not_found (fail-safe, no crash)',
    input: { quote: 'purple elephants dance on tuesdays in the marketplace', claimedReference: 'Philippians 4:13' },
  },
  {
    label: 'refusal-shaped text (real ungrounded benchmark output, Hebrews 13:5): not_found',
    input: {
      quote:
        "I'm here to help, but I can't respond to that request. If you're unsure why, try asking it another way — I'd love to assist however I can!",
      claimedReference: 'Hebrews 13:5',
    },
  },
  {
    label: 'real ungrounded benchmark output, Psalm 46:1-3 (dropped superscription + near-synonym swaps): misquote',
    input: {
      quote:
        'God is our refuge and strength, an ever-present help in trouble. Therefore we will not fear, though the earth is transformed and the mountains are moved into the heart of the sea, though their waters roar and foam and the mountains quake in the surge.',
      claimedReference: 'Psalm 46:1-3',
    },
  },
];

const vectors = [];
for (const c of cases) {
  const result = await verifyQuote(c.input);
  vectors.push({
    label: c.label,
    input: c.input,
    expected: {
      verdict: result.verdict,
      similarityScore: result.similarityScore === null ? null : Math.round(result.similarityScore * 10000) / 10000,
      correctReference: result.correctReference,
    },
  });
}

writeFileSync(OUT_PATH, JSON.stringify(vectors, null, 2) + '\n');
console.log(`Wrote ${vectors.length} test vectors to ${OUT_PATH}`);
for (const v of vectors) {
  console.log(`  - ${v.expected.verdict.padEnd(15)} sim=${v.expected.similarityScore}  ${v.label}`);
}
