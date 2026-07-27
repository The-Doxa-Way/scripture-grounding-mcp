import { THEME_CSS, esc } from './theme.js';

export const DURATION = 10;

/** Minimal JSON colorizer for the config text: keys vs string values. */
function colorizeJSON(json) {
  const escaped = esc(json);
  return escaped
    .replace(/&quot;([a-zA-Z_-]+)&quot;(\s*:)/g, '<span class="json-key">&quot;$1&quot;</span>$2')
    .replace(/:(\s*)&quot;([^&]*)&quot;/g, ':$1<span class="json-str">&quot;$2&quot;</span>');
}

export function build(DATA) {
  const config = DATA.mcpConfig;
  const colorized = colorizeJSON(config);
  const totalLines = config.split('\n').length;

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${THEME_CSS}
  .editor { width: 1200px; padding: 0; overflow: hidden; }
  .titlebar { display: flex; align-items: center; gap: 10px; padding: 22px 28px; border-bottom: 1px solid var(--panel-border); }
  .dot { width: 13px; height: 13px; border-radius: 50%; }
  .dot.r { background: #ff5f56; } .dot.y { background: #ffbd2e; } .dot.g { background: #27c93f; }
  .filename { margin-left: 18px; font-size: 20px; color: var(--text-dim); }
  .code { padding: 44px 48px 52px; font-size: 28px; line-height: 1.7; white-space: pre; margin: 0; }
  .json-key { color: var(--accent); }
  .json-str { color: var(--green); }
  .status-row { display: flex; align-items: center; gap: 16px; padding: 0 48px 40px; font-size: 24px; }
  .status-dot { width: 16px; height: 16px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 0 rgba(63,185,80,0.6); }
  .status-text { color: var(--green); letter-spacing: 0.04em; }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="panel editor">
        <div class="titlebar">
          <div class="dot r"></div><div class="dot y"></div><div class="dot g"></div>
          <div class="filename mono">claude_desktop_config.json</div>
        </div>
        <p class="code mono" id="code">${colorized}</p>
        <div class="status-row" id="status" style="opacity:0">
          <div class="status-dot" id="statusdot"></div>
          <div class="status-text mono">scripture-grounding &middot; connected</div>
        </div>
      </div>
    </div>
    <script>
      const TOTAL_LINES = ${totalLines};
      const codeEl = document.getElementById('code');
      const stage = document.getElementById('stage');
      const status = document.getElementById('status');
      const statusdot = document.getElementById('statusdot');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      const TYPE_START = 0.4, TYPE_DUR = 2.6;
      const STATUS_START = 5.6;

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.4));

        const revealFrac = fade(t, TYPE_START, TYPE_DUR);
        const revealedLines = Math.ceil(revealFrac * TOTAL_LINES);
        const hiddenPct = Math.max(0, (1 - revealedLines / TOTAL_LINES) * 100);
        codeEl.style.clipPath = 'inset(0 0 ' + hiddenPct.toFixed(2) + '% 0)';

        const statusT = fade(t, STATUS_START, 0.5);
        status.style.opacity = String(statusT);
        const pulse = 1 + 0.35 * Math.max(0, Math.sin((t - STATUS_START) * 3.2));
        statusdot.style.transform = t > STATUS_START ? 'scale(' + pulse.toFixed(3) + ')' : 'scale(1)';
      };
      window.__render(0);
    </script>
  </body></html>`;
}
