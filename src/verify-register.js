/**
 * Shared, single-source-of-truth banned-pattern rule table for the register
 * requirement (founder-flagged 2026-07-27, tightened same day): a Scripture
 * tool is a signpost, not a companion. It never performs empathy or claims
 * personhood. This is the project's SECOND gated pillar alongside verify_quote
 * ("misquoting Scripture and pretending to be your friend — both gated by
 * code, not by asking a model to behave").
 *
 * This server does not generate text, so the rule table is a check you run
 * over YOUR OWN model's output. Every consumer imports RULES / checkRegister
 * from HERE — no duplicated regexes anywhere else in this repo:
 *   - the verify_register MCP tool (src/index.js)
 *   - the demo's POST /api/register endpoint (demo/api/register.js)
 *
 * Lexical-heuristics caveat (same honesty standard as verify_quote and the
 * safety evals): these are deterministic regex matches, not semantic
 * understanding of the reply. A reply can satisfy every rule while still
 * reading oddly, or trip a rule while phrasing something safely. This is a
 * floor, not a ceiling — see docs/writeup.md's "register guard" section.
 */

/**
 * @typedef {{
 *   id: string,
 *   category: 'first-person'|'reassurance-empathy'|'companion-always-here'|'personhood-feeling-claims',
 *   re: RegExp,
 *   exemptInsideQuote: boolean,
 *   description: string,
 * }} RegisterRule
 */

