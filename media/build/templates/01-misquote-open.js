import { THEME_CSS, FONT_LINKS, esc, buildDiffHTML } from './theme.js';

export const DURATION = 25;

export function build(DATA) {
  const m = DATA.misquote;
  const r = DATA.refusal;
  const prompt = m.typedPrompt;

  const raw = buildDiffHTML(m.diffOps, 'b', 'red');
  const canon = buildDiffHTML(m.diffOps, 'a', 'green');

  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .chat-panel { width: 1600px; padding: 64px 72px; }
  .prompt-line { font-size: 34px; margin-bottom: 40px; }
  .prompt-line .lead { color: var(--text-dim); }
  .block-label { font-size: 20px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 14px; }
  .textblock { position: relative; font-family: var(--serif); font-style: italic; font-size: 32px; line-height: 1.55; }
  .textblock .plain, .textblock .hl { margin: 0; }
  .textblock .hl { position: absolute; inset: 0; }
  .ai-block { margin-bottom: 44px; }
  .canon-block { }
  .refusal-panel {
    position: absolute; left: 96px; right: 96px; bottom: 88px;
    display: flex; align-items: baseline; gap: 20px;
    font-family: var(--mono); font-size: 22px; color: var(--text-dim);
    border-top: 1px solid var(--panel-border); padding-top: 22px;
  }
  .refusal-panel .ref { color: var(--gold); }
  .refusal-panel .quote { font-family: var(--serif); font-style: italic; color: var(--text); }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="panel chat-panel">
        <div class="prompt-line mono"><span class="lead">$&nbsp;</span><span id="typed"></span><span class="cursor" id="cursor"></span></div>
        <div class="ai-block">
          <div class="block-label">assistant, from memory</div>
          <div class="textblock" id="raw-wrap" style="opacity:0">
            <p class="plain">${raw.plainHTML}</p>
            <p class="hl" id="raw-hl" style="opacity:0">${raw.highlightHTML}</p>
          </div>
        </div>
        <div class="canon-block" id="canon-wrap" style="opacity:0">
          <div class="block-label">BSB &middot; canonical</div>
          <div class="textblock">
            <p class="plain">${canon.plainHTML}</p>
            <p class="hl" id="canon-hl" style="opacity:0">${canon.highlightHTML}</p>
          </div>
        </div>
      </div>
      <div class="refusal-panel" id="refusal" style="opacity:0">
        <span class="ref">${esc(r.reference)}</span>
        <span class="dim">&mdash; one model simply refused:</span>
        <span class="quote">&ldquo;${esc(r.raw)}&rdquo;</span>
      </div>
    </div>
    <script>
      const PROMPT = ${JSON.stringify(prompt)};
      const typedEl = document.getElementById('typed');
      const cursorEl = document.getElementById('cursor');
      const stage = document.getElementById('stage');
      const rawWrap = document.getElementById('raw-wrap');
      const rawHl = document.getElementById('raw-hl');
      const canonWrap = document.getElementById('canon-wrap');
      const canonHl = document.getElementById('canon-hl');
      const refusal = document.getElementById('refusal');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      const TYPE_START = 0.4, TYPE_CPS = 15;
      const AI_SHOW = 3.2;
      const HL_START = 6.2, HL_DUR = 1.0;
      const CANON_SHOW = 6.6;
      const REFUSAL_SHOW = 20.2;

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.5));

        const chars = Math.floor(Math.max(0, t - TYPE_START) * TYPE_CPS);
        typedEl.textContent = PROMPT.slice(0, Math.min(PROMPT.length, chars));
        const typingDone = chars >= PROMPT.length;
        cursorEl.classList.toggle('hidden', typingDone && Math.floor(t * 3) % 2 === 0);

        rawWrap.style.opacity = String(fade(t, AI_SHOW, 0.5));
        rawHl.style.opacity = String(fade(t, HL_START, HL_DUR));

        canonWrap.style.opacity = String(fade(t, CANON_SHOW, 0.5));
        canonHl.style.opacity = String(fade(t, HL_START + 0.15, HL_DUR));

        refusal.style.opacity = String(fade(t, REFUSAL_SHOW, 0.7));
      };
      window.__render(0);
    </script>
  </body></html>`;
}
