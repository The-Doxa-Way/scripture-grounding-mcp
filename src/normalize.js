/**
 * Text normalization for comparing a quoted passage against canonical Scripture text.
 *
 * The goal is to make comparisons robust to *presentation* differences that carry
 * no meaning change (smart quotes vs straight quotes, inline verse numbers,
 * capitalization, stray punctuation, whitespace) while leaving *wording*
 * differences intact, since wording differences are exactly what verify_quote
 * needs to detect.
 */

/** Map of "smart"/typographic characters to their plain ASCII equivalents. */
const SMART_CHAR_MAP = {
  '‘': "'", // left single quote
  '’': "'", // right single quote / apostrophe
  '‚': "'",
  '‛': "'",
  '“': '"', // left double quote
  '”': '"', // right double quote
  '„': '"',
  '‟': '"',
  '–': '-', // en dash
  '—': '-', // em dash
  '…': '...', // ellipsis
};

/**
 * Replace typographic/smart punctuation with plain ASCII equivalents.
 * @param {string} text
 * @returns {string}
 */
export function deSmarten(text) {
  let out = text;
  for (const [smart, plain] of Object.entries(SMART_CHAR_MAP)) {
    out = out.split(smart).join(plain);
  }
  return out;
}

/**
 * Strip standalone verse-number tokens (e.g. a pasted quote that includes
 * inline verse markers like "16 For God so loved the world"). Scripture text
 * never contains a "word" that is purely digits, so any token consisting only
 * of digits is treated as a verse/chapter marker and removed.
 * @param {string} text
 * @returns {string}
 */
export function stripVerseNumbers(text) {
  return text.replace(/\b\d+\b/g, ' ');
}

/**
 * Full normalization pipeline used before comparing two passages of Scripture.
 * Order matters: de-smarten first (so punctuation stripping catches converted
 * ASCII forms), then strip verse numbers, then lowercase, then strip remaining
 * punctuation, then collapse whitespace.
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  if (typeof text !== 'string') return '';
  let out = text.normalize('NFKC');
  out = deSmarten(out);
  out = stripVerseNumbers(out);
  out = out.toLowerCase();
  // Strip punctuation except the apostrophe inside contractions (don't, God's).
  // First collapse apostrophes/quotes at word boundaries (quoting marks), then
  // strip everything that isn't a letter, digit, apostrophe, or whitespace.
  out = out.replace(/[^\p{L}\p{N}'\s]/gu, ' ');
  // Drop apostrophes that aren't between two letters (leftover quote marks).
  out = out.replace(/(^|[^\p{L}])'|'(?=[^\p{L}]|$)/gu, '$1 ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Normalize and split into a word-token array, ready for word-level diffing.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const n = normalize(text);
  return n.length ? n.split(' ') : [];
}
