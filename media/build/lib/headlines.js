/**
 * Clip 02: slow Ken Burns cross-dissolve across the four real headline
 * screenshots (media/assets/headline-*.jpg). Pure ffmpeg (zoompan + xfade),
 * no HTML/Chrome — the task spec calls this out explicitly as an
 * ffmpeg-zoompan clip, and a static PNG pan needs no browser rendering.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const IMAGES = [
  'headline-christian-today.jpg',
  'headline-charisma.jpg',
  'headline-christian-post.jpg',
  'headline-christian-daily.jpg',
];

/**
 * These four screenshots are fair-use press headlines kept local-only (see
 * .gitignore's `media/assets/headline-*.jpg` rule) — not distributable under
 * this repo's MIT grant, so a fresh clone never has them. Check for them
 * before shelling out to ffmpeg so a missing-asset clone gets a clear skip
 * message instead of an ffmpeg stack trace.
 */
export function missingImages(assetsDir) {
  return IMAGES.filter((img) => !existsSync(path.join(assetsDir, img)));
}

export function buildHeadlinesClip({ assetsDir, outPath, fps = 30, targetDuration = 12 }) {
  const n = IMAGES.length;
  const xfadeDur = 0.6;
  // Solve per-image segment length L so that n*L - (n-1)*xfadeDur == targetDuration.
  const segLen = (targetDuration + (n - 1) * xfadeDur) / n;
  const framesPerSeg = Math.round(segLen * fps);

  const args = ['-y'];
  for (const img of IMAGES) {
    args.push('-loop', '1', '-t', segLen.toFixed(3), '-i', path.join(assetsDir, img));
  }

  const filters = [];
  for (let i = 0; i < n; i++) {
    filters.push(
      `[${i}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,` +
      `zoompan=z='min(zoom+0.0012,1.18)':d=${framesPerSeg}:s=1920x1080:fps=${fps},setsar=1[v${i}]`
    );
  }

  let prevLabel = 'v0';
  let accumLen = segLen;
  for (let i = 1; i < n; i++) {
    const offset = accumLen - xfadeDur;
    const outLabel = i === n - 1 ? 'vlast' : `vx${i}`;
    filters.push(`[${prevLabel}][v${i}]xfade=transition=fade:duration=${xfadeDur}:offset=${offset.toFixed(3)}[${outLabel}]`);
    prevLabel = outLabel;
    accumLen = accumLen + segLen - xfadeDur;
  }
  filters.push(`[${prevLabel}]vignette=PI/5[vout]`);

  args.push('-filter_complex', filters.join(';'));
  args.push('-map', '[vout]');
  args.push('-r', String(fps));
  args.push('-an');
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart');
  args.push('-t', accumLen.toFixed(3));
  args.push(outPath);

  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  return { outPath, duration: accumLen };
}
