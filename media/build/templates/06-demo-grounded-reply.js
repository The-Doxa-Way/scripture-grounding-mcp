import { THEME_CSS, esc } from './theme.js';

export const DURATION = 20;

function inlineBold(escapedLine) {
  // escapedLine is already HTML-escaped; markdown ** markers survive escaping untouched.
  return escapedLine.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** Render the first three real paragraph blocks of the reply, verbatim, with
 * the model's own verbatim-Scripture quote line called out in a highlight box. */
function renderReplyExcerpt(replyText) {
  const blocks = replyText.split('\n\n').slice(0, 3);
  const html = blocks.map((block) => {
    const lines = block.split('\n');
    const rendered = lines.map((line) => {
      // Two verbatim-quote line shapes seen across real captures: an italic
      // *"..."* line, or a bold reference label followed by a straight-quoted
      // passage on the same line (**Reference (Translation):** "...").
      const quoteMatch = line.match(/^\*"(.*)"\*$/) || line.match(/^\*\*[^*]+\*\*:?\s*"(.*)"$/);
      if (quoteMatch) {
        return `<blockquote class="verbatim serif">&ldquo;${esc(quoteMatch[1])}&rdquo;</blockquote>`;
      }
      return `<span class="line">${inlineBold(esc(line))}</span>`;
    });
    return `<p>${rendered.join('<br/>')}</p>`;
  });
  return html.join('\n');
}

export function build(DATA) {
  const g = DATA.groundedReply;
  const topic = "I'm anxious about my future";
  const replyHTML = renderReplyExcerpt(g.reply);

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${THEME_CSS}
  .tool-panel { width: 1620px; padding: 60px 80px 110px; }
  .tool-header { display: flex; align-items: baseline; gap: 18px; margin-bottom: 22px; }
  .tool-name { font-size: 30px; color: var(--accent); }
  .tool-name .tag { font-size: 20px; color: var(--text-dim); border: 1px solid var(--panel-border); border-radius: 6px; padding: 4px 10px; margin-left: 10px; }
  .call-line { font-size: 24px; color: var(--text-dim); margin-bottom: 22px; }
  .call-line .val { color: var(--green); }
  .retrieval-banner { font-size: 22px; color: var(--accent-dim); margin-bottom: 30px; padding-bottom: 22px; border-bottom: 1px solid var(--panel-border); }
  .retrieval-banner .arrow { color: var(--text-dim); margin: 0 10px; }
  .reply-body { font-family: var(--serif); font-size: 29px; line-height: 1.5; }
  .reply-body p { margin: 0 0 26px; }
  .reply-body .verbatim {
    margin: 18px 0 26px; padding: 20px 28px; border-left: 4px solid var(--green);
    background: var(--green-bg); color: var(--text); font-style: italic; font-size: 30px;
  }
  .truncate-note { font-family: var(--mono); font-size: 18px; color: var(--text-dim); font-style: normal; }
  </style></head>
  <body>
    <div class="stage" id="stage" style="opacity:0">
      <div class="panel tool-panel">
        <div class="tool-header" id="header" style="opacity:0">
          <span class="tool-name mono">grounded_reply<span class="tag">tool call</span></span>
        </div>
        <div class="call-line mono" id="call" style="opacity:0">topicOrQuestion: <span class="val">"${esc(topic)}"</span></div>
        <div class="retrieval-banner mono" id="retrieval" style="opacity:0">
          retrieved first<span class="arrow">&rarr;</span><strong>${esc(g.groundedOn.reference)}</strong>, ${esc(g.groundedOn.translation)}<span class="arrow">&rarr;</span>generation constrained to that text
        </div>
        <div class="reply-body" id="reply" style="opacity:0">
          ${replyHTML}
          <div class="truncate-note">(excerpt &mdash; full reply in evals/results/grounded-reply-demo-2026-07-27-register-fix.json)</div>
        </div>
      </div>
      <div class="caption-strip" id="caption" style="opacity:0">retrieval first &middot; generation second &middot; quotes only retrieved text</div>
    </div>
    <script>
      const stage = document.getElementById('stage');
      const header = document.getElementById('header');
      const call = document.getElementById('call');
      const retrieval = document.getElementById('retrieval');
      const reply = document.getElementById('reply');
      const caption = document.getElementById('caption');

      function fade(t, start, dur) { if (dur <= 0) return t >= start ? 1 : 0; return Math.max(0, Math.min(1, (t - start) / dur)); }

      window.__render = function (t) {
        stage.style.opacity = String(fade(t, 0, 0.4));
        header.style.opacity = String(fade(t, 0.35, 0.4));
        call.style.opacity = String(fade(t, 0.7, 0.4));
        retrieval.style.opacity = String(fade(t, 1.3, 0.5));
        reply.style.opacity = String(fade(t, 2.0, 0.6));
        caption.style.opacity = String(fade(t, 3.0, 0.6));
      };
      window.__render(0);
    </script>
  </body></html>`;
}
