/**
 * Local multi-version ("closest canon") support for verify_quote.
 *
 * This project's default/requested translation is the BSB (src/fixtures.js
 * — the ground truth every benchmark condition and the fixture-mode
 * `get_passage` are scored/served against). Two more committed, public-
 * domain corpora — WEB and KJV, fetched the same way as BSB via
 * `scripts/build-fixtures.js --web` / `--kjv` — exist purely so verify_quote
 * can recognize "this quote isn't wrong, it's just not the requested
 * translation" instead of flatly scoring an accurate WEB/KJV quote as a BSB
 * misquote. That distinction matters because "quote it exactly" is only a
 * fair test when the translation is named (this repo's own benchmark names
 * BSB explicitly in its ungrounded prompt — see benchmark/runner.js).
 *
 * Honesty note on scope: fetching a THIRD-PARTY-LICENSED translation
 * (NIV/ESV/NASB/etc.) live via a developer's own YOUVERSION_APP_KEY for
 * automated cross-translation comparison is a materially different use of
 * the YouVersion Platform API than this server's existing single-
 * translation `get_passage`/`verify_quote` path, and is NOT implemented
 * here. It has not been built or tested against the real API pending
 * YouVersion's written confirmation that this specific use is covered —
 * see README's "Multi-version detection" section for exactly what today's
 * detection does and does not cover.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tokenize } from './normalize.js';
import { similarity } from './diff.js';
import { findByReference as findBsb } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORPORA_DIRS = {
  web: path.join(__dirname, '..', 'fixtures', 'web'),
  kjv: path.join(__dirname, '..', 'fixtures', 'kjv'),
};

/** @type {Map<string, Array<{reference: string, translation: string, text: string}>>} */
const corpusCache = new Map();

function loadCorpus(name) {
  if (corpusCache.has(name)) return corpusCache.get(name);
  let fixtures = [];
  try {
    const dir = CORPORA_DIRS[name];
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    fixtures = files
      .map((f) => {
        try {
          return JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    fixtures = [];
  }
  corpusCache.set(name, fixtures);
  return fixtures;
}

function normalizeKey(reference) {
  return reference.trim().toLowerCase().replace(/\s+/g, ' ');
}

function findInCorpus(name, reference) {
  const key = normalizeKey(reference);
  return loadCorpus(name).find((f) => normalizeKey(f.reference) === key);
}

/**
 * Every locally-shipped, public-domain candidate translation for a
 * reference — BSB (the requested/default translation), WEB, and KJV —
 * whichever have a fixture for it. All 34 benchmark passages have all
 * three; a reference outside that list may have only BSB, or none.
 * @param {string} reference
 * @returns {Array<{translation: string, text: string}>}
 */
export function localCandidateTranslations(reference) {
  const candidates = [];
  const bsb = findBsb(reference);
  if (bsb) candidates.push({ translation: bsb.translation, text: bsb.text });
  const web = findInCorpus('web', reference);
  if (web) candidates.push({ translation: web.translation, text: web.text });
  const kjv = findInCorpus('kjv', reference);
  if (kjv) candidates.push({ translation: kjv.translation, text: kjv.text });
  return candidates;
}

/**
 * Find the closest-matching canon for `reference` across every locally
 * shipped translation (BSB/WEB/KJV), scored against the SAME quote tokens
 * verify_quote already scored against the requested translation (apples to
 * apples). Ties resolve to whichever candidate is checked first (BSB, then
 * WEB, then KJV) since `similarity` is deterministic and a genuine tie means
 * the wording is identical across those translations anyway.
 * @param {string} reference
 * @param {string[]} quoteTokens - already-normalized/tokenized quote (see src/normalize.js)
 * @returns {{translation: string, text: string, score: number}|null}
 */
export function findClosestCanon(reference, quoteTokens) {
  if (!Array.isArray(quoteTokens) || quoteTokens.length === 0) return null;
  const candidates = localCandidateTranslations(reference);
  let best = null;
  for (const candidate of candidates) {
    const score = similarity(tokenize(candidate.text), quoteTokens);
    if (!best || score > best.score) {
      best = { translation: candidate.translation, text: candidate.text, score };
    }
  }
  return best;
}
