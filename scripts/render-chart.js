#!/usr/bin/env node
/**
 * Renders benchmark/results/chart.svg: a simple bar chart of the exact-quote
 * rate per condition (ungrounded / grounded / grounded-verify), read from a
 * results-<date>.json file produced by benchmark/runner.js.
 *
 * Hand-rolled SVG, no chart library — this only ever needs three bars, and
 * a dependency isn't worth it for that. Clean and readable at video scale
 * (used in the Kaggle submission's demo video).
 *
 * Usage:
 *   node scripts/render-chart.js [path/to/results-YYYY-MM-DD.json]
 * With no argument, uses the newest benchmark/results/results-*.json file.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(__dirname, '..', 'benchmark', 'results');

const CONDITION_LABELS = {
  ungrounded: 'Ungrounded',
  grounded: 'Grounded',
  'grounded-verify': 'Grounded + verify',
};
const CONDITION_ORDER = ['ungrounded', 'grounded', 'grounded-verify'];
const BAR_COLOR = '#3b6ea5';
const BAR_COLOR_DARK = '#7ab3ef';
const TEXT_COLOR = '#1a1a1a';
const TEXT_COLOR_DARK = '#eaeaea';
const GRID_COLOR = '#d7d7d7';

function findLatestResultsFile() {
  const files = readdirSync(RESULTS_DIR)
    .filter((f) => /^results-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`No results-*.json files found in ${RESULTS_DIR}. Run "npm run benchmark" first.`);
  }
  return path.join(RESULTS_DIR, files[files.length - 1]);
}

/**
 * Pure builder: given the parsed results JSON, produce the SVG markup.
 * Exported so it can be unit-tested without touching the filesystem.
 * @param {object} results - parsed results-<date>.json
 * @returns {string} SVG markup
 */
export function buildChartSvg(results) {
  const width = 720;
  const height = 420;
  const marginLeft = 70;
  const marginRight = 30;
  const marginTop = 50;
  const marginBottom = 90;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  const bars = CONDITION_ORDER.filter((key) => results.conditions?.[key]).map((key) => ({
    key,
    label: CONDITION_LABELS[key] ?? key,
    rate: results.conditions[key].summary.exactRate ?? 0,
    n: results.conditions[key].summary.n,
  }));

  const barSlot = plotWidth / bars.length;
  const barWidth = Math.min(120, barSlot * 0.55);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
    const y = marginTop + plotHeight * (1 - frac);
    return (
      `<line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${marginLeft + plotWidth}" y2="${y.toFixed(1)}" ` +
      `class="grid-line" />` +
      `<text x="${marginLeft - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="axis-label">${Math.round(frac * 100)}%</text>`
    );
  });

  const barEls = bars.map((bar, i) => {
    const slotX = marginLeft + i * barSlot;
    const barX = slotX + (barSlot - barWidth) / 2;
    const barHeight = plotHeight * bar.rate;
    const barY = marginTop + plotHeight - barHeight;
    const pct = (bar.rate * 100).toFixed(1);
    return (
      `<rect x="${barX.toFixed(1)}" y="${barY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" class="bar" rx="4" />` +
      `<text x="${(barX + barWidth / 2).toFixed(1)}" y="${(barY - 10).toFixed(1)}" text-anchor="middle" class="bar-value">${pct}%</text>` +
      `<text x="${(barX + barWidth / 2).toFixed(1)}" y="${(marginTop + plotHeight + 28).toFixed(1)}" text-anchor="middle" class="axis-label">${bar.label}</text>` +
      `<text x="${(barX + barWidth / 2).toFixed(1)}" y="${(marginTop + plotHeight + 48).toFixed(1)}" text-anchor="middle" class="axis-sublabel">(n=${bar.n})</text>`
    );
  });

  const modelLine = results.modelsObserved?.length ? `Model: ${results.modelsObserved.join(', ')}` : '';
  const dateLine = results.generatedAt ? new Date(results.generatedAt).toISOString().slice(0, 10) : '';
  const subtitle = [modelLine, dateLine].filter(Boolean).join(' · ');

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, Helvetica, Arial, sans-serif">
  <style>
    :root { --bg: #ffffff; --text: ${TEXT_COLOR}; --bar: ${BAR_COLOR}; --grid: ${GRID_COLOR}; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #16181d; --text: ${TEXT_COLOR_DARK}; --bar: ${BAR_COLOR_DARK}; --grid: #3a3d44; }
    }
    .bg { fill: var(--bg); }
    .bar { fill: var(--bar); }
    .grid-line { stroke: var(--grid); stroke-width: 1; }
    .axis-label { fill: var(--text); font-size: 15px; }
    .axis-sublabel { fill: var(--text); font-size: 12px; opacity: 0.65; }
    .bar-value { fill: var(--text); font-size: 17px; font-weight: 600; }
    .title { fill: var(--text); font-size: 20px; font-weight: 700; }
    .subtitle { fill: var(--text); font-size: 13px; opacity: 0.7; }
  </style>
  <rect class="bg" x="0" y="0" width="${width}" height="${height}" />
  <text x="${marginLeft}" y="26" class="title">Exact-quote rate by condition</text>
  <text x="${marginLeft}" y="44" class="subtitle">${subtitle}</text>
  ${gridLines.join('\n  ')}
  ${barEls.join('\n  ')}
  <line x1="${marginLeft}" y1="${marginTop + plotHeight}" x2="${marginLeft + plotWidth}" y2="${marginTop + plotHeight}" class="grid-line" />
</svg>
`;
}

function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : findLatestResultsFile();
  const results = JSON.parse(readFileSync(inputPath, 'utf8'));
  const svg = buildChartSvg(results);
  const outPath = path.join(RESULTS_DIR, 'chart.svg');
  writeFileSync(outPath, svg, 'utf8');
  console.log(`Read ${inputPath}`);
  console.log(`Wrote ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
