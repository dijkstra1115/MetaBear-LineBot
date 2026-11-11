# SPEC — The coin that pays +5% and still bankrupts you

GOAL: the viewer feels the jolt of "the average grew, but I went broke", understands why (wins and
losses multiply), leaves knowing the fix is bet size (Kelly 25%), and sends it to an all-in friend.

OUTPUT: HyperFrames, 1080 x 1920, 30 fps. English voiceover (ElevenLabs Brian, eleven_v3, 1.1x),
burned-in bilingual captions (EN kinetic + zh-Hant line).

TIME: 111.48 s x 30 = 3345 frames. The voice is the clock: every beat starts on its anchor word in
assets/data/timeline.js (scripts/timeline.py). Bed at 92 BPM (19.57 frames a beat), under the voice.

## LOOK — one medium: a casino table under one pendant lamp, filmed in macro

- Ground: green baize felt. Centre of the lamp pool #1E5A43, falling to #0B2219 at 1.0 pool radius
  and #050B08 (the dark room) beyond the table. Fibre noise ±4% luminance at 2 scales
  (0.6 mm and 4 mm equivalent). The pool follows the camera target; its radius is 0.55 x the
  visible width, so every frame has its own vignette from real light, never a CSS vignette.
- Ink (printed on the felt like a table layout, and all captions): ivory #F1E8D2.
  Printed lines at 2.5 px on screen equivalent, 88% opacity, fibre noise eats 10% of it.
- Accent, gold #E8B44C: only YOU (your chips, your line, your label) and the coin. One gold focus
  per frame.
- Loss: chip red #D9483B, only on money lost (the gap, the poorer stacks' tint, −5%).
- Chips: clay casino chips, radius 0.5, 0.08 thick, $10 a chip. Ivory body #E9DFC9 with six red
  edge inserts; YOU chips gold body with ivory inserts. A stack under $10 is one chip whose radius
  shrinks with the square root of its value (area = money).
- Coin: brass, metalness 1, roughness 0.34, environment 0.6, engraved "×1.5" (heads) and "×0.6"
  (tails) with a reeded edge.
- Type: numbers League Gothic 400, tabular, 180–320 px; labels Montserrat 700 caps, 30 px,
  tracking +0.14em, with a 2 px ivory leader line to the thing they name; captions Montserrat 700
  64 px EN, Noto Sans TC 500 42 px zh.
- Light: key from the lamp above (warm, 3200 K feel), rim from behind-left at 35%; contact shadow
  under every chip and the coin at 0.55 opacity, radius 1.35x.
- Grain: none added; the felt carries texture.

## OBJECTS

The coin (brass, engraved faces), chips and stacks (clay, edge inserts), the betting circle
(printed ivory ring, 2.2 units across, "BET" printed in it), the table's printed charts (the
paths chart and the Kelly hill, printed like a table layout, ivory and gold), a phone share sheet
(the CTA), the YOU ring (gold printed ring on the felt around your stack).

## MOTION

- Enter: expo.out 0.5 s for labels and numbers; captions per word 0.13 s blur 6→0, no translate.
- Camera: power2.inOut between keys, 0.9–1.6 s per move; whips 0.35 s power3.in/out with
  12–18 px motion blur on the overlay layer.
- Chips: drop from 0.6 units in 0.22 s (power2.in), settle with one 6% overshoot (spring 0.75).
- Coin toss: parabola 0.9 s, 4–6 turns, lands with a 2-frame wobble.
- Exits 40–50% of entrances. Something new every 2–4 s.

## SHOTS (times from the voice)

1. 0.00–7.85 hook. Frame 0: macro of the coin mid-air, ×1.5 face to camera, label pair HEADS ×1.5 /
   TAILS ×0.6 already printed. "+5%": label "+5% A FLIP, ON AVERAGE". "Bet everything": camera
   drops to YOUR 10-chip stack sliding into the BET circle. "wipe you out": 100 flips in 2.4 s,
   your chips melt to a sliver, counter lands $0.52 red on "out".
2. 8.30–16.38 split. Stack resets to $100, YOU ring prints. "a thousand parallel yous": camera
   lifts to 42°, your stack copies outward ring by ring into 1,000 stacks (25 x 40).
   "added together": printed "AVERAGE = ALL OF YOU ÷ 1,000".
3. 16.93–29.82 pair. Dive back to your stack; a dashed START ring floats at $100. Coin lands
   heads: 5 chips drop (150). Lands tails: 6 chips fly off (90). "down 10%": red gap under START.
4. 30.16–40.94 gap. Stack at 60; a bracket "+67% TO GET BACK" from 60 to START; ghost chips +50%
   stop at 90, the missing chip outlined red. "average gains 5%": "AVERAGE +5%" prints;
   "You lose five": "YOU −5%" prints under it in red.
5. 41.64–49.66 crowd. Oblique over the 1,000. FLIP counter 0→100 over 4.5 s; a few stacks shoot
   out of the top of frame. AVERAGE counter lands $10,257 on "ten thousand"; push to YOU, MIDDLE
   $0.52. "870 / 1,000 LOST MONEY" prints, poorer stacks tinted red.
6. 50.21–57.09 tower. "To this one": whip to the richest stack; the camera climbs it
   exponentially (true scale: 59,998 units) into the dark room above the table; $7,499,730 lands
   as the top chip comes into view; "73%" fills a gold bar against "EVERYONE ELSE 27%". The
   descent spirals down to the paths chart while the crowd sinks.
7. 57.84–68.62 paths. Dive down to the printed log chart: ENSEMBLE AVERAGE (ivory) draws rising,
   TIME AVERAGE — YOU (gold) draws falling to $0.52. "ERGODIC" prints, then is struck through red.
   "one universe": camera dives into the end of your gold line.
8. 69.47–81.77 kelly. Your chips slide partly back out of the BET circle ("bet less"). The Kelly
   hill prints: typical wealth after 100 flips vs bet size, START line at $100. Your gold chip rides
   it: 100% → $0.52 (−5% a flip), 50% → $100 (0%), 25% → $186 peak. "KELLY 25%" and the formula.
9. 82.52–97.04 rerun. Back over the 1,000 from high (44 units), same flips at 25%: an even
   forest instead of a few towers. MIDDLE $186,
   "702 / 1,000 AHEAD", AVERAGE $364 with $10,257 struck above it. Last line: two rows
   AVERAGE $10,257 → $364, YOU $0.52 → $186.
10. 97.94–101.43 coda. Back to the opening coin framing; a quarter of your stack slides into BET.
11. 102.03–111.48 share. A share sheet rises over the table: Follow → Following, contact
    "Jordan" picked on "the friend", Send → Sent on "all in". "Not investment advice · 非投資建議".

## BANNED

Black or navy void as the ground (the felt fills every frame; darkness only beyond the table's
edge); glow, bloom, neon, lens flares, decorative particles; purple/blue gradients, glass cards;
cream paper + serif; everything centred and fading up at once; text moving while it is read;
corner brackets, HUD decoration; three cards in a row; KPI grids; a logo in a corner; monospace
caps labels; numbers without a source; "歷史資料" labels.

## QA frames

0.0 (thumbnail reads), 7.6 ($0.52 landed), 15.5 (1,000 stacks), 27.5 (90 under START), 39.8
(AVERAGE +5% / YOU −5%), 47.0 (towers out of frame), 49.3 (MIDDLE $0.52), 54.5 (tower top),
56.5 (73% bar), 66.0 (ergodic struck), 79.0 (Kelly peak), 95.5 (comparison rows), 108.5 (Sent).
