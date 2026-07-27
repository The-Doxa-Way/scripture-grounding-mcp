#!/usr/bin/env node
/**
 * Benchmark runner skeleton — see benchmark/METHODOLOGY.md for the design
 * this implements. Model callers are pluggable and env-keyed; with no keys
 * set, everything runs against a stub caller so the harness is runnable and
 * inspectable with zero external dependencies (consistent with the rest of
 * this repo's "runs today" design).
 *
 * Usage:
 *   node benchmark/runner.js --model stub --condition ungrounded
 *   node benchmark/runner.js --model gloo --condition grounded-verify
 */
import { loadFixtures } from '../src/fixtures.js';
import { verifyQuote } from '../src/verify-quote.js';
import { createGlooClient } from '../src/gloo-client.js';
import { loadDoxaEnvFiles } from '../src/env.js';

/**
 * A "model caller" answers: "Quote <reference> exactly." and returns raw text.
 * Real callers should be added here, keyed by env vars they need
 * (OPENAI_API_KEY, ANTHROPIC_API_KEY, GLOO_CLIENT_ID/GLOO_CLIENT_SECRET,
 * etc.) — deliberately NOT implemented for every provider in this skeleton;
 * add the one(s) you're benchmarking.
 */
const MODEL_CALLERS = {
  /** Deterministic no-network stub: always returns a fixed, wrong-on-purpose answer, to exercise the harness end-to-end. */
  stub: {
    name: 'stub (no network)',
    async quoteFromMemory(reference) {
      return `[stub caller does not actually know ${reference} — this exists to exercise the harness, not to measure a real model]`;
    },
  },
  /** Uses this repo's own Gloo client as an example "ungrounded" caller: asks Gloo to quote from memory with NO passage supplied. */
  'gloo-ungrounded': {
    name: 'Gloo AI Studio (auto_routing, no grounding)',
    async quoteFromMemory(reference) {
      loadDoxaEnvFiles();
      const gloo = createGlooClient();
      const result = await gloo.chat({
        systemPrompt: 'Quote the requested Bible verse from your own knowledge, in the Berean Standard Bible (BSB) translation if you know it. Output ONLY the verse text, no commentary.',
        userMessage: `Quote ${reference} exactly.`,
        temperature: 0,
      });
      return result.text;
    },
  },
};

async function runUngrounded(callerKey) {
  const caller = MODEL_CALLERS[callerKey];
  if (!caller) throw new Error(`Unknown model caller "${callerKey}". Known: ${Object.keys(MODEL_CALLERS).join(', ')}`);

  const fixtures = loadFixtures();
  const results = [];
  for (const fixture of fixtures) {
    const raw = await caller.quoteFromMemory(fixture.reference);
    const verdict = await verifyQuote({ quote: raw, claimedReference: fixture.reference });
    results.push({ reference: fixture.reference, verdict: verdict.verdict, similarity: verdict.similarityScore });
  }
  return results;
}

function summarize(results) {
  const counts = { exact: 0, minor_variance: 0, misquote: 0, misattribution: 0, not_found: 0 };
  let similaritySum = 0;
  let similarityCount = 0;
  for (const r of results) {
    counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
    if (typeof r.similarity === 'number') {
      similaritySum += r.similarity;
      similarityCount++;
    }
  }
  const n = results.length;
  return {
    n,
    exactMatchRate: n ? counts.exact / n : null,
    misattributionRate: n ? counts.misattribution / n : null,
    notFoundRate: n ? counts.not_found / n : null,
    meanWordErrorRate: similarityCount ? 1 - similaritySum / similarityCount : null,
    counts,
  };
}

function parseArgs(argv) {
  const args = { model: 'stub', condition: 'ungrounded' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model') args.model = argv[++i];
    if (argv[i] === '--condition') args.condition = argv[++i];
  }
  return args;
}

async function main() {
  const { model, condition } = parseArgs(process.argv.slice(2));
  if (condition !== 'ungrounded') {
    console.error(
      `Condition "${condition}" is not implemented in this skeleton yet (only "ungrounded" is wired up). ` +
        `See benchmark/METHODOLOGY.md for the "grounded" and "grounded-verify" condition designs.`
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Running condition=${condition} model=${model} against ${loadFixtures().length} fixture passages...\n`);
  const results = await runUngrounded(model);
  for (const r of results) {
    console.log(`  ${r.verdict.padEnd(14)} sim=${r.similarity?.toFixed(2) ?? 'n/a'}  ${r.reference}`);
  }
  console.log('\nSummary:', JSON.stringify(summarize(results), null, 2));
}

main().catch((err) => {
  console.error('benchmark runner failed:', err);
  process.exitCode = 1;
});
