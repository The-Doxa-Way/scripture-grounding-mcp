/**
 * Candidate 1 — "the diff": the real Psalm 46:1-3 misquote (rawText vs
 * canonicalText, benchmark/results/results-2026-07-27.json) rendered as a
 * single-word proofreading correction — the crimson struck-through wrong
 * word with the green canonical word above it — plus the real 1-in-3 -> 100%
 * benchmark numbers as a corner chip.
 */
import { buildThumbHTML, mustContain } from './_base.js';

export function build(DATA) {
  const raw = DATA.misquote.raw;
  const canon = DATA.misquote.canonical;
  // Real substrings of the real raw/canonical sentences (data.js reads both
  // from results-2026-07-27.json) — never hand-typed independent of them.
  mustContain(raw, 'the mountains are moved');
  mustContain(canon, 'toppled');

  const ungroundedPct = Math.round((1 - DATA.benchmark.ungroundedExactRate) * 100);
  if (ungroundedPct < 25 || ungroundedPct > 40) {
    throw new Error(
      `thumb-1: "1 in 3" no longer matches the real ungrounded miss rate (${ungroundedPct}%) — update the chip copy.`
    );
  }
  if (DATA.benchmark.groundedExactRate !== 1) {
    throw new Error('thumb-1: "100%" no longer matches the real grounded exact rate — update the chip copy.');
  }

  const extraCSS = `
    .badge {
      position: absolute; top: 56px; left: 56px;
      background: var(--red); color: #fff;
      font-family: var(--font-display); font-weight: 900; font-size: 32px;
      letter-spacing: 0.06em; text-transform: uppercase;
      padding: 16px 30px; border-radius: 12px;
      box-shadow: 0 14px 34px rgba(229, 37, 40, 0.45);
    }
    .diff-phrase {
      font-family: var(--serif); font-style: italic; color: var(--text);
      font-size: 104px; line-height: 1.2; text-align: center;
    }
    .word-wrap { position: relative; display: inline-block; }
    .word-wrap .correction {
      position: absolute; left: 50%; top: -0.82em; transform: translateX(-50%);
      font-size: 0.42em; color: var(--green); white-space: nowrap;
    }
    .word-wrap .wrong-word {
      color: var(--red);
      text-decoration: line-through;
      text-decoration-color: var(--red);
      text-decoration-thickness: 5px;
    }
    .refline {
      margin-top: 34px;
      font-family: var(--font-display); font-weight: 700;
      letter-spacing: 0.14em; text-transform: uppercase;
      font-size: 26px; color: var(--gold); text-align: center;
    }
    .chip {
      position: absolute; bottom: 56px; right: 56px;
      background: var(--panel); border: 1px solid var(--panel-border);
      border-radius: 18px; padding: 22px 34px;
      display: flex; align-items: center; gap: 16px;
      font-family: var(--font-display); font-weight: 900; font-size: 42px;
    }
    .chip .bad { color: var(--red); }
    .chip .arrow { color: var(--text-dim); font-weight: 700; }
    .chip .good { color: var(--green); }
  `;

  const bodyHTML = `
    <div class="badge">&#10007; MISQUOTE</div>
    <div class="diff-phrase">
      the mountains are
      <span class="word-wrap">
        <span class="correction">toppled</span>
        <span class="wrong-word">moved</span>
      </span>
    </div>
    <div class="refline">Psalm 46:1&ndash;3 &middot; BSB canonical</div>
    <div class="chip"><span class="bad">1 in 3</span><span class="arrow">&rarr;</span><span class="good">100%</span></div>
  `;

  return buildThumbHTML({ extraCSS, bodyHTML });
}
