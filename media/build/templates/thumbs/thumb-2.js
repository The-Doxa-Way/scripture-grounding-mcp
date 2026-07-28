/**
 * Candidate 2 — "the stat": the real benchmark headline number as a poster.
 * "1 in 3" is the honest rounding of the real ungrounded miss rate (1 -
 * ungroundedExactRate, results-2026-07-27.json via data.js) — same framing
 * RESULTS.md itself uses ("misquotes roughly 1 in 3 times"). "100%" is the
 * real grounded exact-match rate. Both asserted against DATA.benchmark below
 * so the copy can't silently drift from the numbers.
 */
import { buildThumbHTML } from './_base.js';

export function build(DATA) {
  const ungroundedPct = Math.round((1 - DATA.benchmark.ungroundedExactRate) * 100);
  if (ungroundedPct < 25 || ungroundedPct > 40) {
    throw new Error(
      `thumb-2: "1 in 3" no longer matches the real ungrounded miss rate (${ungroundedPct}%) — update the poster copy.`
    );
  }
  if (DATA.benchmark.groundedExactRate !== 1) {
    throw new Error('thumb-2: "100%" no longer matches the real grounded exact rate — update the poster copy.');
  }

  const extraCSS = `
    .stat-kicker {
      font-family: var(--font-display); font-weight: 700; font-size: 44px;
      color: var(--text-dim); text-align: center; margin-bottom: 4px;
    }
    .stat-hero {
      font-family: var(--font-display); font-weight: 900; font-size: 228px;
      line-height: 1; text-align: center; color: #fff;
    }
    .stat-hero .three { color: var(--red); }
    .stat-arrow-row {
      font-family: var(--font-display); font-weight: 900; font-size: 168px;
      line-height: 1; color: var(--green); text-align: center; margin-top: -6px;
    }
    .stat-sub {
      font-family: var(--font-display); font-weight: 700; font-size: 30px;
      letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold);
      text-align: center; margin-top: 22px;
    }
  `;

  const bodyHTML = `
    <div class="stat-kicker">AI misquotes the Bible</div>
    <div class="stat-hero">1 in <span class="three">3</span></div>
    <div class="stat-arrow-row">&rarr; 100%</div>
    <div class="stat-sub">when it reads the page</div>
  `;

  return buildThumbHTML({ extraCSS, bodyHTML });
}
