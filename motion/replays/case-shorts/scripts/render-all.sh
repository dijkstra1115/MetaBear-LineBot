#!/usr/bin/env bash
# Rebuilds and renders every case (or the ones named) to motion/out/case-<id>.mp4.
# Needs ffmpeg and ffprobe on PATH (FFMPEG= for the mix) and fonttools for the subset.
# Run from this folder: bash scripts/render-all.sh [id ...]
set -euo pipefail
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
  ids=($(node -e 'import("./scripts/cases.mjs").then((m) => console.log(Object.keys(m.CASES).sort().join(" ")))'))
fi
for id in "${ids[@]}"; do node scripts/extract.mjs "$id" > /dev/null; done
python scripts/subset-font.py
[ -d assets/audio/sfx/synth ] || python scripts/sfx.py
for id in "${ids[@]}"; do
  node scripts/build.mjs "$id"
  node scripts/mix.mjs
  npx --yes hyperframes@0.8.149 render -q delivery -o "../../out/case-$id.mp4" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -2
done
