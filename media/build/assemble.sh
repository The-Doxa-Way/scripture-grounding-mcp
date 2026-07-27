#!/bin/bash
# Assemble the final Kaggle video: 10 silent clips + VO cut + Soft Glory bed.
# Timeline derives from the VO cut's section times (media/vo/vo-cut.wav, 155.9s);
# VO starts at t=0.5s. Total ≈ 162s. Re-run after any clip re-render.
set -euo pipefail
cd "$(dirname "$0")/../.."
C=media/clips
OUT=media/edit/final-v1.mp4

# Video timeline: trims/holds per section (tpad clones last frame for holds).
ffmpeg -y -v error \
  -i $C/01-misquote-open.mp4 -i $C/02-headlines.mp4 -i $C/03-bridge-config.mp4 \
  -i $C/04-demo-get-passage.mp4 -i $C/05-demo-verify-quote.mp4 -i $C/06-demo-grounded-reply.mp4 \
  -i $C/07-chart.mp4 -i $C/08-limitations.mp4 -i $C/10-montage-frontiers.mp4 -i $C/09-close.mp4 \
  -i media/vo/vo-cut.wav -i media/edit/soft-glory.mp3 \
  -filter_complex "
[0:v]trim=0:16.5,setpts=PTS-STARTPTS[v0];
[1:v]trim=0:12,setpts=PTS-STARTPTS[v1];
[0:v]trim=19:24.9,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=4.6[v2];
[2:v]tpad=stop_mode=clone:stop_duration=9.0[v3];
[3:v]trim=0:15,setpts=PTS-STARTPTS[v4];
[4:v]trim=0:17.5,setpts=PTS-STARTPTS[v5];
[5:v]trim=0:11.5,setpts=PTS-STARTPTS[v6];
[6:v]trim=0:13.5,setpts=PTS-STARTPTS[v7];
[7:v]tpad=stop_mode=clone:stop_duration=4.7[v8];
[8:v]tpad=stop_mode=clone:stop_duration=8.2[v9];
[9:v]tpad=stop_mode=clone:stop_duration=1.6[v10];
[v0][v1]xfade=transition=fade:duration=0.4:offset=16.1[x1];
[x1][v2]xfade=transition=fade:duration=0.4:offset=27.7[x2];
[x2][v3]xfade=transition=fade:duration=0.4:offset=37.8[x3];
[x3][v4]xfade=transition=fade:duration=0.4:offset=56.4[x4];
[x4][v5]xfade=transition=fade:duration=0.4:offset=71.0[x5];
[x5][v6]xfade=transition=fade:duration=0.4:offset=88.1[x6];
[x6][v7]xfade=transition=fade:duration=0.4:offset=99.2[x7];
[x7][v8]xfade=transition=fade:duration=0.4:offset=112.3[x8];
[x8][v9]xfade=transition=fade:duration=0.4:offset=126.6[x9];
[x9][v10]xfade=transition=fade:duration=0.5:offset=146.4[vfinal];
[10:a]adelay=500|500,apad,asplit[vo1][vo2];
[11:a]atrim=0:161.5,afade=t=in:st=0:d=2,afade=t=out:st=156.5:d=5,volume=0.9[mus];
[mus][vo1]sidechaincompress=threshold=0.02:ratio=12:attack=80:release=600:makeup=1[musduck];
[vo2][musduck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[afinal]
" -map "[vfinal]" -map "[afinal]" -t 161.5 \
  -c:v libx264 -crf 19 -preset medium -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"
echo "assembled -> $OUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT"
