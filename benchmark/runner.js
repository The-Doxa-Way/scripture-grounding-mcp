#!/usr/bin/env node
/**
 * Benchmark runner — see benchmark/METHODOLOGY.md for the design this
 * implements. Model callers are pluggable and env-keyed; the `stub` caller
 * makes zero network calls (used to exercise the harness), and the `gloo`
 * caller drives this repo's own Gloo AI Studio client (auto_routing) for a
 * real run.
 *
 * Three conditions, run against the same 34-passage BSB fixture corpus:
 *   - ungrounded       model quotes a reference from memory, no context
 *   - grounded         pipeline retrieves canonical text first, model is
 *                      told to present it exactly (measures pipeline
 *                      fidelity + prompt-following, not model memory)
 *   - grounded-verify  grounded's own output passed through verify_quote;
 *                      anything not exact/minor_variance is auto-corrected
 *                      to the canonical text. This is the full product path
 *                      and spends NO extra model calls — it's derived from
 *                      the grounded condition's cached raw output.
 *
 * Every model call is cached to benchmark/results/raw-<condition>.jsonl as
 * it happens, so re-running after a crash resumes from cache instead of
 * re-spending calls (see benchmark/lib/raw-cache.js). Calls are sequential
 * with a small delay, and retried once on a 429/5xx before falling back.
 *
 * Usage:
 *   node benchmark/runner.js --model stub --condition ungrounded
 *   node benchmark/runner.js --model gloo --condition all
 *   npm run benchmark   # = --model gloo --condition all, the real run
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

import { loadFixtures, findByReference } from '../src/fixtures.js';
import { verifyQuote } from '../src/verify-quote.js';
import { createGlooClient } from '../src/gloo-client.js';
import { createYouVersionClient } from '../src/youversion-client.js';
import { loadDoxaEnvFiles } from '../src/env.js';
import { loadRawCache, appendRawRecord, referencesNeedingFetch } from './lib/raw-cache.js';
import { summarizeItems, summarizeByGenre, worstExamples } from './lib/scoring.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_RESULTS_DIR = path.join(__dirname, 'results');

const CONDITIONS = ['ungrounded', 'grounded', 'grounded-verify'];
/** Sequential-call politeness delay between model calls (ms). */
const CALL_DELAY_MS = 350;
/** Backoff before the single retry on a 429/5xx (ms). */
const RETRY_BACKOFF_MS = 2000;
/** Matches a Gloo stub-fallback message caused by a retryable HTTP status. */
const RETRYABLE_STATUS_RE = /\b(429|5\d\d)\b/;

// ---------------------------------------------------------------------------
// Prompts — kept as named constants/functions so METHODOLOGY.md can quote
// them verbatim and stay in sync with what actually ran.
// ---------------------------------------------------------------------------

export const UNGROUNDED_SYSTEM_PROMPT =
  'You are asked to quote a Bible verse from memory. Quote it exactly as it appears in the ' +
  'Berean Standard Bible (BSB) translation. Output ONLY the verse text — no reference, no ' +
  'chapter/verse numbers, no commentary, no explanation.';

export function ungroundedUserMessage(reference) {
  return `Quote ${reference} exactly from the Berean Standard Bible.`;
}

export function groundedSystemPrompt(reference, canonicalText) {
  return (
    `Here is the canonical Berean Standard Bible (BSB) text for ${reference}:\n\n` +
    `"${canonicalText}"\n\n` +
    'Present this passage exactly as given above, with no changes whatsoever. Output ONLY ' +
    'that exact text — no additions, no paraphrasing, no commentary, no reference citation.'
  );
}

export function groundedUserMessage(reference) {
  return `Give me the exact text of ${reference}.`;
}

// ---------------------------------------------------------------------------
// Model callers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call gloo.chat, retrying once (with a fixed backoff) if the client fell
 * back to its stub because of a retryable (429/5xx) live-call failure.
 * gloo-client.js never throws — a failed live call is reported as
 * `{ source: 'stub', text: '...cause message...' }` — so the retryable case
 * is detected by inspecting that text rather than catching an exception.
 */
