import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChartSvg } from '../scripts/render-chart.js';

function fakeResults() {
  return {
    generatedAt: '2026-07-27T12:00:00.000Z',
    modelsObserved: ['gloo-google-gemini-2.5-flash-lite'],
    conditions: {
      ungrounded: { summary: { exactRate: 0.2, n: 34 } },
      grounded: { summary: { exactRate: 0.9, n: 34 } },
      'grounded-verify': { summary: { exactRate: 1, n: 34 } },
    },
  };
}

test('buildChartSvg produces a valid, self-contained SVG with one bar per condition', () => {
  const svg = buildChartSvg(fakeResults());
  assert.match(svg, /^<svg /);
  assert.match(svg, /<\/svg>\s*$/);
  // three bars
  assert.equal((svg.match(/class="bar"/g) ?? []).length, 3);
  // percentages rendered
  assert.match(svg, /20\.0%/);
  assert.match(svg, /90\.0%/);
  assert.match(svg, /100\.0%/);
  // labels present
  assert.match(svg, /Ungrounded/);
  assert.match(svg, /Grounded \+ verify/);
  // no external resource loading (self-contained; the xmlns declaration is the only "http" text expected)
  assert.doesNotMatch(svg, /<image|@import|url\(https?:/);
});

test('buildChartSvg handles a partial results object (fewer than 3 conditions) without crashing', () => {
  const partial = { conditions: { ungrounded: { summary: { exactRate: 0.5, n: 10 } } } };
  const svg = buildChartSvg(partial);
  assert.equal((svg.match(/class="bar"/g) ?? []).length, 1);
});
