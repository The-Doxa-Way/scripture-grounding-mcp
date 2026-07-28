/**
 * Core logic for the verify_quote tool: given a claimed quote + reference,
 * decide whether the quote is exact, a minor variance, a misquote, pinned to
 * the wrong reference (misattribution), an accurate quote of a DIFFERENT
 * translation than requested (different_translation — see
 * src/alt-translations.js), or unverifiable (not_found).
 *
 * Canonical text for the claimed reference is resolved via an injectable
 * `canonicalLookup(reference, version)` (defaults to the BSB fixture
 * corpus). In the MCP server (src/index.js), this is wired to the
 * YouVersion client's getPassage, so verify_quote checks against the live
 * API when a key is configured and the BSB fixtures otherwise. Either way,
 * cross-reference misattribution search (findBestMatch) always runs
 * against the local fixture corpus, since that is the only "search every
 * passage" corpus this project has — a documented limitation, not a silent
 * gap (see benchmark/METHODOLOGY.md).
 */
import { tokenize } from './normalize.js';
import { wordDiff, similarity, summarizeDiff } from './diff.js';
import { findByReference, findBestMatch } from './fixtures.js';
import { splitSuperscription } from './superscription.js';
import { findClosestCanon, findClosestCanonWithRemote } from './alt-translations.js';
import { chunkedVerify, pseudoSegments } from './long-verify.js';
import { parseHumanRef } from './usfm.js';
import { resolveRef, getBibleText } from './bible.js';

/** Similarity threshold above which a non-exact quote is "minor_variance" rather than "misquote". */
const MINOR_VARIANCE_THRESHOLD = 0.95;
/** Similarity floor below which we say "not_found" rather than "misquote" (quote doesn't meaningfully resemble the claimed passage). */
const MISQUOTE_FLOOR = 0.3;
/** Minimum absolute similarity a competing passage must reach to be considered a misattribution candidate. */
const MISATTRIBUTION_MIN_SCORE = 0.7;
/** How much better a competing passage's score must be than the claimed passage's score to count as misattribution. */
const MISATTRIBUTION_MARGIN = 0.15;
/**
 * Above this many LCS table cells (canonical tokens x quote tokens) the
 * single-table diff would be too big (a whole book is ~9,400 words -> ~90M
 * cells), so verification switches to the chunked chapter-by-chapter path
 * (src/long-verify.js). 2M cells keeps the largest single chapter
 * (Psalm 119, ~2,400 words) comfortably under memory pressure.
 */
const MAX_LCS_CELLS = 2_000_000;
/**
 * Above this many quote tokens, the verse-scale corpus searches
 * (misattribution across the 34 fixtures, closest-canon across BSB/WEB/KJV)
 * are skipped: a chapter- or book-length quote can never legitimately match
 * a verse-scale fixture, so running them would only burn time to say
 * nothing. Skipping is disclosed in the reason string.
 */
const LONG_QUOTE_TOKENS = 500;

/**
 * @typedef {'exact'|'minor_variance'|'misquote'|'misattribution'|'not_found'|'different_translation'} Verdict
 */

/**
 * Classify a similarity score into a verdict using the same thresholds as
 * the main claimed-translation comparison — reused for `verdictAgainstClosest`
 * (see `findClosestCanon`) so a caller can tell at a glance whether the
 * quote is exact/minor_variance/misquote/not_found *against the closest
 * translation this project ships locally*, independent of the requested one.
 * @param {number} score
 * @returns {'exact'|'minor_variance'|'misquote'|'not_found'}
 */
function classifyVerdict(score) {
  // Dice-over-LCS equals exactly 1 iff the two token sequences are
  // identical, so "exact" is a true word-for-word claim at any length. (The
  // old >= 0.999 cutoff was indistinguishable at verse scale, but at book
  // scale it would let ~9 wrong words through as "exact".)
  if (score === 1) return 'exact';
  if (score > MINOR_VARIANCE_THRESHOLD) return 'minor_variance';
  if (score >= MISQUOTE_FLOOR) return 'misquote';
  return 'not_found';
}