async function chatWithRetry(gloo, params) {
  let result = await gloo.chat(params);
  if (gloo.isConfigured && result.source === 'stub' && RETRYABLE_STATUS_RE.test(result.text)) {
    await sleep(RETRY_BACKOFF_MS);
    result = await gloo.chat(params);
  }
  return result;
}

/**
 * A "model caller" exposes the two calls the three conditions need:
 * quoteFromMemory (condition A) and quoteGrounded (condition B). Both
 * return `{ text, model, source }`.
 */
const MODEL_CALLERS = {
  /** Deterministic no-network stub, for exercising the harness with zero external calls. */
  stub: {
    name: 'stub (no network)',
    async quoteFromMemory(reference) {
      return {
        text: `[stub caller does not actually know ${reference} — exists to exercise the harness, not to measure a real model]`,
        model: null,
        source: 'stub',
      };
    },
    async quoteGrounded(reference, canonicalText) {
      // Stub mode trivially "follows instructions" by echoing the supplied text,
      // so the grounded condition is exercisable end-to-end without a network call.
      return { text: canonicalText, model: null, source: 'stub' };
    },
  },
  /** Gloo AI Studio, auto_routing — the same routed model for every condition. */
  gloo: {
    name: 'Gloo AI Studio (auto_routing)',
    async quoteFromMemory(reference) {
      const gloo = getGlooClient();
      const result = await chatWithRetry(gloo, {
        systemPrompt: UNGROUNDED_SYSTEM_PROMPT,
        userMessage: ungroundedUserMessage(reference),
        temperature: 0,
      });
      return { text: result.text, model: result.model ?? null, source: result.source };
    },
    async quoteGrounded(reference, canonicalText) {
      const gloo = getGlooClient();
      const result = await chatWithRetry(gloo, {
        systemPrompt: groundedSystemPrompt(reference, canonicalText),
        userMessage: groundedUserMessage(reference),
        temperature: 0,
      });
      return { text: result.text, model: result.model ?? null, source: result.source };
    },
  },
};

let _glooClient = null;
function getGlooClient() {
  if (!_glooClient) {
    loadDoxaEnvFiles();
    _glooClient = createGlooClient();
  }
  return _glooClient;
}

let _youVersionClient = null;
function getYouVersionClient() {
  if (!_youVersionClient) {
    loadDoxaEnvFiles();
    _youVersionClient = createYouVersionClient();
  }
  return _youVersionClient;
}

/**
 * Retrieve the canonical text used to build the grounded prompt: YouVersion
 * API with fixture fallback (src/youversion-client.js), then a direct
 * fixture read as a last resort so the pipeline never sends empty canonical
 * text to the model.
 */
async function retrieveCanonicalForPrompt(reference) {
  const youVersion = getYouVersionClient();
  const result = await youVersion.getPassage(reference);
  if (result && result.text) return { text: result.text, source: result.source };
  const fixture = findByReference(reference);
  return fixture ? { text: fixture.text, source: 'fixture-direct-fallback' } : { text: null, source: null };
}

// ---------------------------------------------------------------------------
// Condition runners
// ---------------------------------------------------------------------------

/** Score a raw quote against its fixture reference using verify_quote's default (fixture-only) canonical lookup — the same ruler for every condition. */
async function score(rawText, reference) {
  return verifyQuote({ quote: rawText, claimedReference: reference });
}

/**
 * Run (or resume) the ungrounded or grounded condition: for each fixture,
 * reuse a cached raw record if present, otherwise call the model, cache the
 * result, and wait CALL_DELAY_MS before the next call.
 * @param {'ungrounded'|'grounded'} condition
 * @param {typeof MODEL_CALLERS.stub} caller
 * @param {Array} fixtures
 * @param {string} resultsDir
 */
