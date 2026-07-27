import { THEME_CSS, FONT_LINKS, esc, buildDiffHTML } from './theme.js';

export const DURATION = 22;

export function build(DATA) {
  const m = DATA.misquote;
  const raw = buildDiffHTML(m.diffOps, 'b', 'red');
  const canon = buildDiffHTML(m.diffOps, 'a', 'green');
  const similarityPct = (m.similarity * 100).toFixed(0);

  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .tool-panel { width: 1600px; padding: 60px 76px; }
  .tool-header { display: flex; align-items: baseline; gap: 18px; margin-bottom: 24px; }
  .tool-name { font-size: 30px; color: var(--accent); }
  .tool-name .tag { font-size: 20px; color: var(--text-dim); border: 1px solid var(--panel-border); border-radius: 6px; padding: 4px 10px; margin-left: 10px; }
  .call-line { font-size: 24px; color: var(--text-dim); margin-bottom: 22px; }
  .call-line .ref { color: var(--gold); }
  .loading { font-size: 22px; color: var(--text-dim); margin-bottom: 22px; }
  .verdict-row { display: flex; align-items: baseline; gap: 26px; margin-bottom: 30px; }
  .verdict-badge { font-size: 40px; font-weight: 700; letter-spacing: 0.03em; color: var(--red); }
  .verdict-sim { font-size: 24px; color: var(--text-dim); }
  .reason { font-size: 20px; color: var(--text-dim); margin-bottom: 30px; font-style: italic; }
  .block-label { font-size: 18px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-dim); margin-bottom: 10px; }
  .textblock { position: relative; font-family: var(--serif); font-style: italic; font-size: 27px; line-height: 1.5; }
  .textblock .plain, .textblock .hl { margin: 0; }
  .textblock .hl { position: absolute; inset: 0; }
  .ai-block { margin-bottom: 26px; }
  .corrected-row { display: flex; align-items: center; gap: 18px; margin-top: 34px; padding-top: 30px; border-top: 1px solid var(--panel-border); }
  .corrected-tag { font-size: 26px; color: var(--green); font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .corrected-text { font-family: var(--serif); font-style: italic; font-size: 28px; line-height: 1.5; color: var(--text); }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="panel tool-panel">
        <div class="tool-header" id="header" style="opacity:0">
          <span class="tool-name mono">verify_quote<span class="tag">tool call</span></span>
        </div>
        <div class="call-line mono" id="call" style="opacity:0">claimedReference: <span class="ref">"${esc(m.reference)}"</span> &middot; quote: (the reply above)</div>
        <div class="loading mono" id="loading" style="opacity:0">scoring against canonical BSB text<span id="dots"></span></div>

        <div class="verdict-row" id="verdict" style="opacity:0">
          <span class="verdict-badge mono">MISQUOTE</span>
          <span class="verdict-sim mono">similarity ${esc(String(m.similarity.toFixed(2)))} &middot; ${similarityPct}%</span>
        </div>
        <div class="reason mono" id="reason" style="opacity:0">${esc(m.reason)}</div>

        <div class="ai-block">
          <div class="block-label">as quoted</div>
          <div class="textblock" id="raw-wrap" style="opacity:0">
            <p class="plain">${raw.plainHTML}</p>
            <p class="hl" id="raw-hl" style="opacity:0">${raw.highlightHTML}</p>
          </div>
        </div>
        <div class="canon-block" id="canon-wrap" style="opacity:0">
          <div class="block-label">canonical</div>
          <div class="textblock">
            <p class="plain">${canon.plainHTML}</p>
            <p class="hl" id="canon-hl" style="opacity:0">${canon.highlightHTML}</p>
          </div>
        </div>

        <div class="corrected-row" id="corrected" style="opacity:0">
          <span class="corrected-tag mono">corrected &#10003;</span>
          <span class="corrected-text serif">&ldquo;${esc(m.canonical)}&rdquo;</span>
        </div>
      </div>
    </div>
    <script>
      const stage = document.getElementById('stage');
      const header = document.getElementById('header');
      const call = document.getElementById('call');
      const loading = document.getElementById('loading');
      const dots = document.getElementById('dots');
      const verdict = document.getElementById('verdict');
      const reason = document.getElementById('reason');
      const rawWrap = document.getElementById('raw-wrap');
      const rawHl = document.getElementById('raw-hl');
      const canonWrap = document.getElementById('canon-wrap');
      const canonHl = document.getElementById('canon-hl');
      const corrected = document.getElementById('corrected');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      const LOAD_START = 1.2, LOAD_END = 2.2;
      const VERDICT_START = 2.5;
      const DIFF_START = 3.6;
      const HL_START = 4.3, HL_DUR = 0.9;
      const CORRECTED_START = 16.0;

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.4));
        header.style.opacity = String(fade(t, 0.35, 0.4));
        call.style.opacity = String(fade(t, 0.65, 0.4));
        loading.style.opacity = String(t > LOAD_START && t < LOAD_END + 0.3 ? 1 : 0);
        dots.textContent = '.'.repeat(1 + Math.floor(t * 4) % 3);

        verdict.style.opacity = String(fade(t, VERDICT_START, 0.5));
        reason.style.opacity = String(fade(t, VERDICT_START + 0.3, 0.5));

        rawWrap.style.opacity = String(fade(t, DIFF_START, 0.5));
        canonWrap.style.opacity = String(fade(t, DIFF_START + 0.3, 0.5));
        rawHl.style.opacity = String(fade(t, HL_START, HL_DUR));
        canonHl.style.opacity = String(fade(t, HL_START + 0.15, HL_DUR));

        corrected.style.opacity = String(fade(t, CORRECTED_START, 0.6));
      };
      window.__render(0);
    </script>
  </body></html>`;
}
