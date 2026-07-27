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

/** Similarity threshold above which a non-exact quote is "minor_variance" rather than "misquote". */
const MINOR_VARIANCE_THRESHOLD = 0.95;
/** Similarity floor below which we say "not_found" rather than "misquote" (quote doesn't meaningfully resemble the claimed passage). */
const MISQUOTE_FLOOR = 0.3;
/** Minimum absolute similarity a competing passage must reach to be considered a misattribution candidate. */
const MISATTRIBUTION_MIN_SCORE = 0.7;
/** How much better a competing passage's score must be than the claimed passage's score to count as misattribution. */
const MISATTRIBUTION_MARGIN = 0.15;

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
  if (score >= 0.999) return 'exact';
  if (score > MINOR_VARIANCE_THRESHOLD) return 'minor_variance';
  if (score >= MISQUOTE_FLOOR) return 'misquote';
  return 'not_found';
}

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
    // reference we couldn't resolve (or to a bogus one).
    const best = findBestMatch(comparableQuote);
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
  const claimedScore = similarity(canonicalTokens, quoteTokens);
  const ops = wordDiff(canonicalTokens, quoteTokens);
  const diffSummary = summarizeDiff(ops);

  // Closest-canon comparison across every translation this project ships
  // LOCALLY (BSB/WEB/KJV — see src/alt-translations.js) — computed
  // unconditionally so a caller can always see which translation the quote
  // actually matches best, not just whether it matched the requested one.
  // When deps.multiVersion is present (flag-gated — see src/index.js), this
  // additionally fetches the reference across a configurable list of
  // licensed YouVersion translations via the deployer's own key and folds
  // them into the same comparison; omitted, behavior is byte-identical to
  // the local-only path.
  let closest;
  let remoteVersionsChecked = null;
  if (multiVersion?.fetchVersion) {
    const { best, remoteResults } = await findClosestCanonWithRemote(claimedCanonical.reference, quoteTokens, multiVersion);
    closest = best;
    remoteVersionsChecked = remoteResults;
  } else {
    closest = findClosestCanon(claimedCanonical.reference, quoteTokens);
  }
  const closestTranslation = closest?.translation ?? null;
  const similarityToClosest = closest?.score ?? null;
  const verdictAgainstClosest = closest ? classifyVerdict(closest.score) : null;

  // Check whether some OTHER passage in the (fixture) corpus matches the
  // quote meaningfully better than the claimed one — that's misattribution,
  // regardless of how well/poorly the quote matches its claimed home.
  const best = findBestMatch(comparableQuote);
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
    closestTranslation,
    similarityToClosest,
    verdictAgainstClosest,
    similarityToRequested: claimedScore,
    remoteVersionsChecked,
  };
}