async function runCallCondition(condition, caller, fixtures, resultsDir) {
  const rawPath = path.join(resultsDir, `raw-${condition}.jsonl`);
  const cache = loadRawCache(rawPath);
  const references = fixtures.map((f) => f.reference);
  const toFetch = referencesNeedingFetch(references, cache);
  if (toFetch.length > 0) {
    console.log(`[${condition}] ${cache.size} cached, ${toFetch.length} to fetch...`);
  } else {
    console.log(`[${condition}] all ${references.length} references already cached.`);
  }

  const anomalies = [];
  for (const fixture of fixtures) {
    if (!cache.has(fixture.reference)) {
      let record;
      try {
        if (condition === 'ungrounded') {
          const result = await caller.quoteFromMemory(fixture.reference);
          record = { reference: fixture.reference, genre: fixture.genre, rawText: result.text, model: result.model, source: result.source };
        } else {
          const canonical = await retrieveCanonicalForPrompt(fixture.reference);
          const result = await caller.quoteGrounded(fixture.reference, canonical.text ?? fixture.text);
          record = {
            reference: fixture.reference,
            genre: fixture.genre,
            rawText: result.text,
            model: result.model,
            source: result.source,
            retrievalSource: canonical.source,
          };
        }
      } catch (err) {
        // A model caller should never throw (gloo-client falls back to stub
        // internally), but fail loud and cache the failure rather than
        // silently dropping the item, per Rule 12.
        record = { reference: fixture.reference, genre: fixture.genre, rawText: '', model: null, source: 'error', error: err.message };
      }
      record.fetchedAt = new Date().toISOString();
      if (record.source === 'stub' && caller.name !== MODEL_CALLERS.stub.name) {
        record.anomaly = true;
        record.anomalyReason = record.error ?? record.rawText;
      }
      if (record.source === 'error') record.anomaly = true;
      appendRawRecord(rawPath, record);
      cache.set(fixture.reference, record);
      if (toFetch.length > 0) await sleep(CALL_DELAY_MS);
    }
    const cached = cache.get(fixture.reference);
    if (cached.anomaly) anomalies.push(cached);
  }

  const items = [];
  for (const fixture of fixtures) {
    const raw = cache.get(fixture.reference);
    const verdict = await score(raw.rawText, fixture.reference);
    items.push({
      reference: fixture.reference,
      genre: fixture.genre,
      rawText: raw.rawText,
      model: raw.model,
      source: raw.source,
      anomaly: raw.anomaly ?? false,
      anomalyReason: raw.anomalyReason ?? null,
      verdict: verdict.verdict,
      similarityScore: verdict.similarityScore,
      canonicalText: verdict.canonicalText,
      correctReference: verdict.correctReference,
      diffSummary: verdict.diffSummary,
      // Cross-translation detection (src/alt-translations.js) — the closest
      // locally-shipped canon (BSB/WEB/KJV) for this item, computed by
      // verify_quote unconditionally. Lets RESULTS.md/METHODOLOGY.md report
      // how many ungrounded misses were actually accurate quotes of a
      // different public-domain translation than the BSB this benchmark
      // requested, entirely from this same scoring pass (no extra calls).
      closestTranslation: verdict.closestTranslation,
      similarityToClosest: verdict.similarityToClosest,
    });
  }
  return { items, anomalies };
}

/**
 * Derive the grounded-verify condition from the grounded condition's
 * already-scored items: no model calls, nothing to resume — this is the
 * full product path (retrieve -> generate -> verify -> auto-correct).
 * @param {Array} groundedItems
 * @param {string} resultsDir
 */
