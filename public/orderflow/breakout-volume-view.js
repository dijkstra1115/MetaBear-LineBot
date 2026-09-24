import { TIMING, clamp, ease } from "./breakout-volume-model.js";
const C = {
  ink: "#e1ebe7",
  muted: "#8ea8af",
  faint: "#5e7a83",
  grid: "#30464c",
  buy: "#a0dfce",
  sell: "#e0be8d",
};
const text = (x, y, v, color = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${v}</text>`;
const rect = (x, y, w, h, color, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" ${attrs}/>`;
const line = (x1, y1, x2, y2, color, attrs = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
const group = (svg, alpha = 1) => `<g opacity="${clamp(alpha)}">${svg}</g>`;
const mid = 'text-anchor="middle"',
  num = `${mid} class="number"`;
export const candleX = (index) => 128 + index * 86;
export const priceY = (price) => 224 - (price - 98) * 13;
export const volumeY = (volume) => 320 - volume * 1.1;
export function cameraAt(playhead, reduced = false) {
  const ramp = (a, b) =>
    reduced ? Number(playhead >= b) : ease((playhead - a) / (b - a));
  const focus =
    ramp(TIMING.zoomIn, TIMING.focused) *
    (1 - ramp(TIMING.zoomOut, TIMING.panorama));
  const follow = ramp(14000, 28500);
  return {
    focus,
    scale: 1 + 0.25 * focus,
    pivotX: 500 + (60 + 120 * follow) * focus,
    pivotY: 210 + 5 * focus,
  };
}
export function drawBreakoutVolume({ story, state, playhead, reduced }) {
  const camera = cameraAt(playhead, reduced),
    { focus, scale, pivotX, pivotY } = camera;
  const show = (at, d = 450) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / d);
  const screenX = (x) => 500 + (x - pivotX) * scale;
  const screenY = (y) => 210 + (y - pivotY) * scale;
  const safe = (x, y, width = 45, size = 12) =>
    screenX(x) - (width * scale) / 2 >= 60 &&
    screenX(x) + (width * scale) / 2 <= 940 &&
    screenY(y - size) >= 56 &&
    screenY(y + 4) <= 374;
  const ending = show(TIMING.panorama, 650);
  let world = group(
    rect(
      candleX(6) - 30,
      priceY(107) - 9,
      candleX(8) - candleX(6) + 60,
      priceY(104) - priceY(107) + 18,
      C.buy,
      'rx="7" fill-opacity=".065"',
    ) +
      text(candleX(7), priceY(107) - 18, "突破區持續成交", C.buy, 11, mid) +
      rect(
        candleX(6) - 27,
        volumeY(60) - 25,
        candleX(8) - candleX(6) + 54,
        96,
        C.buy,
        'rx="5" fill-opacity=".04"',
      ),
    ending,
  );
  for (const price of [98, 100, 102, 104, 106, 108]) {
    world += line(
      86,
      priceY(price),
      913,
      priceY(price),
      price === story.level ? C.sell : C.grid,
      `stroke-opacity="${price === story.level ? ".75" : ".42"}" stroke-dasharray="${price === story.level ? "5 5" : "2 7"}"`,
    );
    if (safe(78, priceY(price) + 4, 25, 10))
      world += text(
        78,
        priceY(price) + 4,
        price,
        price === 104 ? C.sell : C.faint,
        10,
        num,
      );
  }
  world +=
    line(86, 246, 913, 246, C.grid, 'stroke-opacity=".65"') +
    line(86, 320, 913, 320, C.grid);
  world += line(
    86,
    volumeY(story.baseline),
    913,
    volumeY(story.baseline),
    C.sell,
    'stroke-opacity=".5" stroke-dasharray="4 5"',
  );
  for (const bar of state.bars) {
    const x = candleX(bar.index),
      candle = bar.candle;
    if (!candle) continue;
    const color = candle.close >= candle.open ? C.buy : C.sell;
    const alpha = bar.index < 5 ? 1 - 0.68 * focus : 1;
    const top = priceY(Math.max(candle.open, candle.close)),
      bottom = priceY(Math.min(candle.open, candle.close));
    let item =
      line(
        x,
        priceY(candle.high),
        x,
        priceY(candle.low),
        color,
        'stroke-width="2"',
      ) +
      rect(
        x - 9,
        top - (top === bottom ? 1 : 0),
        18,
        Math.max(2, bottom - top),
        color,
        'rx="1.5" fill-opacity=".88"',
      );
    item += rect(
      x - 17,
      volumeY(bar.volume),
      34,
      bar.volume * 1.1,
      color,
      `rx="2" fill-opacity=".68" data-volume-index="${bar.index}" data-volume="${bar.volume}"`,
    );
    if (safe(x, volumeY(bar.volume) - 8, 34, 12))
      item += text(x, volumeY(bar.volume) - 8, bar.volume, C.ink, 12, num);
    if (safe(x, 338, 40, 10)) item += text(x, 338, bar.label, C.muted, 10, num);
    if (bar.index === 5 && safe(x, priceY(candle.high) - 15, 64, 11))
      item += text(x, priceY(candle.high) - 15, "突破這根", C.buy, 11, mid);
    if (bar.index >= 6) {
      const close = bar.complete;
      if (close)
        item += `<circle cx="${x}" cy="${priceY(candle.close)}" r="4" fill="#0d181c" stroke="${C.buy}" stroke-width="1.5" data-completed-index="${bar.index}"/>`;
      if (safe(x, 224, 68, 11))
        item += text(
          x,
          224,
          close ? `收 ${candle.close}` : "形成中",
          close ? C.buy : C.muted,
          11,
          mid,
        );
    }
    world += group(item, alpha);
  }
  if (playhead >= TIMING.compare && playhead < 13000) {
    const bx = candleX(5),
      sy = volumeY(60);
    world += group(
      rect(
        bx - 23,
        sy - 5,
        46,
        76,
        "none",
        `rx="4" stroke="${C.buy}" stroke-opacity=".65"`,
      ),
      show(TIMING.compare),
    );
  }
  let svg =
    '<defs><clipPath id="breakout-volume-window"><rect x="56" y="56" width="888" height="318" rx="8"/></clipPath></defs>';
  svg += text(
    64,
    32,
    "VOLUME / BREAKOUT / TIME",
    C.muted,
    10,
    'letter-spacing="2.1"',
  );
  svg += text(
    936,
    32,
    playhead < 13000 ? "1 MIN · 14:30 已收盤" : "1 MIN · 觀察後續 3 根",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#breakout-volume-window)"><g data-camera-scale="${scale}" transform="translate(500 210) scale(${scale}) translate(${-pivotX} ${-pivotY})">${world}</g></g>`;
  svg += text(
    926,
    screenY(priceY(104)) - 7,
    "門檻 104",
    C.sell,
    11,
    'text-anchor="end"',
  );
  if (playhead >= 4000 && playhead < 13000) {
    svg += group(
      text(226, 208, "前五根均量", C.muted, 12, mid) +
        text(226, 239, "20", C.ink, 29, num),
      show(4000),
    );
    svg += group(
      text(744, 250, "60 ÷ 20", C.muted, 13, num) +
        text(744, 289, "3 倍", C.buy, 30, num),
      show(TIMING.compare),
    );
  }
  svg += text(64, 400, "基準：前五根均量 20", C.muted, 11);
  svg += text(
    500,
    400,
    playhead < 13000
      ? "突破量 60 · 收盤 106"
      : playhead >= TIMING.panorama && state.observed.length === 3
        ? `後三根均量 ${state.followAverage}`
        : `已收盤 ${state.observed.length} / 3`,
    C.ink,
    12,
    mid,
  );
  svg += text(
    936,
    400,
    playhead < 13000
      ? "同一商品 · 相同週期"
      : state.qualified
        ? "後續收盤均 ≥ 104"
        : "觀察成交量與收盤位置",
    state.qualified ? C.buy : C.muted,
    11,
    'text-anchor="end"',
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
