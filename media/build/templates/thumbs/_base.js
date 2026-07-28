/**
 * Shared scaffolding for the three YouTube thumbnail candidates. Reuses
 * theme.js's real design tokens (THEME_CSS) and CDN font links (FONT_LINKS)
 * unmodified — only the stage's fixed 1920x1080 sizing is overridden here,
 * down to 1280x720 (thumbnails aren't video frames). Each thumb-N.js template
 * supplies just its body markup + template-specific CSS.
 */
import { THEME_CSS, FONT_LINKS } from '../theme.js';

/** Overrides THEME_CSS's hardcoded 1920x1080 stage for a 1280x720 thumbnail canvas. */
export const THUMB_CSS = `
  html, body { width: 1280px; height: 720px; }
  .stage { width: 1280px; height: 720px; padding: 0; }
`;

export function buildThumbHTML({ extraCSS = '', bodyHTML }) {
  return `<!doctype html>
<html><head><meta charset="utf-8">${FONT_LINKS}<style>${THEME_CSS}${THUMB_CSS}${extraCSS}</style></head>
<body>
  <div class="stage">${bodyHTML}</div>
  <script>
    // Thumbnails are static (single captured frame) — no animation to drive,
    // but lib/capture.js unconditionally calls window.__render(t).
    window.__render = function () {};
  </script>
</body></html>`;
}

/** Fail loud (Rule 12) rather than silently render stale/fabricated text if a fixture changes. */
export function mustContain(text, phrase) {
  if (!text.toLowerCase().includes(phrase.toLowerCase())) {
    throw new Error(`thumbs: expected phrase "${phrase}" not found in real fixture text: "${text}"`);
  }
  return phrase;
}
