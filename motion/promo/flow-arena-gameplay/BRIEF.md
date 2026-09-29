---
workflow: general-video
flow: automation
storyboard: no
message: "In FLOW ARENA you don't watch the market — you move it: shake the book, fake the breakout, chain the liquidations, read the iceberg, flip and cash out."
destination: youtube
aspect: 1920x1080
language: en
length: 60s
angle: gameplay sizzle (v2 of the launch reel)
---

## Intent

Second launch video, focused on in-game plays. User (verbatim, zh-TW): 更專注在遊戲中的操作 — 下大單撼動價格,
假突破誘騙散戶上車, 獵取高位爆倉流動性 … They loved v1's chain-liquidation animation and the 3D flip / elements
flying toward the viewer (v1 33–35s). Keep showreel-level craft. Any of Canvas 2D, Rough.js, p5.js, GSAP, Anime.js,
D3.js, PixiJS, Matter.js, Three.js, GLSL, Tone.js may be used.

## Assets

- assets/game-hero.png, game-push.png — real gameplay captures.
- assets/result-dialog.png + rd-*.png crops — real RUN COMPLETE dialog (0164 · A, +$329,492, coach notes).
- assets/logo.png — MetaBear mark.

## Customizations

- Three.js 3D liquidation landscape opener that flattens into the 2D heatmap.
- Matter.js (precomputed, deterministic) for chasers knocked off the breakout ledge.
- Canvas 2D spark field for the cascade.
- 3D MOVE cards that fly at the camera between plays; keycap HUD (Q / E / F / 1–4) for real controls.
- Custom synthesized 120 BPM score with bundled SFX (trimmed stingers).

## Notes

- v1 (flow-arena-launch) is kept untouched.
- Mechanics verified in flow-arena-engine.js: breakout > 30s high × 1.0008 pulls chasers at 20/25/50× with stops
  0.2–0.5% under the old high; chain liquidations; icebergs; market-maker pullback; "reverse after the chain stops".
