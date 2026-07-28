/**
 * Word-level diff and similarity scoring, implemented from scratch (no diff
 * library dependency) via a classic longest-common-subsequence (LCS) dynamic
 * program over word-token arrays. This is O(n*m) in word count, which is fine
 * at Scripture-verse scale (tens of words), and is deterministic/auditable —
 * important for a tool whose whole job is trustworthy measurement.
 */

/**
 * Compute the LCS table for two token arrays.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number[][]} dp table, dp[i][j] = LCS length of a[0..i), b[0..j)
 */
function lcsTable(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/**
 * @typedef {Object} DiffOp
 * @property {'equal'|'replace'|'insert'|'delete'} op
 * @property {string[]} a - tokens from the first (canonical) sequence involved
 * @property {string[]} b - tokens from the second (quoted) sequence involved
 */

/**
 * Produce a word-level diff between two token arrays by backtracking through
 * the LCS table. Runs of consecutive non-equal tokens on both sides are
 * merged into a single 'replace' op (rather than emitting delete+insert
 * pairs) so the diff summary reads naturally.
 * @param {string[]} a - canonical tokens
 * @param {string[]} b - candidate/quoted tokens
 * @returns {DiffOp[]}
 */
export function wordDiff(a, b) {
  const dp = lcsTable(a, b);
  /** @type {{type: 'equal'|'a'|'b', tok: string}[]} */
  const raw = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      raw.push({ type: 'equal', tok: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      raw.push({ type: 'a', tok: a[i - 1] });
      i--;
    } else {
      raw.push({ type: 'b', tok: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    raw.push({ type: 'a', tok: a[i - 1] });
    i--;
  }
  while (j > 0) {
    raw.push({ type: 'b', tok: b[j - 1] });
    j--;
  }
  raw.reverse();

  // Merge adjacent runs into DiffOp[], combining adjacent a/b-only runs into 'replace'.
  /** @type {DiffOp[]} */
  const ops = [];
  let idx = 0;
  while (idx < raw.length) {
    if (raw[idx].type === 'equal') {
      const tokens = [];
      while (idx < raw.length && raw[idx].type === 'equal') {
        tokens.push(raw[idx].tok);
        idx++;
      }
      ops.push({ op: 'equal', a: tokens, b: tokens });
    } else {
      const aTokens = [];
      const bTokens = [];
      while (idx < raw.length && raw[idx].type !== 'equal') {
        if (raw[idx].type === 'a') aTokens.push(raw[idx].tok);
        else bTokens.push(raw[idx].tok);
        idx++;
      }
      if (aTokens.length && bTokens.length) {
        ops.push({ op: 'replace', a: aTokens, b: bTokens });
      } else if (aTokens.length) {
        ops.push({ op: 'delete', a: aTokens, b: [] });
      } else {
        ops.push({ op: 'insert', a: [], b: bTokens });
      }
    }
  }
  return ops;
}

/**
 * For sequential chunked alignment (src/long-verify.js): the length of the
 * SMALLEST prefix of `b` that already contains a full-length LCS with `a`,
 * plus that LCS length. Backtracking through the LCS table (wordDiff) is
 * tie-broken arbitrarily, so it can pair a's final tokens with occurrences
 * deep in b's tail — overshooting a chapter boundary when b's tail is
 * really the NEXT chapter's text. dp[n][j] is monotone in j, so the minimal
 * j with dp[n][j] === dp[n][m] is exactly "everything of a that can match
 * has matched by here" — the right hand-off point to the next segment.
 * @param {string[]} a - canonical segment tokens
 * @param {string[]} b - quote window tokens
 * @returns {{lcsLength: number, consumed: number}}
 */
export function lcsConsumedPrefix(a, b) {
  if (a.length === 0 || b.length === 0) return { lcsLength: 0, consumed: 0 };
  const dp = lcsTable(a, b);
  const lcsLength = dp[a.length][b.length];
  let consumed = 0;
  while (consumed < b.length && dp[a.length][consumed] < lcsLength) consumed++;
  return { lcsLength, consumed };
}

/**
 * Word-level similarity score between two token arrays, as a Sorensen-Dice
 * coefficient over the LCS: 2*|LCS| / (|a| + |b|). Returns 1.0 for two empty
 * arrays (vacuously identical) and 0.0 if only one side is empty.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} similarity in [0, 1]
 */
export function similarity(a, b) {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const dp = lcsTable(a, b);
  const lcsLen = dp[a.length][b.length];
  return (2 * lcsLen) / (a.length + b.length);
}

/**
 * Build a compact, human-readable summary of a word diff: counts of each op
 * type plus the actual replaced/inserted/deleted word spans, capped so huge
 * mismatches don't blow up the response.
 * @param {DiffOp[]} ops
 * @param {number} [maxSpans=10]
 * @returns {{equalWords: number, replacedWords: number, insertedWords: number, deletedWords: number, spans: Array<{op: string, canonical: string, quoted: string}>}}
 */
export function summarizeDiff(ops, maxSpans = 10) {
  let equalWords = 0;
  let replacedWords = 0;
  let insertedWords = 0;
  let deletedWords = 0;
  const spans = [];
  for (const op of ops) {
    if (op.op === 'equal') {
      equalWords += op.a.length;
      continue;
    }
    if (op.op === 'replace') replacedWords += Math.max(op.a.length, op.b.length);
    if (op.op === 'insert') insertedWords += op.b.length;
    if (op.op === 'delete') deletedWords += op.a.length;
    if (spans.length < maxSpans) {
      spans.push({ op: op.op, canonical: op.a.join(' '), quoted: op.b.join(' ') });
    }
  }
  return { equalWords, replacedWords, insertedWords, deletedWords, spans };
}