/**
 * Default canonical-text lookup: the curated BSB fixtures first (exact
 * reference match), then the committed whole-Bible BSB corpus (src/bible.js)
 * — so keyless callers can verify against ANY reference, up to a whole book.
 * @param {string} reference
 * @returns {Promise<{reference: string, text: string, translation: string, source: string, segments?: Array<{reference: string, text: string}>}|null>}
 */
async function defaultCanonicalLookup(reference) {
  const fixture = findByReference(reference);
  if (fixture) {
    return { reference: fixture.reference, text: fixture.text, translation: fixture.translation, source: 'fixture' };
  }
  try {
    const got = getBibleText(resolveRef(parseHumanRef(reference)));
    return {
      reference: got.reference,
      text: got.text,
      translation: 'BSB (Berean Standard Bible, public domain)',
      source: 'bsb-corpus',
      segments: got.segments,
    };
  } catch {
    return null;
  }
}

/**
 * @param {{quote: string, claimedReference: string, version?: string}} input
 * @param {{
 *   canonicalLookup?: (reference: string, version?: string) => Promise<{reference: string, text: string, translation: string, source: string}|null>,
 *   multiVersion?: {fetchVersion: (reference: string, versionId: string) => Promise<object>, versionIds?: string[]}
 * }} [deps] - `deps.multiVersion` is flag-gated (YOUVERSION_MULTI_VERSION=1 + YOUVERSION_APP_KEY —
 *   see src/index.js) and, when present, additionally checks the claimed reference against a
 *   configurable list of licensed YouVersion translations fetched live via the deployer's own key
 *   (src/alt-translations.js's findClosestCanonWithRemote). Omitted (the default), this function is
 *   byte-identical to its pre-2026-07-27 local-only (BSB/WEB/KJV) behavior.
 * @returns {Promise<{
 *   verdict: Verdict,
 *   claimedReference: string,
 *   canonicalText: string|null,
 *   canonicalTranslation: string|null,
 *   canonicalSource: string|null,
 *   similarityScore: number|null,
 *   diffSummary: object|null,
 *   correctReference: string|null,
 *   reason: string,
 *   closestTranslation: string|null,
 *   similarityToClosest: number|null,
 *   verdictAgainstClosest: string|null,
 *   similarityToRequested: number|null,
 *   remoteVersionsChecked: Array<{versionId: string, translation: string}|{versionId: string, skipped: true, note: string}>|null
 * }>}
 */
