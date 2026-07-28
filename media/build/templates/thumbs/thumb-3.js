/**
 * Candidate 3 — "the terminal": the real ungrounded prompt (data.js's
 * typedPrompt, the benchmark's own runner.js ungroundedUserMessage — same
 * string clip 01's video uses) and a red-flagged excerpt of the real
 * misquoted reply, under a big Satoshi 900 headline.
 */
import { buildThumbHTML, mustContain } from './_base.js';

export function build(DATA) {
  const prompt = DATA.misquote.typedPrompt;
  const raw = DATA.misquote.raw;
  mustContain(raw, 'the mountains are moved into the heart of the sea');

  const extraCSS = `
    .hero-overlay {
      font-family: var(--font-display); font-weight: 900; font-size: 92px;
      text-transform: uppercase; text-align: center; color: #fff;
      line-height: 1.08; margin-bottom: 52px;
    }
    .hero-overlay .accent-word { color: var(--red); }
    .term-panel { width: 1000px; padding: 40px 48px; }
    .term-prompt {
      font-family: var(--mono); font-size: 25px; color: var(--text-dim);
      margin-bottom: 22px;
    }
    .term-prompt .lead { color: var(--accent); }
    .term-reply {
      font-family: var(--mono); font-size: 21px; color: var(--text-dim);
      line-height: 1.5;
    }
    .term-reply .flag {
      color: var(--red); font-weight: 700; margin-left: 12px;
      background: var(--red-bg); padding: 2px 10px; border-radius: 6px;
    }
  `;

  const bodyHTML = `
    <div class="hero-overlay">STOP AI<br>
      <span class="accent-word">MISQUOTING</span> SCRIPTURE
    </div>
    <div class="panel term-panel">
      <div class="term-prompt"><span class="lead">$&nbsp;</span>${prompt}</div>
      <div class="term-reply">&gt; &hellip;the mountains are moved into the heart of the sea&hellip;<span class="flag">&#10007; MISQUOTE</span></div>
    </div>
  `;

  return buildThumbHTML({ extraCSS, bodyHTML });
}
