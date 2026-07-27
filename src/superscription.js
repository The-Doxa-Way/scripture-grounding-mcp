/**
 * Psalm-superscription detection and stripping.
 *
 * Integrity fix (founder-flagged 2026-07-27): the BSB text file
 * (bereanbible.com/bsb.txt) bakes a psalm's liturgical superscription (e.g.
 * "For the choirmaster. Of the sons of Korah. According to Alamoth. A
 * song.") into the same verse-1 line as the actual body text. That
 * superscription is a musical/liturgical heading, not part of the quoted
 * passage — so when it was left inside a fixture's `text`, both the
 * benchmark's `verify_quote` scoring and the video/verify displays treated
 * a quote that (correctly) omitted it as "missing canonical text," inflating
 * similarity-distance for psalms (e.g. Psalm 46:1-3 scored 0.796 partly
 * because of the header, not real wording error).
 *
 * `splitSuperscription` conservatively detects a LEADING run of superscription
 * sentences using a fixed vocabulary list (below) and separates them from the
 * passage body. It is deliberately conservative — sentence-anchored, whole-
 * sentence matches only, vocabulary drawn from BSB's own superscription
 * wording — so it never mistakes real passage text for a heading. It's used
 * in two places:
 *   - scripts/build-fixtures.js, at fixture-build time, to split a psalm
 *     fixture's `text` into `text` (body only) + `superscription` (the
 *     heading, kept for provenance/display, never silently discarded).
 *   - src/verify-quote.js, at verify_quote time, to strip a leading
 *     superscription from the *quote* side too — so a quote that includes
 *     the header (e.g. this project's own `grounded` benchmark condition,
 *     which retrieves and echoes the full verse-1 line) still verifies as
 *     exact against the now header-free canonical text, and a quote that
 *     omits the header (the common case) is compared as if the header never
 *     existed, on both sides symmetrically.
 */

/**
 * Each pattern must match a WHOLE sentence (trimmed, trailing period
 * optional), case-insensitively. Vocabulary is drawn directly from the BSB's
 * own psalm superscriptions (confirmed against bereanbible.com/bsb.txt and
 * cross-checked against biblehub.com's BSB rendering for Psalm 23, 46, 121)
 * — this list is intentionally conservative (whole-sentence, closed
 * vocabulary) rather than a loose "starts with a capital letter" heuristic,
 * so it never eats real passage wording. Extend it (and re-verify by eye
 * against those sources) if a newly added psalm fixture has a superscription
 * shape not yet covered here.
 */
const SUPERSCRIPTION_SENTENCE_PATTERNS = [
  /^for the (choir\s?master|director of music)\.?$/i,
  /^of the sons of korah\.?$/i,
  /^of asaph\.?$/i,
  /^of david\.?$/i,
  /^of solomon\.?$/i,
  /^of moses,? the man of god\.?$/i,
  /^a (psalm|song|prayer|contemplation)( of (david|asaph|solomon|moses|the sons of korah|ascents))?\.?$/i,
  /^a (maskil|miktam|shiggaion)( of david)?\.?$/i,
  /^according to [a-z][a-z\s-]*\.?$/i, // "According to Alamoth.", "According to Gittith.", "According to Muth-labben."
  /^to the tune of [a-z][a-z\s-]*\.?$/i,
];

/**
 * Split a leading sentence-run of {@link SUPERSCRIPTION_SENTENCE_PATTERNS}
 * matches off the front of `text`.
 * @param {string} text
 * @returns {{ superscription: string|null, body: string }}
 */
export function splitSuperscription(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { superscription: null, body: text ?? '' };
  }
  // Split into sentences, keeping the terminal punctuation attached to each.
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  let matched = 0;
  while (
    matched < sentences.length - 1 && // never consume the LAST sentence — a superscription-only
    // fixture would leave no body, which is never correct for a real passage.
    SUPERSCRIPTION_SENTENCE_PATTERNS.some((re) => re.test(sentences[matched].trim()))
  ) {
    matched++;
  }
  if (matched === 0) {
    return { superscription: null, body: text.trim() };
  }
  return {
    superscription: sentences.slice(0, matched).join(' ').trim(),
    body: sentences.slice(matched).join(' ').trim(),
  };
}
