import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** Assemble a PNG frame sequence into a silent h264/yuv420p mp4. */
export function assembleFrames({ dir, fps, outPath, crf = 20 }) {
  execFileSync('ffmpeg', [
    '-y',
    '-framerate', String(fps),
    '-i', path.join(dir, 'frame-%05d.png'),
    '-an',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', String(crf),
    '-movflags', '+faststart',
    outPath,
  ], { stdio: 'inherit' });
}

export function ffprobeDuration(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]).toString().trim();
  return parseFloat(out);
}