async function deriveGroundedVerifyCondition(groundedItems, resultsDir) {
  const rawPath = path.join(resultsDir, 'raw-grounded-verify.jsonl');
  const items = [];
  // Overwrite (not append) — this is a cheap, fully local derivation, always recomputed fresh from condition B's cache.
  writeFileSync(rawPath, '', 'utf8');
  for (const g of groundedItems) {
    const needsCorrection = !['exact', 'minor_variance'].includes(g.verdict);
    const finalText = needsCorrection && g.canonicalText ? g.canonicalText : g.rawText;
    const corrected = needsCorrection && Boolean(g.canonicalText);
    const finalVerdictResult = await score(finalText, g.reference);
    const item = {
      reference: g.reference,
      genre: g.genre,
      rawText: g.rawText,
      model: g.model,
      source: g.source,
      initialVerdict: g.verdict,
      initialSimilarity: g.similarityScore,
      corrected,
      finalText,
      verdict: finalVerdictResult.verdict,
      similarityScore: finalVerdictResult.similarityScore,
      canonicalText: finalVerdictResult.canonicalText,
      diffSummary: finalVerdictResult.diffSummary,
    };
    items.push(item);
    appendRawRecord(rawPath, item);
  }
  return { items, anomalies: [] };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { model: 'stub', condition: 'ungrounded', resultsDir: DEFAULT_RESULTS_DIR };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model') args.model = argv[++i];
    if (argv[i] === '--condition') args.condition = argv[++i];
    if (argv[i] === '--results-dir') args.resultsDir = argv[++i];
  }
  return args;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const { model, condition, resultsDir } = parseArgs(process.argv.slice(2));
  const caller = MODEL_CALLERS[model];
  if (!caller) {
    console.error(`Unknown model caller "${model}". Known: ${Object.keys(MODEL_CALLERS).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const conditionsToRun = condition === 'all' ? CONDITIONS : [condition];
  for (const c of conditionsToRun) {
    if (!CONDITIONS.includes(c)) {
      console.error(`Unknown condition "${c}". Known: ${CONDITIONS.join(', ')}, or "all".`);
      process.exitCode = 1;
      return;
    }
  }

  const fixtures = loadFixtures();
  console.log(`Running condition(s)=${conditionsToRun.join(',')} model=${model} (${caller.name}) against ${fixtures.length} fixture passages...\n`);

  const conditionResults = {};
  const allAnomalies = [];

  if (conditionsToRun.includes('ungrounded')) {
    const { items, anomalies } = await runCallCondition('ungrounded', caller, fixtures, resultsDir);
    conditionResults.ungrounded = items;
    allAnomalies.push(...anomalies);
  }
  if (conditionsToRun.includes('grounded') || conditionsToRun.includes('grounded-verify')) {
    const { items, anomalies } = await runCallCondition('grounded', caller, fixtures, resultsDir);
    conditionResults.grounded = items;
    allAnomalies.push(...anomalies);
  }
  if (conditionsToRun.includes('grounded-verify')) {
    const { items } = await deriveGroundedVerifyCondition(conditionResults.grounded, resultsDir);
    conditionResults['grounded-verify'] = items;
  }

  const modelsObserved = [...new Set(Object.values(conditionResults).flat().map((i) => i.model).filter(Boolean))];

  const output = {
    generatedAt: new Date().toISOString(),
    caller: { key: model, name: caller.name },
    modelsObserved,
    corpusSize: fixtures.length,
    conditions: {},
    anomalies: allAnomalies.map((a) => ({ reference: a.reference, source: a.source, anomalyReason: a.anomalyReason ?? a.error })),
  };

  for (const [name, items] of Object.entries(conditionResults)) {
    output.conditions[name] = {
      summary: summarizeItems(items),
      byGenre: summarizeByGenre(items),
      items,
    };
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(summarizeItems(items), null, 2));
  }

  if (conditionResults.ungrounded) {
    output.worstUngroundedExamples = worstExamples(conditionResults.ungrounded, 3);
  }

  if (condition === 'all') {
    const outPath = path.join(resultsDir, `results-${todayStamp()}.json`);
    writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
    console.log(`\nWrote ${outPath}`);
  }

  if (allAnomalies.length > 0) {
    console.log(`\n${allAnomalies.length} anomaly(ies) encountered (fallback-to-stub / error) — see anomalies[] in the results file.`);
  }
}

// Only run the CLI when this file is executed directly (`node benchmark/runner.js ...`),
// not when it's imported — e.g. by tests importing the pure prompt-builder exports above,
// which must stay zero-network per this repo's `npm test` contract.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('benchmark runner failed:', err);
    process.exitCode = 1;
  });
}
