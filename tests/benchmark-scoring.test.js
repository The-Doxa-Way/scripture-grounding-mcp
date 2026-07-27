import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeItems, summarizeByGenre, worstExamples } from '../benchmark/lib/scoring.js';

function item(overrides) {
  return { reference: 'X 1:1', genre: 'epistle', verdict: 'exact', similarityScore: 1, ...overrides };
}

test('summarizeItems counts verdicts and computes rates over n', () => {
  const items = [
    item({ verdict: 'exact', similarityScore: 1 }),
    item({ verdict: 'exact', similarityScore: 1 }),
    item({ verdict: 'minor_variance', similarityScore: 0.97 }),
    item({ verdict: 'misquote', similarityScore: 0.5 }),
    item({ verdict: 'misattribution', similarityScore: 0.8 }),
    item({ verdict: 'not_found', similarityScore: null }),
  ];
  const summary = summarizeItems(items);
  assert.equal(summary.n, 6);
  assert.equal(summary.counts.exact, 2);
  assert.equal(summary.counts.minor_variance, 1);
  assert.equal(summary.counts.misquote, 1);
  assert.equal(summary.counts.misattribution, 1);
  assert.equal(summary.counts.not_found, 1);
  assert.equal(summary.exactRate, 2 / 6);
  assert.equal(summary.misquoteRate, 1 / 6);
  assert.equal(summary.notFoundRate, 1 / 6);
  // mean similarity only averages over items with a numeric score (5 of 6; not_found's null is excluded)
  assert.equal(summary.similarityScoredCount, 5);
  assert.ok(Math.abs(summary.meanSimilarity - (1 + 1 + 0.97 + 0.5 + 0.8) / 5) < 1e-9);
});

test('summarizeItems on an empty array returns null rates rather than NaN/dividing by zero', () => {
  const summary = summarizeItems([]);
  assert.equal(summary.n, 0);
  assert.equal(summary.exactRate, null);
  assert.equal(summary.meanSimilarity, null);
});

test('summarizeByGenre groups items per genre and each group sums back to the whole', () => {
  const items = [
    item({ genre: 'gospel', verdict: 'exact' }),
    item({ genre: 'gospel', verdict: 'misquote', similarityScore: 0.4 }),
    item({ genre: 'epistle', verdict: 'exact' }),
  ];
  const byGenre = summarizeByGenre(items);
  assert.deepEqual(Object.keys(byGenre).sort(), ['epistle', 'gospel']);
  assert.equal(byGenre.gospel.n, 2);
  assert.equal(byGenre.gospel.counts.exact, 1);
  assert.equal(byGenre.gospel.counts.misquote, 1);
  assert.equal(byGenre.epistle.n, 1);
  assert.equal(byGenre.epistle.counts.exact, 1);
});

test('worstExamples sorts ascending by similarity and returns the N lowest', () => {
  const items = [
    item({ reference: 'A', similarityScore: 0.9 }),
    item({ reference: 'B', similarityScore: 0.2 }),
    item({ reference: 'C', similarityScore: 0.6 }),
    item({ reference: 'D', similarityScore: 0.1 }),
  ];
  const worst = worstExamples(items, 2);
  assert.deepEqual(worst.map((i) => i.reference), ['D', 'B']);
});

test('worstExamples treats a null similarity (refusal/not_found) as worse than any numeric score', () => {
  const items = [
    item({ reference: 'A', similarityScore: 0.05 }),
    item({ reference: 'B', similarityScore: null, verdict: 'not_found' }),
    item({ reference: 'C', similarityScore: 0.5 }),
  ];
  const worst = worstExamples(items, 1);
  assert.equal(worst[0].reference, 'B');
});
