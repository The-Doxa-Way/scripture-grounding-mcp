/**
 * Pure scoring-aggregation logic for the benchmark. Takes arrays of scored
 * items (each already carrying a `verdict` + `similarityScore` produced by
 * src/verify-quote.js — this module does no verification itself, just
 * aggregation) and produces the summary tables benchmark/runner.js and
 * RESULTS.md need. No I/O, no network — safe to unit test directly.
 *
 * @typedef {Object} ScoredItem
 * @property {string} reference
 * @property {string} genre
 * @property {'exact'|'minor_variance'|'misquote'|'misattribution'|'not_found'} verdict
 * @property {number|null} similarityScore
 */

const VERDICTS = ['exact', 'minor_variance', 'misquote', 'misattribution', 'not_found'];

/**
 * Aggregate one condition's scored items into rate/count metrics.
 * @param {ScoredItem[]} items
 */
export function summarizeItems(items) {
  const counts = { exact: 0, minor_variance: 0, misquote: 0, misattribution: 0, not_found: 0 };
  let simSum = 0;
  let simCount = 0;
  for (const item of items) {
    if (VERDICTS.includes(item.verdict)) counts[item.verdict]++;
    if (typeof item.similarityScore === 'number') {
      simSum += item.similarityScore;
      simCount++;
    }
  }
  const n = items.length;
  const rate = (verdict) => (n ? counts[verdict] / n : null);
  return {
    n,
    counts,
    exactRate: rate('exact'),
    minorVarianceRate: rate('minor_variance'),
    misquoteRate: rate('misquote'),
    misattributionRate: rate('misattribution'),
    notFoundRate: rate('not_found'),
    meanSimilarity: simCount ? simSum / simCount : null,
    similarityScoredCount: simCount,
  };
}

/**
 * Group items by their `genre` field and summarize each group.
 * @param {ScoredItem[]} items
 * @returns {Record<string, ReturnType<typeof summarizeItems>>}
 */
export function summarizeByGenre(items) {
  const genres = [...new Set(items.map((i) => i.genre))].sort();
  const out = {};
  for (const genre of genres) {
    out[genre] = summarizeItems(items.filter((i) => i.genre === genre));
  }
  return out;
}

/**
 * The N worst-scoring items, sorted ascending by similarity (a missing/null
 * similarity — e.g. a refusal or empty response, verdict `not_found` with no
 * comparable text — is treated as worse than any numeric score, so refusals
 * surface here too rather than being silently excluded).
 * @param {ScoredItem[]} items
 * @param {number} [n=3]
 */
export function worstExamples(items, n = 3) {
  return [...items]
    .map((item) => ({ item, sortKey: typeof item.similarityScore === 'number' ? item.similarityScore : -1 }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, n)
    .map(({ item }) => item);
}
