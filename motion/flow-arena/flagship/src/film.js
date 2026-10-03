// Film runtime: draws every scene active at time t onto one 2D canvas, then hands the frame and
// the look the scenes asked for to the finishing pass (src/post.js).

import { SCENES, W, H, bar } from "./cues.js";
import { createPost } from "./post.js";
import * as open from "./scenes/open.js";
import * as fuel from "./scenes/fuel.js";
import * as title from "./scenes/title.js";
import * as read from "./scenes/read.js";
import * as battle from "./scenes/battle.js";
import * as ledger from "./scenes/ledger.js";
import * as ranked from "./scenes/ranked.js";
import * as end from "./scenes/end.js";

const MODULES = { open, fuel, title, read, battle, ledger, ranked, end };

export async function boot(stage) {
  const frame = document.createElement("canvas");
  frame.width = W;
  frame.height = H;
  // CPU raster: the post pass reads every pixel back anyway, and without a GPU an accelerated
  // canvas would queue all workers through one GPU process; on the CPU they draw in parallel.
  const ctx = frame.getContext("2d", { alpha: false, willReadFrequently: true });
  const post = createPost(stage, W, H);

  // Canvas text does not trigger web-font loading, so request every face and every Chinese glyph.
  const zh = [...new Set(Object.values(MODULES).map((m) => m.ZH ?? "").join(""))].join("");
  await Promise.all([
    document.fonts.load('700 100px "Barlow Condensed"'),
    document.fonts.load('500 100px "Barlow Condensed"'),
    document.fonts.load('500 20px "JetBrains Mono Variable"', "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-$#×·%"),
    document.fonts.load('700 40px "Noto Sans TC Variable"', zh || "市場"),
  ]);
  await document.fonts.ready;
  await Promise.all(Object.values(MODULES).map((m) => m.init?.()));

  return function render(t, index = Math.round(t * 60)) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#04070b";
    ctx.fillRect(0, 0, W, H);
    const look = {};
    for (const s of SCENES) {
      const m = MODULES[s.id];
      const a = bar(s.from) - (m.lead ?? 0);
      const b = bar(s.to) + (m.tail ?? 0);
      if (t < a || t >= b) continue;
      ctx.save();
      m.draw(ctx, t, t - bar(s.from), look);
      ctx.restore();
    }
    post(frame, look, t, index);
  };
}
