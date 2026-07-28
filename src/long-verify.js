/**
 * Chunked verification for long passages (whole chapters, cross-chapter
 * ranges, whole books — "an AI read Romans aloud; was it word-perfect?").
 *
 * The word-level LCS diff in src/diff.js is O(n*m); at book scale
 * (Romans ≈ 9,400 words) a single table would be ~90M cells, so instead the
 * canonical text is compared one chapter-segment at a time against a sliding
 * window of the quote, and the results are aggregated. Segmentation of the
 * QUOTE side is a stated heuristic (the quote carries no chapter markers):
 * each segment claims the window prefix up to its last matched word, and the
 * next segment starts there. A sequential read-through — the actual use case
 * — aligns cleanly; pathological reorderings score low rather than being
 * mis-credited, which is the honest failure direction for a checker.
 *
 * Aggregate similarity is the same Sorensen-Dice-over-LCS measure as
 * src/diff.js's `similarity` (2*matched / (canonicalWords + quoteWords)), so
 * verdict thresholds stay comparable across the short and long paths.
 */
import { wordDiff, summarizeDiff, lcsConsumedPrefix } from './diff.js';
import { tokenize } from './normalize.js';

/** Window slack: how much longer than a segment its quote window may be. */
const WINDOW_FACTOR = 1.35;
const WINDOW_PAD = 20;
/**
 * If a segment's LCS coverage at its expected position falls below this, the
 * segment is treated as OMITTED from the quote: the quote pointer does not
 * advance (the window text belongs to a later segment), no spurious
 * common-word matches are credited, and the caller caps the verdict at
 * "misquote". Without this, one skipped chapter desyncs every segment after
 * it. Ordinary religious prose from a *different* chapter LCS-matches well
 * under 0.5 (common words only), while a merely garbled rendition of the
 * *right* chapter stays well above it.
 */
const OMITTED_COVERAGE_FLOOR = 0.5;
/** Cap on aggregate diff spans returned (matches summarizeDiff's default spirit). */
const MAX_SPANS = 10;
/** Cap on per-segment breakdown entries returned (worst-first beyond it is summarized). */
const MAX_BREAKDOWN = 30;

/**
 * Split a token array into fixed-size pseudo-segments — the fallback when a
 * long canonical text arrives without chapter segments.
 * @param {string[]} tokens
 * @param {string} reference
 * @param {number} [size=800]
 * @returns {Array<{reference: string, tokens: string[]}>}
 */
export function pseudoSegments(tokens, reference, size = 800) {
  const out = [];
  for (let i = 0; i < tokens.length; i += size) {
    out.push({ reference: `${reference} (part ${out.length + 1})`, tokens: tokens.slice(i, i + size) });
  }
  return out;
}

/**
 * @param {Array<{reference: string, text?: string, tokens?: string[]}>} segments
 *   canonical text, one entry per chapter (or pseudo-segment); `tokens` wins
 *   over `text` when both are present
 * @param {string[]} quoteTokens - normalized tokens of the full quote
 * @returns {{
 *   similarityScore: number,
 *   diffSummary: {equalWords: number, replacedWords: number, insertedWords: number, deletedWords: number, spans: Array<{op: string, reference: string, canonical: string, quoted: string}>},
 *   segmentBreakdown: Array<{reference: string, canonicalWords: number, matchedWords: number, coverage: number, omitted?: true}>,
 *   totalCanonicalWords: number,
 *   totalQuoteWords: number,
 *   segmentsCompared: number,
 *   segmentsWithDifferences: number
 * }}
 */
export function chunkedVerify(segments, quoteTokens) {
  let p = 0;
  let equalWords = 0;
  let replacedWords = 0;
  let insertedWords = 0;
  let deletedWords = 0;
  let totalCanonicalWords = 0;
  const spans = [];
  const breakdown = [];

  for (const seg of segments) {
    const segTokens = seg.tokens ?? tokenize(seg.text ?? '');
    totalCanonicalWords += segTokens.length;
    const window = quoteTokens.slice(p, p + Math.ceil(segTokens.length * WINDOW_FACTOR) + WINDOW_PAD);

    // Pass 1: how much of the window belongs to this segment? The SMALLEST
    // window prefix that already contains the full LCS — anything past that
    // is the next chapter's text and must be left for the next segment.
    // (Using wordDiff's backtracking here instead would overshoot: its
    // tie-breaking can pair a segment's final common words — "God", "the" —
    // with occurrences deep in the window tail. See lcsConsumedPrefix.)
    const { lcsLength, consumed } = lcsConsumedPrefix(segTokens, window);

    if (segTokens.length > 0 && lcsLength / segTokens.length < OMITTED_COVERAGE_FLOOR) {
      // Segment not present at this position — mark omitted, credit nothing,
      // and leave the quote pointer where it is for the next segment.
      deletedWords += segTokens.length;
      if (spans.length < MAX_SPANS) {
        spans.push({
          op: 'delete',
          reference: seg.reference,
          canonical: `${segTokens.slice(0, 12).join(' ')}${segTokens.length > 12 ? ' ...' : ''}`,
          quoted: '',
        });
      }
      breakdown.push({ reference: seg.reference, canonicalWords: segTokens.length, matchedWords: 0, coverage: 0, omitted: true });
      continue;
    }

    // Pass 2: the definitive per-segment diff, against exactly the consumed
    // slice — so window tokens that really belong to the NEXT chapter never
    // show up as phantom insertions here.
    const ops = wordDiff(segTokens, window.slice(0, consumed));
    const summary = summarizeDiff(ops, MAX_SPANS);
    equalWords += summary.equalWords;
    replacedWords += summary.replacedWords;
    insertedWords += summary.insertedWords;
    deletedWords += summary.deletedWords;
    for (const span of summary.spans) {
      if (spans.length < MAX_SPANS) spans.push({ ...span, reference: seg.reference });
    }
    breakdown.push({
      reference: seg.reference,
      canonicalWords: segTokens.length,
      matchedWords: summary.equalWords,
      coverage: segTokens.length === 0 ? 1 : summary.equalWords / segTokens.length,
    });
    p += consumed;
  }

  // Quote material past the last matched word of the last segment.
  const trailing = quoteTokens.length - p;
  if (trailing > 0) {
    insertedWords += trailing;
    if (spans.length < MAX_SPANS) {
      spans.push({
        op: 'insert',
        reference: 'after final segment',
        canonical: '',
        quoted: `${quoteTokens.slice(p, p + 12).join(' ')}${trailing > 12 ? ' ...' : ''}`,
      });
    }
  }

  const denom = totalCanonicalWords + quoteTokens.length;
  const similarityScore = denom === 0 ? 1 : (2 * equalWords) / denom;
  const withDiffs = breakdown.filter((b) => b.matchedWords !== b.canonicalWords);
  return {
    similarityScore,
    diffSummary: { equalWords, replacedWords, insertedWords, deletedWords, spans },
    segmentBreakdown:
      breakdown.length <= MAX_BREAKDOWN
        ? breakdown
        : // Keep every segment with a difference (worst first), fill the rest
          // with clean ones up to the cap — never hide a mismatch to save space.
          [...withDiffs.sort((a, b) => a.coverage - b.coverage), ...breakdown.filter((b) => b.matchedWords === b.canonicalWords)].slice(0, MAX_BREAKDOWN),
    totalCanonicalWords,
    totalQuoteWords: quoteTokens.length,
    segmentsCompared: segments.length,
    segmentsWithDifferences: withDiffs.length,
  };
}
