import { THEME_CSS, FONT_LINKS } from './theme.js';

export const DURATION = 21;

export function build() {
  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .stage { justify-content: center; gap: 30px; }
  .kicker { font-family: var(--font-display); font-size: 26px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); }
  .tool-panel { width: 1560px; padding: 56px 72px; }
  .tool-name { font-size: 30px; color: var(--accent); }
  .tool-name .tag { font-size: 20px; color: var(--text-dim); border: 1px solid var(--panel-border); border-radius: 6px; padding: 4px 10px; margin-left: 10px; }
  .call-json { font-size: 26px; white-space: pre; color: var(--text-dim); margin: 22px 0 26px; }
  .call-json .val { color: var(--green); }
  .result-line { font-size: 30px; line-height: 1.75; }
  .result-line .num { color: var(--gold); }
  .result-line .ok { color: var(--green); }
  .result-line .dim2 { color: var(--text-dim); font-size: 24px; }
  .divider { border-top: 1px solid var(--panel-border); margin: 26px 0; }
  .proof { font-size: 27px; line-height: 1.8; }
  .proof .cmd { color: var(--accent-dim); }
  .proof .book-range { color: var(--gold); }
  .verdict-chip { display: inline-block; border-radius: 8px; padding: 4px 14px; font-size: 25px; }
  .chip-green { background: var(--green-bg); color: var(--green); }
  .chip-amber { background: rgba(255, 149, 0, 0.15); color: var(--amber); }
  .close-line { font-family: var(--font-display); font-size: 40px; font-weight: 600; letter-spacing: 0.01em; }
  .close-line .url { color: var(--text-dim); font-family: var(--mono); font-size: 28px; margin-left: 26px; }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="kicker" id="kicker" style="opacity:0">One more thing</div>
      <div class="panel tool-panel">
        <div class="tool-name mono" id="header" style="opacity:0">get_passage<span class="tag">whole book</span></div>
        <div class="call-json mono" id="call" style="opacity:0">{
  "reference": <span class="val">"Romans"</span>
}</div>
        <div class="result-line mono" id="result" style="opacity:0">
          &rarr; <span class="num">16 chapters</span> &middot; <span class="num">9,401 words</span> &middot; word for word<br>
          <span class="dim2">source: bsb-corpus &middot; committed public-domain BSB &middot; no API key</span>
        </div>
        <div class="divider" id="div1" style="opacity:0"></div>
        <div class="proof mono" id="proof" style="opacity:0">
          <span class="cmd">$ npm run test:books</span><br>
          all 66 books &middot; <span class="book-range">Genesis &rarr; Revelation</span> &middot; read-through <span class="verdict-chip chip-green">exact &middot; 1.0</span><br>
          <span id="proof2" style="opacity:0">change two words anywhere &rarr; <span class="verdict-chip chip-amber">minor_variance &middot; 0.99984</span> &middot; pinpointed: <span class="book-range">Romans 8</span></span>
        </div>
      </div>
      <div class="close-line" id="close" style="opacity:0">Test it yourself.<span class="url">doxa.app/scripture-grounding</span></div>
    </div>
    <script>
      const el = (id) => document.getElementById(id);
      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }
      window.__render = function (t) {
        el('stage').style.opacity = String(fade(t, 0, 0.5));
        el('kicker').style.opacity = String(fade(t, 0.4, 0.5));
        el('header').style.opacity = String(fade(t, 2.2, 0.4));
        el('call').style.opacity = String(fade(t, 2.9, 0.4));
        el('result').style.opacity = String(fade(t, 4.4, 0.6));
        el('div1').style.opacity = String(fade(t, 9.6, 0.3));
        el('proof').style.opacity = String(fade(t, 10.0, 0.6));
        el('proof2').style.opacity = String(fade(t, 13.2, 0.6));
        el('close').style.opacity = String(fade(t, 16.6, 0.7));
      };
      window.__render(0);
    </script>
  </body></html>`;
}
