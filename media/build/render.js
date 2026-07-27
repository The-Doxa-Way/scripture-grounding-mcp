#!/usr/bin/env node
/**
 * Rebuilds every silent video clip in media/clips/ from the HTML templates
 * in media/build/templates/ (rendered frame-by-frame via headless Chrome)
 * plus the pure-ffmpeg Ken Burns clip (media/build/lib/headlines.js).
 *
 * Usage: node media/build/render.js [clipNumber ...]
 *   node media/build/render.js          # rebuild all clips
 *   node media/build/render.js 01 05    # rebuild just clip 01 and 05
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA } from './data.js';
import { captureClipFrames } from './lib/capture.js';
import { assembleFrames, ffprobeDuration } from './lib/ffmpeg.js';
import { buildHeadlinesClip } from './lib/headlines.js';

import * as clip01 from './templates/01-misquote-open.js';
import * as clip03 from './templates/03-bridge-config.js';
import * as clip04 from './templates/04-demo-get-passage.js';
import * as clip05 from './templates/05-demo-verify-quote.js';
import * as clip06 from './templates/06-demo-grounded-reply.js';
import * as clip07 from './templates/07-chart.js';
import * as clip08 from './templates/08-limitations.js';
import * as clip09 from './templates/09-close.js';
import * as clip10 from './templates/10-montage-frontiers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FRAMES_ROOT = path.join(__dirname, 'frames');
const CLIPS_DIR = path.join(ROOT, 'media', 'clips');
const ASSETS_DIR = path.join(ROOT, 'media', 'assets');

fs.mkdirSync(CLIPS_DIR, { recursive: true });

const HTML_CLIPS = [
  { id: '01', file: '01-misquote-open.mp4', mod: clip01 },
  { id: '03', file: '03-bridge-config.mp4', mod: clip03 },
  { id: '04', file: '04-demo-get-passage.mp4', mod: clip04 },
  { id: '05', file: '05-demo-verify-quote.mp4', mod: clip05 },
  { id: '06', file: '06-demo-grounded-reply.mp4', mod: clip06 },
  { id: '07', file: '07-chart.mp4', mod: clip07 },
  { id: '08', file: '08-limitations.mp4', mod: clip08 },
  { id: '09', file: '09-close.mp4', mod: clip09 },
  { id: '10', file: '10-montage-frontiers.mp4', mod: clip10 },
];

const requested = process.argv.slice(2);
const wantAll = requested.length === 0;
const want = (id) => wantAll || requested.includes(id);

async function main() {
  const results = [];

  for (const clip of HTML_CLIPS) {
    if (!want(clip.id)) continue;
    console.log(`\n=== ${clip.file} ===`);
    const html = clip.mod.build(DATA);
    const duration = clip.mod.DURATION;
    const { dir, fps } = await captureClipFrames({
      name: clip.id,
      html,
      duration,
      fps: 30,
      framesRoot: FRAMES_ROOT,
    });
    const outPath = path.join(CLIPS_DIR, clip.file);
    assembleFrames({ dir, fps, outPath, crf: 20 });
    results.push({ file: clip.file, outPath, targetDuration: duration });
  }

  if (want('02')) {
    console.log('\n=== 02-headlines.mp4 ===');
    const outPath = path.join(CLIPS_DIR, '02-headlines.mp4');
    buildHeadlinesClip({ assetsDir: ASSETS_DIR, outPath, fps: 30, targetDuration: 12 });
    results.push({ file: '02-headlines.mp4', outPath, targetDuration: 12 });
  }

  console.log('\n=== Verification ===');
  for (const r of results) {
    const actual = ffprobeDuration(r.outPath);
    const size = fs.statSync(r.outPath).size;
    const delta = Math.abs(actual - r.targetDuration);
    const flag = delta > 2 ? '  <-- OUTSIDE ±2s TOLERANCE' : '';
    console.log(
      `${r.file}: target ${r.targetDuration}s, actual ${actual.toFixed(2)}s, ` +
      `${(size / 1024).toFixed(0)} KB${flag}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
