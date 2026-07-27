/**
 * Single source of truth for every real string/number the video clips
 * render. Everything here is read from repo files at build time — never
 * hand-typed Scripture or invented numbers — so the video traces back to
 * the same fixtures/benchmark output judges can check against the repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wordDiff } from '../../src/diff.js';
import { checkRegister } from '../../src/verify-register.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/**
 * Clip 11 — pulls the founder-flagged before/after reply text straight out of
 * evals/results/founder-flagged-register-2026-07-27.md's own blockquotes
 * (never hand-retyped): the "before" quote is already the doc's own abridged
 * form (its "[...]" elisions, stripped here for on-screen readability); the
 * "after" quote is the doc's full clean paragraph, trimmed to two of its four
 * paragraphs to fit a 14s clip.
 */
function extractRegisterQuoteParagraphs(doc, startMarker, stopMarker) {
  const s = doc.indexOf(startMarker);
  if (s === -1) throw new Error(`founder-flagged-register-2026-07-27.md: marker not found: ${startMarker}`);
  const from = s + startMarker.length;
  const e = doc.indexOf(stopMarker, from);
  if (e === -1) throw new Error(`founder-flagged-register-2026-07-27.md: stop marker not found: ${stopMarker}`);
  const lines = doc.slice(from, e).split('\n').filter((l) => l.startsWith('>'));
  const text = lines.map((l) => l.replace(/^>\s?/, '')).join('\n').trim();
  return text.split(/\n\n+/).map((p) => p.replace(/\n/g, ' ').replace(/\*\*/g, '').replace(/\*/g, '').trim());
}

const results = readJSON('benchmark/results/results-2026-07-27.json');
const psalm46 = results.worstUngroundedExamples.find((e) => e.reference === 'Psalm 46:1-3');
const hebrews135 = results.worstUngroundedExamples.find((e) => e.reference === 'Hebrews 13:5');
const john316 = readJSON('fixtures/bsb/john-3-16-17.json');
// Register-hardening fix (founder-flagged 2026-07-27): the original capture
// (grounded-reply-demo-2026-07-27.json) was the anthropomorphizing BEFORE
// example ("I understand... The passage I have for you... I'd also
// encourage you to..."); this points at the AFTER capture from the
// production deployment instead, post-fix.
const groundedDemo = readJSON('evals/results/grounded-reply-demo-2026-07-27-register-fix.json');

if (!psalm46 || !hebrews135) {
  throw new Error('Expected Psalm 46:1-3 and Hebrews 13:5 in worstUngroundedExamples — check results-2026-07-27.json');
}

// Clip 11 — the register-guard story (founder-flagged 2026-07-27).
const registerDoc = fs.readFileSync(
  path.join(ROOT, 'evals/results/founder-flagged-register-2026-07-27.md'),
  'utf8'
);
const registerBeforeParas = extractRegisterQuoteParagraphs(
  registerDoc,
  '`output.reply`, before any fix):',
  '## The fix'
);
const registerAfterParas = extractRegisterQuoteParagraphs(
  registerDoc,
  '**After** (verbatim, live production capture,',
  'Zero first-person language'
);
// Rejoin the "I'd also encourage you to: - bullet - bullet - bullet" list
// as prose (the doc's own bullet dashes read awkwardly on one line).
const registerBulletSegments = registerBeforeParas[2]
  .replace(/\[\.\.\.\]/g, '')
  .split(/\s*-\s*/)
  .map((s) => s.trim())
  .filter(Boolean);
const registerBefore = `${registerBeforeParas[0]} ${registerBulletSegments[0]} ${registerBulletSegments[1]}; ${registerBulletSegments[2]}`.trim();
const registerAfter = `${registerAfterParas[0]} ${registerAfterParas[3]}`.trim();

if (checkRegister(registerBefore).verdict !== 'violations') {
  throw new Error('Expected the register-guard before-excerpt to trip checkRegister (src/verify-register.js)');
}
if (checkRegister(registerAfter).verdict !== 'clean') {
  throw new Error('Expected the register-guard after-excerpt to be checkRegister-clean (src/verify-register.js)');
}

