import { THEME_CSS, FONT_LINKS, esc } from './theme.js';

export const DURATION = 10;

export function build(DATA) {
  const c = DATA.close;
  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .close-line { font-family: var(--font-display); font-weight: 700; font-size: 56px; text-align: center; max-width: 1400px; line-height: 1.4; margin-bottom: 46px; }
  .url { font-size: 30px; color: var(--accent); letter-spacing: 0.02em; }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="close-line" id="line">${esc(c.line)}</div>
      <div class="url mono" id="url" style="opacity:0">${esc(c.url)}</div>
    </div>
    <script>
      const stage = document.getElementById('stage');
      const url = document.getElementById('url');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 1.2));
        url.style.opacity = String(fade(t, 1.4, 0.8));
      };
      window.__render(0);
    </script>
  </body></html>`;
}
