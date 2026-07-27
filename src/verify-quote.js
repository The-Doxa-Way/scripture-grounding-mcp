/**
 * Core logic for the verify_quote tool: given a claimed quote + reference,
 * decide whether the quote is exact, a minor variance, a misquote, pinned to
 * the wrong reference (misattribution), or unverifiable (not_found).
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

/** Similarity threshold above which a non-exact quote is "minor_variance" rather than "misquote". */
const MINOR_VARIANCE_THRESHOLD = 0.95;
/** Similarity floor below which we say "not_found" rather than "misquote" (quote doesn't meaningfully resemble the claimed passage). */
const MISQUOTE_FLOOR = 0.3;
/** Minimum absolute similarity a competing passage must reach to be considered a misattribution candidate. */
const MISATTRIBUTION_MIN_SCORE = 0.7;
/** How much better a competing passage's score must be than the claimed passage's score to count as misattribution. */
const MISATTRIBUTION_MARGIN = 0.15;

/**
 * @typedef {'exact'|'minor_variance'|'misquote'|'misattribution'|'not_found'} Verdict
 */

/**
 * Default canonical-text lookup: the local BSB fixture corpus.
 * @param {string} reference
 * @returns {Promise<{reference: string, text: string, translation: string, source: string}|null>}
 */
async function defaultCanonicalLookup(reference) {
  const fixture = findByReference(reference);
  if (!fixture) return null;
  return { reference: fixture.reference, text: fixture.text, translation: fixture.translation, source: 'fixture' };
}

/**
 * @param {{quote: string, claimedReference: string, version?: string}} input
 * @param {{canonicalLookup?: (reference: string, version?: string) => Promise<{reference: string, text: string, translation: string, source: string}|null>}} [deps]
 * @returns {Promise<{
 *   verdict: Verdict,
 *   claimedReference: string,
 *   canonicalText: string|null,
 *   canonicalTranslation: string|null,
 *   canonicalSource: string|null,
 *   similarityScore: number|null,
 *   diffSummary: object|null,
 *   correctReference: string|null,
 *   reason: string
 * }>}
 */
export async function verifyQuote({ quote, claimedReference, version }, deps = {}) {
  const canonicalLookup = deps.canonicalLookup ?? defaultCanonicalLookup;

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
    };
  }

  const quoteTokens = tokenize(quote);
  const claimedCanonical = await canonicalLookup(claimedReference, version);

  if (!claimedCanonical || !claimedCanonical.text) {
    // We still search the fixture corpus for a best match, since the quote
    // might be a real, correctly-worded verse that's simply pinned to a
    // reference we couldn't resolve (or to a bogus one).
    const best = findBestMatch(quote);
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
    };
  }

  const canonicalTokens = tokenize(claimedCanonical.text);
  const claimedScore = similarity(canonicalTokens, quoteTokens);
  const ops = wordDiff(canonicalTokens, quoteTokens);
  const diffSummary = summarizeDiff(ops);

  // Check whether some OTHER passage in the (fixture) corpus matches the
  // quote meaningfully better than the claimed one — that's misattribution,
  // regardless of how well/poorly the quote matches its claimed home.
  const best = findBestMatch(quote);
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
    };
  }

  let verdict;
  let reason;
  if (claimedScore >= 0.999) {
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
  };
}
