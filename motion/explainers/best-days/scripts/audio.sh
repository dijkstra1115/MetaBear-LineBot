#!/bin/sh
# Music bed: BARRETE (owner-supplied, not in Git) at -14 LUFS. The master is -5.7 LUFS and clips,
# so a flat -8.3 dB gain lands it at -14 with ~6 dB of true-peak headroom and keeps its dynamics.
# Run from this folder after copying motion/audio-library/music/barrete.mp3 to assets/audio/.
set -e
ffmpeg -v error -y -i assets/audio/barrete.mp3 \
  -af "volume=-8.3dB,atrim=0:97.6,afade=t=out:st=96.4:d=1.2" \
  -ar 48000 -ac 2 assets/audio/soundtrack.wav
ffmpeg -hide_banner -i assets/audio/soundtrack.wav -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2