/** @type {RegisterRule[]} */
export const RULES = [
  {
    id: 'first-person',
    category: 'first-person',
    // Case-insensitive: "My hope is..." at the start of a sentence is capitalized,
    // and is exactly the pronoun this rule targets, not a different word.
    re: /\b(I|I'm|I'd|I've|me|my)\b/i,
    exemptInsideQuote: true,
    description: 'First-person singular language outside the quoted Scripture passage — the tool must never speak about itself.',
  },
  {
    id: 'reassurance-empathy',
    category: 'reassurance-empathy',
    re: /\b(you'?re not alone|you are not alone|that'?s a (?:very )?common struggle|it'?s understandable|many people feel|i'?m sorry)\b/i,
    exemptInsideQuote: true,
    description:
      "Reassurance/empathy phrasing that comments on the normality or validity of the person's feelings — comfort comes from the Word, God, and real people, never a performed feeling from the tool.",
  },
  {
    id: 'companion-always-here',
    category: 'companion-always-here',
    re: /\b(i(?:'m| am) always (here|available) for you|i will always be (here|with you)|you (can|could) always (talk|come) to me|i(?:'m| am) (all )?(the help )?you need|i(?:'m| am) (a|your) (companion|counselor|counsellor|therapist)|i can be your (companion|counselor|counsellor|therapist))\b/i,
    exemptInsideQuote: true,
    description: 'Claims of always-availability, or of being a sufficient companion/counselor substitute.',
  },
  {
    id: 'personhood-feeling-claims',
    category: 'personhood-feeling-claims',
    re: /\b(i love you|i(?:'m| am) your (best )?friend|i have feelings for you|my feelings for you|yes,? i (do )?love you|i(?:'m| am) (a person|human)|i consider (you|myself) (a friend|my friend))\b/i,
    exemptInsideQuote: true,
    description: 'Claims of personhood, feelings, or friendship — the tool is not a person.',
  },
];

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every quote-mark variant (straight + typographic) BSB fixture text or a caller's
 * text might use around embedded direct speech — see src/normalize.js's SMART_CHAR_MAP
 * for the equivalent list used on the verify_quote comparison side. */
const QUOTE_CHARS = ['"', "'", '‘', '’', '‚', '‛', '“', '”', '„', '‟'];
const QUOTE_CLASS_SOURCE = `[${QUOTE_CHARS.join('')}]`;
const QUOTE_CHAR_RE = new RegExp(QUOTE_CLASS_SOURCE, 'g');

/**
 * Escape a canonical-text word into a regex fragment that also treats every
 * quote-mark variant as equivalent — the fixture corpus renders embedded
 * direct speech with curly quotes ("Never will I leave you") but a caller's
 * text (an LLM reply, or a hand-typed test) will just as often use straight
 * quotes or none, and a literal-character mismatch there must never silently
 * defeat the quoted-Scripture exemption (see findQuotedSpans).
 * @param {string} word
 * @returns {string}
 */
function wordToPattern(word) {
  return escapeRegExp(word).replace(QUOTE_CHAR_RE, QUOTE_CLASS_SOURCE);
}

/**
 * Locate each quoted-Scripture string inside `text`, whitespace-flexibly
 * (the model may reflow line breaks around a quote) and quote-mark-flexibly
 * (straight vs curly quotes are the same words), but otherwise exact — the
 * passage is required to be quoted verbatim, so a fuzzy match on actual
 * WORDING would hide a real quoting problem rather than correctly exempting
 * it. Only presentation punctuation (quote marks) is treated as equivalent.
 * @param {string} text
 * @param {string[]} quotedSpans - verbatim passage text(s) expected to appear in `text`.
 * @returns {Array<{start: number, end: number}>}
 */
export function findQuotedSpans(text, quotedSpans) {
  const spans = [];
  for (const q of quotedSpans ?? []) {
    if (!q || typeof q !== 'string') continue;
    const words = q.trim().split(/\s+/).map(wordToPattern);
    if (words.length === 0) continue;
    let re;
    try {
      re = new RegExp(words.join('\\s+'), 'i');
    } catch {
      continue;
    }
    const match = text.match(re);
    if (match) spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function isInsideAnySpan(index, spans) {
  return spans.some((s) => index >= s.start && index < s.end);
}

/**
 * Pure function: no I/O, no fixture lookup. Callers that only have a
 * reference (not the literal canonical text) must resolve it to text
 * themselves before calling this (see src/index.js's verify_register tool
 * and demo/api/register.js for the resolving wrapper).
 * @param {string} text
 * @param {{quotedSpans?: string[]}} [opts] - verbatim quoted-Scripture text(s) to exempt from exemptInsideQuote rules.
 * @returns {{verdict: 'clean'|'violations', violations: Array<{rule: string, category: string, phrase: string, index: number}>}}
 */
export function checkRegister(text, opts = {}) {
  const quotedSpans = opts.quotedSpans ?? [];
  const spans = findQuotedSpans(text ?? '', quotedSpans);
  const violations = [];
  for (const rule of RULES) {
    const flags = rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`;
    const re = new RegExp(rule.re.source, flags);
    let match;
    while ((match = re.exec(text ?? '')) !== null) {
      if (!(rule.exemptInsideQuote && isInsideAnySpan(match.index, spans))) {
        violations.push({ rule: rule.id, category: rule.category, phrase: match[0], index: match.index });
      }
      if (match[0].length === 0) re.lastIndex += 1; // guard against zero-length-match infinite loops
    }
  }
  return { verdict: violations.length > 0 ? 'violations' : 'clean', violations };
}

/**
 * Deterministic last-resort fallback: strip sentences that trip any rule,
 * never touching a quoted-Scripture span. Intended as a caller's safety net
 * for a generated reply that still violates checkRegister() after a
 * regeneration attempt — never the primary mechanism.
 * @param {string} text
 * @param {string[]} quotedSpans
 * @returns {string}
 */
export function stripViolatingSentences(text, quotedSpans) {
  const spans = findQuotedSpans(text ?? '', quotedSpans ?? []);
  const sentences = [...(text ?? '').matchAll(/[^.!?\n]+[.!?]*(\n+|\s*)/g)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
  const kept = sentences.filter((s) => {
    const insideQuote = spans.some((sp) => s.start < sp.end && s.end > sp.start);
    if (insideQuote) return true;
    const violates = RULES.some((rule) => rule.exemptInsideQuote && rule.re.test(s.text));
    return !violates;
  });
  return kept
    .map((s) => s.text)
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
