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
 * Licensed-translation extension (founder-directed 2026-07-27, flag-gated
 * DEFAULT OFF pending YouVersion's written AI-use approval — see README's
 * "Multi-version detection" section): when a deployer sets both
 * YOUVERSION_APP_KEY and YOUVERSION_MULTI_VERSION=1, `verify_quote`'s
 * closest-canon comparison (`findClosestCanonWithRemote` below) additionally
 * fetches the claimed reference across a configurable list of YouVersion
 * bibleIds via that deployer's own key and folds the results into the same
 * comparison as the local BSB/WEB/KJV corpora — no licensed text is ever
 * committed to this repo; it exists only in memory at request time. Flag
 * off (the default) is byte-identical to the pre-2026-07-27 local-only
 * behavior (`findClosestCanon`, unchanged below).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tokenize } from './normalize.js';
import { similarity } from './diff.js';
import { findByReference as findBsb } from './fixtures.js';
import { splitSuperscription } from './superscription.js';

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

/**
 * Real, catalog-confirmed YouVersion Platform API bible IDs for popular
 * translations (checked live 2026-07-27 against api.youversion.com via GET
 * /v1/bibles/{id} and GET /v1/bibles/{id}/passages/{usfm} — see README's
 * "Multi-version detection" section for the full accessible-versions
 * table). Deliberately NOT every popular translation: KJV/ESV/NLT/CSB under
 * bible.com's own public-site numeric ids (1, 59, 116, 1713 respectively)
 * all 404 "Bible version not found" against this Platform API — meaning
 * those specific ids don't exist in this catalog at all, a different (and
 * worse-to-default-to) failure than "access denied." NIV11 (111), NASB1995
 * (100), and NASB2020 (2692) DO exist in this catalog (confirmed 200 on the
 * bible-info endpoint) but returned 403 "Access denied" for a passage fetch
 * with this project's own key — per-version license acceptance in
 * developers.youversion.com's portal, not a code defect (see
 * fetchRemoteVersionCandidates, which reports this as a graceful skip, not
 * a thrown error). A deployer whose key has different/broader catalog
 * access should override via YOUVERSION_VERSION_IDS (comma-separated
 * bibleIds).
 */
const DEFAULT_REMOTE_VERSION_IDS = ['111', '100', '2692'];

/**
 * Friendly display names for bibleIds this project has confirmed live
 * against the Platform API (2026-07-27) — the three default popular-
 * translation ids above, plus ASV (id 12), one of the freely-accessible
 * public-domain versions this API's catalog lists for any key (used for
 * this feature's own real end-to-end test — see tests/ and README — since
 * none of the default popular ids are passage-accessible with this
 * project's own non-commercial key). `getPassage` itself only ever reports
 * a raw bibleId as `translation` for a non-default version (see
 * src/youversion-client.js), so this map exists purely to make a report
 * human-readable; an id outside it (e.g. a deployer's own
 * YOUVERSION_VERSION_IDS override) falls back to whatever `translation` the
 * fetch itself reports, or the raw id.
 */
const KNOWN_VERSION_NAMES = {
  111: 'NIV (New International Version)',
  100: 'NASB1995 (New American Standard Bible, 1995)',
  2692: 'NASB2020 (New American Standard Bible, 2020)',
  12: 'ASV (American Standard Version, public domain)',
};

function versionIdsFromEnv() {
  const raw = process.env.YOUVERSION_VERSION_IDS;
  if (!raw) return DEFAULT_REMOTE_VERSION_IDS;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : DEFAULT_REMOTE_VERSION_IDS;
}

/**
 * Fetch `reference` across a list of YouVersion bibleIds via an injected
 * `fetchVersion(reference, versionId)` (normally the YouVersion client's
 * `getPassage` — see src/index.js), for verify_quote's flag-gated
 * multi-version comparison. Every version is attempted independently; a
 * per-version failure — an inaccessible/unlicensed id, a network error, or
 * the client's own fixture-fallback (`source !== 'youversion-api'`, meaning
 * THIS specific version could not be fetched live) — is recorded as a skip
 * with a human-readable note and never thrown, so one bad version-id can
 * never take down the whole comparison. Superscription-strip (see
 * src/superscription.js) is applied to fetched text, symmetric with the
 * local BSB/WEB/KJV corpora.
 * @param {string} reference
 * @param {(reference: string, versionId: string) => Promise<{text: string|null, translation?: string, source?: string, error?: string, note?: string}>} fetchVersion
 * @param {string[]} [versionIds]
 * @returns {Promise<Array<{versionId: string, translation: string, text: string}|{versionId: string, skipped: true, note: string}>>}
 */
export async function fetchRemoteVersionCandidates(reference, fetchVersion, versionIds = versionIdsFromEnv()) {
  const results = [];
  for (const versionId of versionIds) {
    try {
      const result = await fetchVersion(reference, versionId);
      if (!result || !result.text || result.source !== 'youversion-api') {
        const detail = result?.note || result?.error || 'not accessible with this key (no live text returned)';
        results.push({ versionId, skipped: true, note: `${versionId}: ${detail}` });
        continue;
      }
      results.push({
        versionId,
        translation: KNOWN_VERSION_NAMES[versionId] ?? result.translation ?? String(versionId),
        text: splitSuperscription(result.text).body || result.text,
      });
    } catch (err) {
      results.push({ versionId, skipped: true, note: `${versionId}: ${err.message}` });
    }
  }
  return results;
}

/**
 * Async superset of {@link findClosestCanon}: scores the quote against
 * every LOCAL candidate (BSB/WEB/KJV) plus every successfully-fetched
 * REMOTE candidate (see {@link fetchRemoteVersionCandidates}), returning the
 * same `{translation, text, score}` shape `findClosestCanon` does, plus the
 * raw per-version remote results (including skips) so a caller can report
 * on inaccessible versions without throwing. When `opts.fetchVersion` is
 * omitted, this is equivalent to (and delegates the scoring loop identically
 * to) the local-only `findClosestCanon` — used by verify_quote only when the
 * YOUVERSION_MULTI_VERSION flag is on (see src/verify-quote.js / src/index.js).
 * @param {string} reference
 * @param {string[]} quoteTokens
 * @param {{fetchVersion?: Function, versionIds?: string[]}} [opts]
 * @returns {Promise<{best: {translation: string, text: string, score: number}|null, remoteResults: Array}>}
 */
export async function findClosestCanonWithRemote(reference, quoteTokens, opts = {}) {
  if (!Array.isArray(quoteTokens) || quoteTokens.length === 0) {
    return { best: null, remoteResults: [] };
  }
  const remoteResults = opts.fetchVersion
    ? await fetchRemoteVersionCandidates(reference, opts.fetchVersion, opts.versionIds)
    : [];
  const remoteCandidates = remoteResults.filter((r) => !r.skipped);
  const candidates = [...localCandidateTranslations(reference), ...remoteCandidates];
  let best = null;
  for (const candidate of candidates) {
    const score = similarity(tokenize(candidate.text), quoteTokens);
    if (!best || score > best.score) {
      best = { translation: candidate.translation, text: candidate.text, score };
    }
  }
  return { best, remoteResults };
}
