# Design — FLOW ARENA TOP 3 REPLAY

Concept: a sports-broadcast instant-replay package for a trading game. The price chart is the athlete;
every chart is drawn from the replayed game, never invented. One visual rule carries the message:
**paper PnL is hollow (outlined white), banked PnL is solid gold.**

## Palette (dark, tinted toward the gold accent's opposite — deep blue-black)

| Token | Hex | Use |
| --- | --- | --- |
| `--bg` | `#05070b` | every scene background |
| `--panel` | `#0b1118` | panels, chips |
| `--ink` | `#ecf2f7` | primary text, price line |
| `--dim` | `#93a3b4` | secondary labels (AA on `--bg`) |
| `--gold` | `#ffd36b` | the one accent: banked PnL, #1, verified marks |
| `--long` | `#2de2a6` | buys, price going up, short liquidations (forced buys) |
| `--short` | `#ff4f6e` | forced close, liquidation, the melt |

Gold is the accent. Green/red are data semantics (the arena's own long/short colors), not decoration.

## Type

- Display numbers and English: **Barlow Condensed** 700 / 500 (embedded woff2).
- Chinese: **Noto Sans TC** 900 / 700 (subset, embedded).
- Data, timecode, seeds: **JetBrains Mono** 700, `tabular-nums`.

Paper numbers: Barlow 700, `color: transparent; -webkit-text-stroke: 4px var(--ink)`.
Banked numbers: Barlow 700, solid `--gold` with a warm glow.

## Frame

- Edge-anchored layouts: name cards left-anchored, data right; 96 px title-safe margin.
- Broadcast chrome in every game scene: top-left REPLAY bug (red dot, player, seed), top-right game
  clock `T+hh:mm:ss / 02:00:00`, bottom 24-turn scrubber with playhead.
- Background depth: faint 60 px grid, giant ghost rank numeral, radial gold glow behind the focal
  number, film grain + vignette from the overlay.

## Motion

- Cuts land on downbeats (116 BPM grid). Hits: `power4.out` slams, `expo.out` side snaps,
  `back.out(1.6)` only on stamps.
- Charts are canvas, drawn as a pure function of film time through per-scene time warps that put
  real game events on beats.
- Camera: virtual `.world` transforms (push-in, whip with directional blur) and deterministic shake
  on impacts only.

## Don'ts

- No invented numbers; every figure comes from `assets/data/replay.json` via `scripts/build.mjs`.
- No gender pronouns for players.
- No full-screen linear gradients on dark (banding); radial glows only.