/** Case-insensitive find that returns the phrase with its real on-screen casing. */
function findRegisterPhrase(text, phrase) {
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) {
    throw new Error(`registerBefore excerpt no longer contains banned phrase: "${phrase}"`);
  }
  return text.slice(idx, idx + phrase.length);
}
// The three banned phrases the founder-flagged doc itself names (line ~34:
// "First-person emotional/relational framing throughout ('I understand',
// 'the passage I have for you', 'I'd also encourage you to')"), each paired
// with the register requirement it breaks: 'first-person' is a literal
// src/verify-register.js RULES category; 'tool-as-comforter' and
// 'reassurance-empathy' name the other two hard requirements added to
// grounded-reply.js's system prompt by the same fix (see the doc's "The fix"
// section, item 1).
const registerHighlights = [
  { phrase: findRegisterPhrase(registerBefore, 'I understand that'), rule: 'first-person' },
  { phrase: findRegisterPhrase(registerBefore, 'the passage I have for you'), rule: 'tool-as-comforter' },
  { phrase: findRegisterPhrase(registerBefore, "I'd also encourage you"), rule: 'reassurance-empathy' },
];

export const DATA = {
  // Clip 01 / 05 — the real worst-misquote example (script explicitly names
  // Psalm 46:1-3 as an acceptable pick; Isaiah 53:4-6's real ungrounded
  // output is only a minor_variance, similarity 0.974, not a misquote, so it
  // does not fit the "wrong words" brief — Psalm 46:1-3 does, per
  // benchmark/results/RESULTS.md's worst-examples section).
  misquote: {
    reference: 'Psalm 46:1-3',
    typedPrompt: 'Quote Psalm 46:1-3 exactly.',
    raw: psalm46.rawText,
    canonical: psalm46.canonicalText,
    verdict: psalm46.verdict,
    similarity: psalm46.similarityScore,
    diff: psalm46.diffSummary,
    reason: `Quote diverges materially from the canonical text (similarity ${psalm46.similarityScore.toFixed(2)}).`,
    // Real word-level diff (src/diff.js's wordDiff — the same LCS algorithm
    // verify_quote uses), computed here on the original-cased sentences
    // (verify_quote itself diffs normalized/lowercased tokens for scoring;
    // the verdict/similarity above is that real scored output — this ops
    // list is the same algorithm applied to the readable original text, for
    // an on-screen word diff a viewer can actually read).
    diffOps: wordDiff(psalm46.canonicalText.split(/\s+/), psalm46.rawText.split(/\s+/)),
  },
  // Clip 01 ending — the real refusal, scored not_found.
  refusal: {
    reference: 'Hebrews 13:5',
    raw: hebrews135.rawText,
    canonical: hebrews135.canonicalText,
  },
  // Clip 04 — real fixture text, same one get_passage serves.
  getPassage: {
    reference: john316.reference,
    text: john316.text,
    translation: john316.translation,
  },
  // Clip 06 — a real, live grounded_reply() call captured for this video
  // (evals/results/grounded-reply-demo-2026-07-27.json), unmodified product
  // code path (src/grounded-reply.js).
  groundedReply: groundedDemo.output,
  // Clip 11 — the register-guard story: verify_register against the real
  // founder-flagged BEFORE reply, then the register-clean AFTER reply, both
  // read verbatim from evals/results/founder-flagged-register-2026-07-27.md.
  registerGuard: {
    topic: "I'm anxious about my future",
    before: registerBefore,
    after: registerAfter,
    highlights: registerHighlights,
  },
  // Clip 07 — the real per-condition summary numbers.
  benchmark: {
    corpusSize: results.corpusSize,
    models: results.modelsObserved,
    ungroundedExactRate: results.conditions.ungrounded.summary.exactRate,
    groundedExactRate: results.conditions.grounded.summary.exactRate,
  },
  // Clip 03 — the real config block from README.md's setup instructions.
  mcpConfig: `{
  "mcpServers": {
    "scripture-grounding": {
      "command": "node",
      "args": ["/path/to/scripture-grounding-mcp/src/index.js"]
    }
  }
}`,
  // Clip 08 — abbreviated, honest, from README.md "Honest limitations" /
  // benchmark/METHODOLOGY.md "What this benchmark does NOT claim".
  limitations: [
    '34 fixture passages, not the whole Bible — misattribution search only checks these 34.',
    'Word-level similarity, not semantic similarity — wording overlap, not meaning.',
    'One default translation (BSB) — a different legitimate translation scores as a mismatch.',
    'grounded_reply’s retrieval is a keyword map, not a real search engine.',
    'This measures. It does not solve.',
  ],
  // Clip 09 — exact closing lines from docs/video-script.md.
  close: {
    line: 'The bridge is built. It’s open. Connect it.',
    url: 'github.com/The-Doxa-Way/scripture-grounding-mcp',
  },
  // Clip 10 — real frontier words: docs/writeup.md ("games, wearables, IDEs,
  // social") + docs/vo-script-garth.md ("every AI conversation on earth").
  frontierWords: ['games', 'IDEs', 'wearables', 'social', 'every AI conversation'],
};