export async function verifyQuote({ quote, claimedReference, version }, deps = {}) {
  const canonicalLookup = deps.canonicalLookup ?? defaultCanonicalLookup;
  const multiVersion = deps.multiVersion;

  if (typeof quote !== 'string' || quote.trim().length === 0) {
    return {
      verdict: 'not_found',
      claimedReference: claimedReference ?? null,
      canonicalText: null,
      canonicalTranslation: null,
      canonicalSource: null,
      similarityScore: null,
      diffSummary: null,
      correctReference: null,
      reason: 'Empty or missing quote text — nothing to verify.',
      closestTranslation: null,
      similarityToClosest: null,
      verdictAgainstClosest: null,
      similarityToRequested: null,
      remoteVersionsChecked: null,
    };
  }
  if (typeof claimedReference !== 'string' || claimedReference.trim().length === 0) {
    return {
      verdict: 'not_found',
      claimedReference: null,
      canonicalText: null,
      canonicalTranslation: null,
      canonicalSource: null,
      similarityScore: null,
      diffSummary: null,
      correctReference: null,
      reason: 'Empty or missing claimed_reference — nothing to verify against.',
      closestTranslation: null,
      similarityToClosest: null,
      verdictAgainstClosest: null,
      similarityToRequested: null,
      remoteVersionsChecked: null,
    };
  }

  // Fixture canonical text no longer includes a psalm's superscription (see
  // src/superscription.js) — a quote is not the passage's own musical/
  // liturgical heading, so strip a leading superscription from the QUOTE
  // side too before comparing. This keeps both directions symmetric: a quote
  // that omits the header compares as if it never existed (the common case),
  // and a quote that includes it (e.g. this project's own `grounded`
  // benchmark condition, which retrieves and echoes the full verse-1 line)
  // still verifies exact rather than being penalized for extra words the
  // canonical text no longer carries.
  const comparableQuote = splitSuperscription(quote).body || quote;
  const quoteTokens = tokenize(comparableQuote);
  const claimedCanonical = await canonicalLookup(claimedReference, version);

  if (!claimedCanonical || !claimedCanonical.text) {
    // We still search the fixture corpus for a best match, since the quote
    // might be a real, correctly-worded verse that's simply pinned to a
    // reference we couldn't resolve (or to a bogus one). (Skipped for
    // chapter/book-length quotes — they can't match a verse-scale fixture.)
    const best = quoteTokens.length > LONG_QUOTE_TOKENS ? null : findBestMatch(comparableQuote);
    if (best && best.score >= MISATTRIBUTION_MIN_SCORE) {
      return {
        verdict: 'misattribution',
        claimedReference,
        canonicalText: null,
        canonicalTranslation: null,
        canonicalSource: null,
        similarityScore: null,
        diffSummary: null,
        correctReference: best.reference,
        reason: `"${claimedReference}" could not be resolved to canonical text, but the quote closely matches ${best.reference} (similarity ${best.score.toFixed(2)}).`,
        closestTranslation: null,
        similarityToClosest: null,
        verdictAgainstClosest: null,
        similarityToRequested: null,
        remoteVersionsChecked: null,
      };
    }
    return {
      verdict: 'not_found',
      claimedReference,
      canonicalText: null,
      canonicalTranslation: null,
      canonicalSource: null,
      similarityScore: null,
      diffSummary: null,
      correctReference: null,
      reason: `No canonical text available for "${claimedReference}" (not resolvable via YouVersion API or the fixture corpus).`,
      closestTranslation: null,
      similarityToClosest: null,
      verdictAgainstClosest: null,
      similarityToRequested: null,
      remoteVersionsChecked: null,
    };
  }

  const canonicalTokens = tokenize(claimedCanonical.text);

  // Long-passage path: a single LCS table would be too large (whole
  // chapters/books — "an AI read Romans aloud; was it word-perfect?"), so
  // verify chapter-by-chapter via src/long-verify.js instead.
  if (canonicalTokens.length * quoteTokens.length > MAX_LCS_CELLS) {
    return verifyLongQuote(claimedCanonical, canonicalTokens, quoteTokens);
  }

  const claimedScore = similarity(canonicalTokens, quoteTokens);
  const ops = wordDiff(canonicalTokens, quoteTokens);
  const diffSummary = summarizeDiff(ops);

  // A chapter/book-length quote can never legitimately match the
  // verse-scale fixture corpus or alt-translation fixtures — skip those
  // searches (disclosed in the reason) rather than spending time on a
  // meaningless scan.
  const skipCorpusSearches = quoteTokens.length > LONG_QUOTE_TOKENS;

  // Closest-canon comparison across every translation this project ships
  // LOCALLY (BSB/WEB/KJV — see src/alt-translations.js) — computed
  // unconditionally so a caller can always see which translation the quote
  // actually matches best, not just whether it matched the requested one.
  // When deps.multiVersion is present (flag-gated — see src/index.js), this
  // additionally fetches the reference across a configurable list of
  // licensed YouVersion translations via the deployer's own key and folds
  // them into the same comparison; omitted, behavior is byte-identical to
  // the local-only path.
  let closest = null;
  let remoteVersionsChecked = null;
  if (!skipCorpusSearches) {
    if (multiVersion?.fetchVersion) {
      const { best, remoteResults } = await findClosestCanonWithRemote(claimedCanonical.reference, quoteTokens, multiVersion);
      closest = best;
      remoteVersionsChecked = remoteResults;
    } else {
      closest = findClosestCanon(claimedCanonical.reference, quoteTokens);
    }
  }
  const closestTranslation = closest?.translation ?? null;
  const similarityToClosest = closest?.score ?? null;
  const verdictAgainstClosest = closest ? classifyVerdict(closest.score) : null;

  // Check whether some OTHER passage in the (fixture) corpus matches the
  // quote meaningfully better than the claimed one — that's misattribution,
  // regardless of how well/poorly the quote matches its claimed home.
  const best = skipCorpusSearches ? null : findBestMatch(comparableQuote);
  if (
    best &&
    best.reference.toLowerCase() !== claimedCanonical.reference.toLowerCase() &&
    best.score >= MISATTRIBUTION_MIN_SCORE &&
    best.score >= claimedScore + MISATTRIBUTION_MARGIN
  ) {
    return {
      verdict: 'misattribution',
      claimedReference: claimedCanonical.reference,
      canonicalText: claimedCanonical.text,
      canonicalTranslation: claimedCanonical.translation,
      canonicalSource: claimedCanonical.source,
      similarityScore: claimedScore,
      diffSummary,
      correctReference: best.reference,
      reason: `Quote matches ${best.reference} (similarity ${best.score.toFixed(2)}) much better than the claimed reference ${claimedCanonical.reference} (similarity ${claimedScore.toFixed(2)}).`,
      closestTranslation,
      similarityToClosest,
      verdictAgainstClosest,
      similarityToRequested: claimedScore,
      remoteVersionsChecked,
    };
  }

  // The quote clearly misses the REQUESTED translation but is a close
  // (>=0.95) match for a DIFFERENT translation this project ships locally —
  // that's a version-fidelity issue ("accurate KJV quote, but BSB was
  // requested"), not a wording error, so it gets its own verdict rather than
  // being flatly scored as a misquote of the requested translation.
  if (
    claimedScore < MINOR_VARIANCE_THRESHOLD &&
    closest &&
    closest.score >= MINOR_VARIANCE_THRESHOLD &&
    closest.translation !== claimedCanonical.translation
  ) {
    return {
      verdict: 'different_translation',
      claimedReference: claimedCanonical.reference,
      canonicalText: claimedCanonical.text,
      canonicalTranslation: claimedCanonical.translation,
      canonicalSource: claimedCanonical.source,
      similarityScore: claimedScore,
      diffSummary,
      correctReference: null,
      reason:
        `Quote does not match the requested ${claimedCanonical.translation} wording (similarity ${claimedScore.toFixed(2)}), ` +
        `but matches ${closestTranslation} closely (similarity ${similarityToClosest.toFixed(2)}) — likely an accurate quote ` +
        'of a different translation than requested.',
      closestTranslation,
      similarityToClosest,
      verdictAgainstClosest,
      similarityToRequested: claimedScore,
      remoteVersionsChecked,
    };
  }

  let verdict;
  let reason;
  if (claimedScore === 1) {
    // Dice-over-LCS is exactly 1 iff the token sequences are identical (see
    // classifyVerdict) — "word-for-word" stays literally true at any length.
    verdict = 'exact';
    reason = 'Normalized quote matches the canonical text word-for-word.';
  } else if (claimedScore > MINOR_VARIANCE_THRESHOLD) {
    verdict = 'minor_variance';
    reason = `Quote is a close paraphrase/variant of the canonical text (similarity ${claimedScore.toFixed(2)}).`;
  } else if (claimedScore >= MISQUOTE_FLOOR) {
    verdict = 'misquote';
    reason = `Quote diverges materially from the canonical text (similarity ${claimedScore.toFixed(2)}).`;
  } else {
    verdict = 'not_found';
    reason = `Quote does not meaningfully resemble ${claimedCanonical.reference} or any other passage in the corpus (best similarity ${claimedScore.toFixed(2)}).`;
  }
  if (skipCorpusSearches) {
    reason +=
      ' Corpus misattribution and translation comparison are verse/passage-scale checks and were skipped for this long quote.';
  }

  return {
    verdict,
    claimedReference: claimedCanonical.reference,
    canonicalText: claimedCanonical.text,
    canonicalTranslation: claimedCanonical.translation,
    canonicalSource: claimedCanonical.source,
    similarityScore: claimedScore,
    diffSummary,
    correctReference: null,
    reason,
    closestTranslation,
    similarityToClosest,
    verdictAgainstClosest,
    similarityToRequested: claimedScore,
    remoteVersionsChecked,
  };
}

