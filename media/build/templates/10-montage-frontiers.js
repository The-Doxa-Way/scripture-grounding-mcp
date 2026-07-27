import { THEME_CSS, FONT_LINKS, esc } from './theme.js';

export const DURATION = 12;

export function build(DATA) {
  const words = DATA.frontierWords;
  const spans = words
    .map((w, i) => `<span class="word" id="word-${i}" style="opacity:0">${esc(w)}</span>`)
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .word-wrap { position: relative; width: 1700px; height: 260px; display: flex; align-items: center; justify-content: center; }
  .word { position: absolute; font-family: var(--serif); font-size: 96px; text-align: center; letter-spacing: 0.01em; }
  .kicker { position: absolute; top: 96px; left: 0; right: 0; text-align: center; }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="kicker mono" id="kicker" style="opacity:0">everywhere the frontier goes</div>
      <div class="word-wrap">${spans}</div>
    </div>
    <script>
      const N = ${words.length};
      const TOTAL = ${DURATION};
      const SLOT = TOTAL / N;
      const stage = document.getElementById('stage');
      const kicker = document.getElementById('kicker');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.4));
        kicker.style.opacity = String(fade(t, 0.3, 0.5));
        for (let i = 0; i < N; i++) {
          const start = i * SLOT;
          const end = start + SLOT;
          const el = document.getElementById('word-' + i);
          const inT = fade(t, start + 0.15, 0.35);
          const outT = 1 - fade(t, end - 0.35, 0.35);
          const visible = t >= start && t < end + 0.4;
          el.style.opacity = visible ? String(Math.min(inT, outT)) : '0';
        }
      };
      window.__render(0);
    </script>
  </body></html>`;
}
