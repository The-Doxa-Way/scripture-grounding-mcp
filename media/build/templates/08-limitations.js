import { THEME_CSS, FONT_LINKS, esc } from './theme.js';

export const DURATION = 10;

export function build(DATA) {
  const items = DATA.limitations;
  const itemsHTML = items
    .map((text, i) => `<li class="item" id="item-${i}" style="opacity:0">${esc(text)}</li>`)
    .join('\n');

  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .card { width: 1400px; padding: 84px 96px; }
  .kicker { margin-bottom: 20px; }
  .title { font-family: var(--font-display); font-weight: 700; font-size: 48px; margin-bottom: 56px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .item { font-family: var(--font-body); font-size: 30px; line-height: 1.6; margin-bottom: 30px; padding-left: 44px; position: relative; }
  .item::before { content: "\\2014"; position: absolute; left: 0; color: var(--text-dim); }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="panel card">
        <div class="kicker mono" id="kicker" style="opacity:0">measured, not solved</div>
        <div class="title" id="title" style="opacity:0">Honest limitations</div>
        <ul>${itemsHTML}</ul>
      </div>
    </div>
    <script>
      const stage = document.getElementById('stage');
      const kicker = document.getElementById('kicker');
      const title = document.getElementById('title');
      const n = ${items.length};

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.4));
        kicker.style.opacity = String(fade(t, 0.3, 0.4));
        title.style.opacity = String(fade(t, 0.5, 0.4));
        for (let i = 0; i < n; i++) {
          const el = document.getElementById('item-' + i);
          el.style.opacity = String(fade(t, 1.0 + i * 0.35, 0.4));
        }
      };
      window.__render(0);
    </script>
  </body></html>`;
}
