#!/usr/bin/env node
/**
 * Renders the three YouTube thumbnail candidates from
 * media/build/templates/thumbs/thumb-{1,2,3}.js via the same headless-Chrome
 * pipeline as render.js (lib/capture.js: document.fonts.ready wait, no
 * reliance on wall-clock animation). Each is captured at 2x pixel density
 * (2560x1440 physical pixels over a 1280x720 CSS canvas) then downscaled
 * with ImageMagick to the exact 1280x720 delivery size for crisper text
 * than a native 1x capture.
 *
 * Local-only tooling (not part of the MCP server/tests) — same Chrome/
 * ImageMagick prerequisites as render.js. Usage: node media/build/render-thumbs.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { DATA } from './data.js';
import { captureClipFrames, chromeAvailable, CHROME_PATH } from './lib/capture.js';

import * as thumb1 from './templates/thumbs/thumb-1.js';
import * as thumb2 from './templates/thumbs/thumb-2.js';
import * as thumb3 from './templates/thumbs/thumb-3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRAMES_ROOT = path.join(__dirname, 'frames', 'thumbs');
const OUT_DIR = path.join(ROOT, 'media', 'edit', 'thumbs');

fs.mkdirSync(OUT_DIR, { recursive: true });

const THUMBS = [
  { id: 'thumb-1', mod: thumb1 },
  { id: 'thumb-2', mod: thumb2 },
  { id: 'thumb-3', mod: thumb3 },
];

function imagemagickAvailable() {
  try {
    execFileSync('magick', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!chromeAvailable()) {
    console.log(`No Chrome/Chromium found at "${CHROME_PATH}". Set $CHROME_PATH to render thumbnails.`);
    process.exit(1);
  }
  if (!imagemagickAvailable()) {
    console.log('ImageMagick ("magick") not found on $PATH. Install it to downscale the 2x captures.');
    process.exit(1);
  }

  for (const t of THUMBS) {
    console.log(`\n=== ${t.id} ===`);
    const html = t.mod.build(DATA);
    const { dir } = await captureClipFrames({
      name: t.id,
      html,
      duration: 1 / 30,
      fps: 30,
      framesRoot: FRAMES_ROOT,
      viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
    });
    const frame = path.join(dir, 'frame-00000.png');
    const at2x = path.join(OUT_DIR, `${t.id}@2x.png`);
    const final = path.join(OUT_DIR, `${t.id}.png`);
    fs.copyFileSync(frame, at2x);
    execFileSync('magick', [at2x, '-filter', 'Lanczos', '-resize', '1280x720!', final]);

    const dims = execFileSync('identify', ['-format', '%wx%h', final]).toString().trim();
    if (dims !== '1280x720') {
      throw new Error(`${t.id}.png rendered at ${dims}, expected 1280x720`);
    }
    console.log(`${final} (${dims}) <- downscaled from ${at2x}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
