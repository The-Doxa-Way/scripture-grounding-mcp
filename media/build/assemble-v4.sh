#!/bin/bash
# v2 assembly: 11 branded clips against the 2:08 v3 VO (media/vo/vo-v5-cut.wav).
# Section boundaries derived from the cut VO's transcript timings; VO starts at 0.5s.
# Total ≈ 2:13.5 incl. close hold. Re-run any time clips change.
set -euo pipefail
cd "$(dirname "$0")/../.."
C=media/clips
OUT=media/edit/final-v4.mp4

ffmpeg -y -v error \
  -i $C/01-misquote-open.mp4 -i $C/02-headlines.mp4 -i $C/03-bridge-config.mp4 \
  -i $C/04-demo-get-passage.mp4 -i $C/05-demo-verify-quote.mp4 -i $C/06-demo-grounded-reply.mp4 \
  -i $C/11-register-guard.mp4 -i $C/07-chart.mp4 -i $C/08-limitations.mp4 \
  -i $C/10-montage-frontiers.mp4 -i $C/09-close.mp4 \
  -i media/vo/vo-v5-cut.wav -i media/edit/soft-glory.mp3 \
  -filter_complex "
[0:v]trim=0:16.6,setpts=PTS-STARTPTS[v0];
[1:v]trim=0:10.8,setpts=PTS-STARTPTS[v1];
[2:v]tpad=stop_mode=clone:stop_duration=1.3[v2];
[3:v]trim=0:12.7,setpts=PTS-STARTPTS[v3];
[4:v]trim=0:11.5,setpts=PTS-STARTPTS[v4];
[5:v]trim=0:9.75,setpts=PTS-STARTPTS[v5];
[6:v]tpad=stop_mode=clone:stop_duration=1.2[v6];
[7:v]trim=0:12.95,setpts=PTS-STARTPTS[v7];
[8:v]tpad=stop_mode=clone:stop_duration=2.2[v8];
[9:v]tpad=stop_mode=clone:stop_duration=2.3[v9];
[10:v]trim=0:10,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1.5[v10];
[v0][v1]xfade=transition=fade:duration=0.4:offset=16.2[x1];
[x1][v2]xfade=transition=fade:duration=0.4:offset=26.6[x2];
[x2][v3]xfade=transition=fade:duration=0.4:offset=37.5[x3];
[x3][v4]xfade=transition=fade:duration=0.4:offset=49.8[x4];
[x4][v5]xfade=transition=fade:duration=0.4:offset=60.9[x5];
[x5][v6]xfade=transition=fade:duration=0.4:offset=70.25[x6];
[x6][v7]xfade=transition=fade:duration=0.4:offset=85.05[x7];
[x7][v8]xfade=transition=fade:duration=0.4:offset=97.6[x8];
[x8][v9]xfade=transition=fade:duration=0.4:offset=109.4[x9];
[x9][v10]xfade=transition=fade:duration=0.5:offset=123.3[vfinal];
[11:a]adelay=500|500,volume=1.25,apad,asplit[vo1][vo2];
[12:a]atrim=0:134.8,afade=t=in:st=0:d=2,afade=t=out:st=129.8:d=5,volume=0.55[mus];
[mus][vo1]sidechaincompress=threshold=0.02:ratio=12:attack=80:release=600:makeup=1[musduck];
[vo2][musduck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[afinal]
" -map "[vfinal]" -map "[afinal]" -t 134.8 \
  -c:v libx264 -crf 19 -preset medium -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart "$OUT"
echo "assembled -> $OUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT"
