/**
 * Shared look for every clip: near-black background, monospace terminal
 * chrome, serif for Scripture text, generous whitespace, high contrast.
 * Kept as one string so every template stays visually consistent.
 */
export const THEME_CSS = `
  :root {
    color-scheme: dark;
    --bg: #0d1117;
    --panel: #111826;
    --panel-border: #30363d;
    --text: #e6edf3;
    --text-dim: #8b949e;
    --accent: #79c0ff;
    --accent-dim: #58a6ff;
    --red: #f85149;
    --red-bg: rgba(248, 81, 73, 0.16);
    --green: #3fb950;
    --green-bg: rgba(63, 185, 80, 0.14);
    --amber: #d29922;
    --mono: "SF Mono", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace;
    --serif: Georgia, "Iowan Old Style", "Times New Roman", serif;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 1920px;
    height: 1080px;
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
    font-family: var(--mono);
  }
  .stage {
    position: relative;
    width: 1920px;
    height: 1080px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 96px;
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 18px;
    box-shadow: 0 40px 120px rgba(0, 0, 0, 0.55);
  }
  .mono { font-family: var(--mono); }
  .serif { font-family: var(--serif); }
  .dim { color: var(--text-dim); }
  .accent { color: var(--accent); }
  .cursor {
    display: inline-block;
    width: 0.55em;
    height: 1em;
    background: var(--accent);
    margin-left: 2px;
    vertical-align: -0.12em;
  }
  .cursor.hidden { visibility: hidden; }
  /* No padding/border-radius: any inline box-model addition here would make
     the highlighted paragraph's word-wrap points diverge from the plain
     paragraph stacked underneath it (they must lay out pixel-identically —
     only color/background differ — since the highlight is a crossfaded
     overlay, not a replacement). */
  .diff-red {
    color: var(--red);
    background: var(--red-bg);
  }
  .diff-green {
    color: var(--green);
    background: var(--green-bg);
  }
  .caption-strip {
    position: absolute;
    left: 96px;
    right: 96px;
    bottom: 72px;
    font-size: 30px;
    color: var(--text-dim);
    letter-spacing: 0.01em;
    text-align: center;
  }
  .kicker {
    font-size: 24px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
`;

/** Escape untrusted-ish text for embedding in HTML templates built from real repo strings. */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Simple, dependency-free easing for JS-driven animation (t in [0,1]). */
export function easeOutCubic(t) {
  const c = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - c, 3);
}

export function clamp01(t) {
  return Math.min(Math.max(t, 0), 1);
}

/**
 * Build two parallel HTML renderings of one side of a word-diff (from
 * src/diff.js's wordDiff ops): a plain version (no color) and a highlighted
 * version (differing words wrapped in a colored span). Stacking these two
 * (plain always opaque, highlighted crossfaded on top) is how templates
 * animate "the highlight fades in" without per-word color interpolation.
 * @param {Array<{op: string, a: string[], b: string[]}>} diffOps
 * @param {'a'|'b'} side - 'a' = canonical, 'b' = quoted/raw
 * @param {'green'|'red'} color
 */
export function buildDiffHTML(diffOps, side, color) {
  const plainParts = [];
  const hlParts = [];
  for (const op of diffOps) {
    const tokens = op[side];
    if (!tokens || tokens.length === 0) continue;
    const text = tokens.map(esc).join(' ');
    if (op.op === 'equal') {
      plainParts.push(text);
      hlParts.push(text);
    } else if ((side === 'a' && (op.op === 'replace' || op.op === 'delete')) ||
               (side === 'b' && (op.op === 'replace' || op.op === 'insert'))) {
      plainParts.push(text);
      hlParts.push(`<span class="diff-${color}">${text}</span>`);
    } else {
      // side 'a' insert or side 'b' delete: no tokens on this side to show.
      continue;
    }
  }
  return { plainHTML: plainParts.join(' '), highlightHTML: hlParts.join(' ') };
}
