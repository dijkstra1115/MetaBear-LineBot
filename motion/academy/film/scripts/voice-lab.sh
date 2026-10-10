#!/usr/bin/env bash
# Renders the spliced narration (first ~12 s) through alternative voice chains for listening.
# Writes ../../audio-library/voice/lab/<name>.mp3. Usage: bash scripts/voice-lab.sh
set -e
OUT=../../audio-library/voice/lab
mkdir -p "$OUT"
CHEST="equalizer=f=110:t=q:w=0.9:g=5,equalizer=f=330:t=q:w=1.2:g=-2.5,equalizer=f=2800:t=q:w=1.4:g=-1.5,highshelf=f=9500:g=2,acompressor=threshold=-22dB:ratio=3:attack=8:release=160:makeup=2.5,asoftclip=type=tanh:threshold=0.8"
render() {
  VOICE_FX="$2" VO_ONLY="$OUT/$1.f32" node scripts/mix.mjs
  ffmpeg -v error -y -f f32le -ar 48000 -ac 1 -i "$OUT/$1.f32" -t 12.4 -af "loudnorm=I=-18:TP=-1.5" -b:a 192k "$OUT/$1.mp3"
  rm "$OUT/$1.f32"
  echo "$1"
}
render "0-current" ""
render "A-chest-eq" "$CHEST"
render "B-chest-eq-minus-half-semitone" "rubberband=pitch=0.9715:formant=preserved:pitchq=quality,$CHEST"
render "C-chest-eq-minus-one-semitone" "rubberband=pitch=0.9439:formant=preserved:pitchq=quality,$CHEST"
