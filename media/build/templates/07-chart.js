import { THEME_CSS, FONT_LINKS, esc, easeOutCubic } from './theme.js';

export const DURATION = 15;

export function build(DATA) {
  const b = DATA.benchmark;
  const ungrounded = b.ungroundedExactRate; // 0..1
  const grounded = b.groundedExactRate; // 0..1
  const ungroundedLabel = (ungrounded * 100).toFixed(1) + '%';
  const groundedLabel = (grounded * 100).toFixed(1) + '%';

  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .chart-panel { width: 1200px; padding: 72px 88px 64px; }
  .chart-title { font-family: var(--font-display); font-weight: 700; font-size: 30px; letter-spacing: 0.04em; color: var(--text); margin-bottom: 8px; text-align: center; }
  .chart-sub { font-size: 20px; color: var(--text-dim); text-align: center; margin-bottom: 72px; }
  .bars { display: flex; align-items: flex-end; justify-content: center; gap: 160px; height: 560px; }
  .bar-col { display: flex; flex-direction: column; align-items: center; width: 220px; height: 100%; justify-content: flex-end; }
  .bar-value { font-size: 44px; font-weight: 700; margin-bottom: 18px; font-family: var(--mono); }
  .bar-track { width: 160px; height: 100%; display: flex; align-items: flex-end; }
  .bar-fill { width: 100%; transform-origin: bottom; border-radius: 8px 8px 4px 4px; }
  .bar-fill.ungrounded { background: linear-gradient(180deg, #E52528, #7E1416); }
  .bar-fill.grounded { background: linear-gradient(180deg, #30D158, #1A7330); }
  .bar-label { margin-top: 24px; font-size: 24px; color: var(--text-dim); font-family: var(--mono); }
  .caption-strip { bottom: 56px; }
  .models-note { position: absolute; bottom: 26px; left: 96px; right: 96px; text-align: center; font-size: 18px; color: var(--text-dim); opacity: 0.7; }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="panel chart-panel">
        <div class="chart-title" id="title" style="opacity:0">Exact-quote rate</div>
        <div class="chart-sub mono" id="sub" style="opacity:0">${b.corpusSize} BSB passages &middot; same Gloo AI Studio call, auto-routed</div>
        <div class="bars">
          <div class="bar-col">
            <div class="bar-value mono" id="val-ungrounded" style="color:var(--red)">0%</div>
            <div class="bar-track"><div class="bar-fill ungrounded" id="bar-ungrounded" style="transform: scaleY(0)"></div></div>
            <div class="bar-label">ungrounded (memory)</div>
          </div>
          <div class="bar-col">
            <div class="bar-value mono" id="val-grounded" style="color:var(--green)">0%</div>
            <div class="bar-track"><div class="bar-fill grounded" id="bar-grounded" style="transform: scaleY(0)"></div></div>
            <div class="bar-label">grounded (retrieved)</div>
          </div>
        </div>
      </div>
      <div class="models-note mono" id="models" style="opacity:0">models observed: ${b.models.map(esc).join(', ')}</div>
    </div>
    <script>
      const UNGROUNDED = ${ungrounded};
      const GROUNDED = ${grounded};
      const UNGROUNDED_LABEL = ${JSON.stringify(ungroundedLabel)};
      const GROUNDED_LABEL = ${JSON.stringify(groundedLabel)};

      const stage = document.getElementById('stage');
      const title = document.getElementById('title');
      const sub = document.getElementById('sub');
      const models = document.getElementById('models');
      const barU = document.getElementById('bar-ungrounded');
      const barG = document.getElementById('bar-grounded');
      const valU = document.getElementById('val-ungrounded');
      const valG = document.getElementById('val-grounded');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }
      function easeOutCubic(x) { const c = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - c, 3); }

      const GROW_START = 1.1, GROW_DUR = 2.6;

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.4));
        title.style.opacity = String(fade(t, 0.3, 0.5));
        sub.style.opacity = String(fade(t, 0.6, 0.5));
        models.style.opacity = String(fade(t, 4.2, 0.6));

        const growT = easeOutCubic(fade(t, GROW_START, GROW_DUR));
        barU.style.transform = 'scaleY(' + (growT * UNGROUNDED).toFixed(4) + ')';
        barG.style.transform = 'scaleY(' + (growT * GROUNDED).toFixed(4) + ')';
        valU.textContent = (growT * parseFloat(UNGROUNDED_LABEL)).toFixed(1) + '%';
        valG.textContent = (growT * parseFloat(GROUNDED_LABEL)).toFixed(1) + '%';
        if (growT >= 0.999) {
          valU.textContent = UNGROUNDED_LABEL;
          valG.textContent = GROUNDED_LABEL;
        }
      };
      window.__render(0);
    </script>
  </body></html>`;
}
