import { THEME_CSS, FONT_LINKS, esc } from './theme.js';

export const DURATION = 18;

export function build(DATA) {
  const p = DATA.getPassage;
  const inputJSON = JSON.stringify({ reference: p.reference }, null, 2);

  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .tool-panel { width: 1500px; padding: 64px 76px; }
  .tool-header { display: flex; align-items: baseline; gap: 18px; margin-bottom: 34px; }
  .tool-name { font-size: 30px; color: var(--accent); }
  .tool-name .tag { font-size: 20px; color: var(--text-dim); border: 1px solid var(--panel-border); border-radius: 6px; padding: 4px 10px; margin-left: 10px; }
  .call-json { font-size: 26px; white-space: pre; color: var(--text-dim); margin-bottom: 30px; }
  .call-json .val { color: var(--green); }
  .loading { font-size: 24px; color: var(--text-dim); margin-bottom: 30px; }
  .divider { border-top: 1px solid var(--panel-border); margin: 10px 0 40px; }
  .passage-text { font-family: var(--serif); font-style: italic; font-size: 40px; line-height: 1.6; }
  .citation { margin-top: 36px; font-family: var(--mono); font-size: 22px; color: var(--text-dim); letter-spacing: 0.02em; }
  .citation .ref { color: var(--gold); }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="panel tool-panel">
        <div class="tool-header" id="header" style="opacity:0">
          <span class="tool-name mono">get_passage<span class="tag">tool call</span></span>
        </div>
        <div class="call-json mono" id="call" style="opacity:0">{
  "reference": <span class="val">"${esc(p.reference)}"</span>
}</div>
        <div class="loading mono" id="loading" style="opacity:0">retrieving canonical text<span id="dots"></span></div>
        <div class="divider" id="divider" style="opacity:0"></div>
        <div id="response" style="opacity:0">
          <div class="passage-text serif">&ldquo;${esc(p.text)}&rdquo;</div>
          <div class="citation"><span class="ref">${esc(p.reference)}</span> &middot; ${esc(p.translation)} &middot; via YouVersion Platform API</div>
        </div>
      </div>
    </div>
    <script>
      const stage = document.getElementById('stage');
      const header = document.getElementById('header');
      const call = document.getElementById('call');
      const loading = document.getElementById('loading');
      const divider = document.getElementById('divider');
      const response = document.getElementById('response');
      const dots = document.getElementById('dots');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      const LOAD_START = 1.4, LOAD_END = 2.6;
      const RESPONSE_START = 2.9;

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.4));
        header.style.opacity = String(fade(t, 0.35, 0.4));
        call.style.opacity = String(fade(t, 0.65, 0.4));
        loading.style.opacity = String(t > LOAD_START && t < LOAD_END + 0.3 ? 1 : 0);
        dots.textContent = '.'.repeat(1 + Math.floor(t * 4) % 3);
        divider.style.opacity = String(fade(t, RESPONSE_START - 0.1, 0.3));
        response.style.opacity = String(fade(t, RESPONSE_START, 0.6));
      };
      window.__render(0);
    </script>
  </body></html>`;
}