/**
 * Cap on canonicalText echoed back by the long-passage path — a whole book
 * is ~50KB and the caller already holds the quote; segments/reason carry the
 * verdict evidence instead.
 */
const LONG_CANONICAL_ECHO_MAX_CHARS = 20_000;

/**
 * Chunked verification for chapter/book-scale references. Uses the
 * canonical lookup's per-chapter `segments` when present (whole-Bible
 * corpus / stitched API responses provide them); otherwise falls back to
 * fixed-size pseudo-segments over the canonical tokens.
 * @param {{reference: string, text: string, translation: string, source: string, segments?: Array<{reference: string, text: string}>}} claimedCanonical
 * @param {string[]} canonicalTokens
 * @param {string[]} quoteTokens
 */
function verifyLongQuote(claimedCanonical, canonicalTokens, quoteTokens) {
  const segments =
    Array.isArray(claimedCanonical.segments) && claimedCanonical.segments.length > 1
      ? claimedCanonical.segments.map((s) => ({ reference: s.reference, tokens: tokenize(s.text) }))
      : pseudoSegments(canonicalTokens, claimedCanonical.reference);
  const result = chunkedVerify(segments, quoteTokens);
  let verdict = classifyVerdict(result.similarityScore);
  const omittedSegments = result.segmentBreakdown.filter((b) => b.omitted).map((b) => b.reference);
  if (omittedSegments.length > 0 && (verdict === 'exact' || verdict === 'minor_variance')) {
    // A wholesale missing chapter is material divergence no matter how well
    // the rest matched — never let raw similarity soften it.
    verdict = 'misquote';
  }

  const worst = result.segmentBreakdown
    .filter((b) => b.matchedWords !== b.canonicalWords)
    .slice(0, 3)
    .map((b) => `${b.reference} (${Math.round(b.coverage * 100)}% matched)`);
  const reason =
    `Long-passage comparison, chunked across ${result.segmentsCompared} segment(s): ` +
    `${result.diffSummary.equalWords}/${result.totalCanonicalWords} canonical words matched ` +
    `(similarity ${result.similarityScore.toFixed(4)}). ` +
    (result.segmentsWithDifferences === 0
      ? 'Every segment matched word-for-word. '
      : `${result.segmentsWithDifferences} segment(s) differ${worst.length ? ` — e.g. ${worst.join(', ')}` : ''}. `) +
    (omittedSegments.length > 0
      ? `OMITTED from the quote entirely: ${omittedSegments.join(', ')} (verdict capped at misquote). `
      : '') +
    'Corpus misattribution and translation comparison are verse/passage-scale checks and are skipped at this length; ' +
    'quote-side segmentation is heuristic (sequential alignment), so treat per-segment boundaries as approximate.';

  return {
    verdict,
    claimedReference: claimedCanonical.reference,
    canonicalText: claimedCanonical.text.length <= LONG_CANONICAL_ECHO_MAX_CHARS ? claimedCanonical.text : null,
    canonicalTranslation: claimedCanonical.translation,
    canonicalSource: claimedCanonical.source,
    similarityScore: result.similarityScore,
    diffSummary: result.diffSummary,
    correctReference: null,
    reason,
    closestTranslation: null,
    similarityToClosest: null,
    verdictAgainstClosest: null,
    similarityToRequested: result.similarityScore,
    remoteVersionsChecked: null,
    comparisonMode: 'chunked',
    segmentBreakdown: result.segmentBreakdown,
    segmentsCompared: result.segmentsCompared,
    segmentsWithDifferences: result.segmentsWithDifferences,
  };
}
