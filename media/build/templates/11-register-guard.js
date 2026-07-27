import { THEME_CSS, FONT_LINKS, esc } from './theme.js';

export const DURATION = 14;

/**
 * Wrap each banned phrase (first occurrence, in on-screen order) in a red
 * highlight span followed by a small rule-name tag; everything else is
 * escaped plain text. `highlights` entries are DATA.registerGuard.highlights
 * (already resolved to their real on-screen casing in data.js).
 */
function highlightBanned(text, highlights) {
  const spans = highlights
    .map((h) => {
      const idx = text.indexOf(h.phrase);
      return idx === -1 ? null : { start: idx, end: idx + h.phrase.length, rule: h.rule };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const s of spans) {
    out += esc(text.slice(cursor, s.start));
    out += `<span class="banned">${esc(text.slice(s.start, s.end))}</span><span class="rule-tag">${esc(s.rule)}</span>`;
    cursor = s.end;
  }
  out += esc(text.slice(cursor));
  return out;
}

export function build(DATA) {
  const r = DATA.registerGuard;
  const beforeHTML = highlightBanned(r.before, r.highlights);
  const nRules = r.highlights.length;

  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}
  .tool-panel { width: 1650px; padding: 60px 84px 68px; }
  .tool-header { display: flex; align-items: baseline; gap: 18px; margin-bottom: 24px; }
  .tool-name { font-size: 30px; color: var(--accent); }
  .tool-name .tag { font-size: 20px; color: var(--text-dim); border: 1px solid var(--panel-border); border-radius: 6px; padding: 4px 10px; margin-left: 10px; }
  .call-line { font-size: 24px; color: var(--text-dim); margin-bottom: 22px; }
  .call-line .val { color: var(--gold); }
  .loading { font-size: 22px; color: var(--text-dim); margin-bottom: 22px; }
  .verdict-row { display: flex; align-items: baseline; gap: 22px; margin-bottom: 28px; }
  .verdict-badge { font-size: 38px; font-weight: 700; letter-spacing: 0.03em; }
  .verdict-badge.violations { color: var(--red); }
  .verdict-badge.clean { color: var(--green); }
  .verdict-count { font-size: 22px; color: var(--text-dim); }
  .reply-block { font-family: var(--font-body); font-size: 26px; line-height: 1.6; }
  .banned { color: var(--red); background: var(--red-bg); border-radius: 3px; padding: 0 3px; }
  .rule-tag {
    font-family: var(--mono); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;
    color: var(--red); vertical-align: super; margin: 0 8px 0 3px; white-space: nowrap;
  }
  .clean-block { border-left: 4px solid var(--green); background: var(--green-bg); padding: 20px 28px; border-radius: 0 8px 8px 0; }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="panel tool-panel">
        <div class="tool-header" id="header" style="opacity:0">
          <span class="tool-name mono">verify_register<span class="tag">tool call</span></span>
        </div>
        <div class="call-line mono" id="call" style="opacity:0">grounded_reply output for <span class="val">"${esc(r.topic)}"</span></div>
        <div class="loading mono" id="loading" style="opacity:0">scanning for banned register patterns<span id="dots"></span></div>

        <div id="before-panel" style="display:none">
          <div class="verdict-row">
            <span class="verdict-badge violations mono">VIOLATIONS</span>
            <span class="verdict-count mono">&middot; ${nRules} rules</span>
          </div>
          <div class="reply-block">${beforeHTML}</div>
        </div>

        <div id="after-panel" style="display:none">
          <div class="verdict-row">
            <span class="verdict-badge clean mono">CLEAN</span>
          </div>
          <div class="reply-block clean-block">${esc(r.after)}</div>
        </div>
      </div>
      <div class="caption-strip" id="caption" style="opacity:0">the register guard &mdash; no simulated empathy, enforced by code</div>
    </div>
    <script>
      const stage = document.getElementById('stage');
      const header = document.getElementById('header');
      const call = document.getElementById('call');
      const loading = document.getElementById('loading');
      const dots = document.getElementById('dots');
      const beforePanel = document.getElementById('before-panel');
      const afterPanel = document.getElementById('after-panel');
      const caption = document.getElementById('caption');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      const LOAD_START = 1.2, LOAD_END = 2.2;
      const VERDICT_START = 2.5;
      const SWITCH_AT = 8.0;
      const CAPTION_START = 11.2;

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.4));
        header.style.opacity = String(fade(t, 0.35, 0.4));
        call.style.opacity = String(fade(t, 0.65, 0.4));
        loading.style.opacity = String(t > LOAD_START && t < LOAD_END + 0.3 ? 1 : 0);
        dots.textContent = '.'.repeat(1 + Math.floor(t * 4) % 3);

        const showAfter = t >= SWITCH_AT;
        beforePanel.style.display = showAfter ? 'none' : 'block';
        afterPanel.style.display = showAfter ? 'block' : 'none';
        beforePanel.style.opacity = String(showAfter ? 0 : fade(t, VERDICT_START, 0.5));
        afterPanel.style.opacity = String(showAfter ? fade(t, SWITCH_AT, 0.5) : 0);

        caption.style.opacity = String(fade(t, CAPTION_START, 0.6));
      };
      window.__render(0);
    </script>
  </body></html>`;
}
