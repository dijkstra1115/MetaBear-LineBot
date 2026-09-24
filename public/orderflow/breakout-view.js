import { TIMING, clamp, ease, marketSnapshot } from "./breakout-model.js";
const C = {
  ink: "#e1ebe7",
  muted: "#8ea8af",
  faint: "#5e7a83",
  grid: "#30464c",
  buy: "#a0dfce",
  sell: "#e0be8d",
};
const text = (x, y, value, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${value}</text>`;
const rect = (x, y, w, h, color, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${attrs}/>`;
const line = (x1, y1, x2, y2, color, attrs = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const group = (svg, alpha = 1, attrs = "") =>
  `<g opacity="${clamp(alpha)}" ${attrs}>${svg}</g>`;
const mid = 'text-anchor="middle"',
  num = `${mid} class="number"`;
export const priceY = (price, index) => 150 + index * 150 - (price - 102) * 32;
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return { focus, scale: 1 + 0.14 * focus, x: 620 - 70 * focus, y: 207 };
}
export function drawBreakout({ story, state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 450) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const details = show(TIMING.reset),
    compare = show(TIMING.compare);
  const resetFade = state.preview
    ? reduced
      ? 1
      : 1 - ease((playhead - TIMING.reset + 250) / 250)
    : show(TIMING.reset, 250);
  let world = "";
  for (const [index, source] of story.markets.entries()) {
    const current = state.preview
      ? marketSnapshot(source, Infinity)
      : state.markets[index];
    const base = index * 150;
    let panel = "";
    for (const price of [101, 102, 103]) {
      const py = priceY(price, index),
        threshold = price === 102;
      panel += line(
        96,
        py,
        925,
        py,
        threshold ? C.sell : C.grid,
        `stroke-opacity="${threshold ? 0.55 : 0.35}" stroke-dasharray="${threshold ? "5 5" : "2 7"}"`,
      );
      panel += text(555, py + 4, price, threshold ? C.sell : C.muted, 11, num);
      if (price >= 102) {
        const qty = price === 102 ? current.remaining102 : current.remaining103;
        const initial = price === 102 ? source.depth : 20;
        panel += group(
          rect(606, py - 11, initial * 3.2, 22, "#19282c", 'rx="3"') +
            rect(
              606,
              py - 11,
              qty * 3.2,
              22,
              C.sell,
              `rx="3" fill-opacity=".6" data-case="${source.id}" data-ask-price="${price}" data-ask-size="${qty}"`,
            ) +
            text(876, py + 5, qty, qty ? C.ink : C.faint, 16, num),
          details,
        );
      }
    }
    let path = `M150 ${priceY(101, index)}`;
    const lastAt = source.fills.at(-1).at;
    for (const fill of current.trades) {
      const px = 150 + (fill.at / lastAt) * 240,
        py = priceY(fill.price, index);
      path += ` H${px} V${py}`;
      panel += `<circle cx="${px}" cy="${py}" r="3.5" fill="${C.buy}" data-case="${source.id}" data-fill-at="${fill.at}" data-fill-size="${fill.size}"/>`;
    }
    path += " H478";
    panel += `<path d="${path}" fill="none" stroke="${C.buy}" stroke-opacity=".75" stroke-width="1.7"/>`;
    const top = priceY(current.candle.high, index),
      bottom = priceY(current.candle.low, index);
    panel +=
      line(490, top, 490, bottom, C.buy, 'stroke-width="2"') +
      rect(
        482,
        top - (top === bottom ? 1 : 0),
        16,
        Math.max(2, bottom - top),
        C.buy,
        'rx="2" fill-opacity=".85"',
      );
    panel += text(
      423,
      priceY(current.price, index) - 13,
      current.price,
      C.ink,
      16,
      num,
    );
    if (!state.preview) {
      const latest = current.latest,
        age = latest ? playhead - latest.at : Infinity;
      if (latest && age < 2200)
        panel += group(
          text(
            738,
            priceY(latest.price, index) - 18,
            `成交 ${latest.size}`,
            C.buy,
            12,
            mid,
          ),
          reduced ? 1 : 1 - ease((age - 1600) / 600),
        );
      panel += group(
        text(192, base + 196, "本段主動買入", C.muted, 10) +
          rect(
            258,
            base + 185,
            current.volume * 2.8,
            8,
            C.buy,
            'rx="4" fill-opacity=".55"',
          ) +
          text(467, base + 196, `${current.volume} 隻`, C.ink, 16, num),
        details,
      );
      if (playhead >= TIMING.compare)
        panel += group(
          text(
            737,
            base + 196,
            `起初掛賣 ${source.depth} → 已用完`,
            C.muted,
            11,
            mid,
          ),
          compare,
        );
    }
    world += group(panel, resetFade);
  }
  let svg =
    '<defs><clipPath id="breakout-window"><rect x="56" y="65" width="888" height="310" rx="8"/></clipPath></defs>';
  svg += text(
    64,
    32,
    "BREAKOUT / TWO DEPTHS",
    C.muted,
    10,
    'letter-spacing="2.5"',
  );
  svg += text(
    936,
    32,
    state.preview
      ? "兩段已完成行情 · 同樣越過 102"
      : "只改掛賣深度 · 沒有新增或撤單",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += group(text(810, 57, "等待成交的掛賣 / 隻", C.muted, 11, mid), details);
  svg += `<g clip-path="url(#breakout-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-620 -207)">${world}</g></g>`;
  svg += text(64, 82, "A", C.ink, 18, num) + text(64, 232, "B", C.ink, 18, num);
  svg += line(64, 225, 936, 225, C.grid, 'stroke-opacity=".6"');
  svg += text(
    64,
    404,
    "共同起點 101 · 越過門檻 102 · 同樣成交至 103",
    C.muted,
    10,
  );
  svg += group(
    text(
      936,
      404,
      "本段主動買量：A 65　/　B 15",
      C.ink,
      12,
      'text-anchor="end"',
    ),
    compare,
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
