import { TIMING, clamp, ease } from "./volume-model.js";
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
export const priceY = (price) => 180 - (price - 101) * 34;
export const volumeY = (volume) => 320 - volume * 1.15;
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return {
    focus,
    scale: 1 + 0.55 * focus,
    x: 680 - 180 * focus,
    y: 230 - 5 * focus,
  };
}

export function drawVolume({ story, state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 450) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const compare = show(TIMING.panorama),
    shrink = show(22000),
    colorRead = show(25000);
  const resetFade = state.preview
    ? reduced
      ? 1
      : 1 - ease((playhead - (TIMING.reset - 250)) / 250)
    : show(TIMING.reset, 250);
  let world = "";
  for (const price of [100, 101, 102, 103])
    world += line(
      80,
      priceY(price),
      926,
      priceY(price),
      C.grid,
      'stroke-opacity=".4" stroke-dasharray="2 7"',
    );
  world +=
    line(80, 232, 926, 232, C.grid, 'stroke-opacity=".7"') +
    line(80, 320, 926, 320, C.grid);
  for (const [index, bar] of story.context.entries()) {
    const cx = 140 + index * 180;
    const data = bar.selected && !state.preview ? state : bar;
    const candle = data.candle,
      up = !candle || candle.close >= candle.open;
    const color = up ? C.buy : C.sell;
    const alpha = bar.selected ? resetFade : 1 - 0.89 * focus;
    let item = "";
    if (candle) {
      const top = priceY(Math.max(candle.open, candle.close)),
        bottom = priceY(Math.min(candle.open, candle.close));
      item += line(
        cx,
        priceY(candle.high),
        cx,
        priceY(candle.low),
        color,
        'stroke-width="2"',
      );
      item += rect(
        cx - 11,
        top - (top === bottom ? 1 : 0),
        22,
        Math.max(2, bottom - top),
        color,
        'rx="2" fill-opacity=".85"',
      );
    } else
      item += line(cx - 11, 180, cx + 11, 180, C.faint, 'stroke-width="2"');
    item += line(
      cx,
      219,
      cx,
      239,
      C.faint,
      'stroke-dasharray="2 4" stroke-opacity=".5"',
    );
    item += rect(
      cx - 26,
      volumeY(data.volume),
      52,
      data.volume * 1.15,
      color,
      `rx="3" fill-opacity=".75" data-volume-index="${index}" data-volume="${data.volume}"`,
    );
    item += text(cx, volumeY(data.volume) - 9, data.volume, C.ink, 16, num);
    item += text(cx, 340, bar.label, C.muted, 11, num);
    if (bar.selected)
      item += text(
        cx,
        365,
        state.preview ? "已完成 · 回看這根" : "逐筆相加",
        C.muted,
        10,
        mid,
      );
    if (index === 4)
      item += group(
        text(cx, volumeY(data.volume) - 32, "0.5 倍 · 縮量", C.sell, 11, mid),
        shrink,
      );
    if (bar.selected)
      item += group(
        text(cx, volumeY(data.volume) - 32, "2 倍 · 放量", C.buy, 11, mid),
        compare,
      );
    world += group(item, alpha);
  }
  world += group(
    line(
      90,
      volumeY(story.baseline),
      922,
      volumeY(story.baseline),
      "#ddcda2",
      'stroke-dasharray="5 5" stroke-opacity=".75"',
    ) + text(85, volumeY(story.baseline) - 7, "均量 30", "#ddcda2", 10),
    compare,
  );
  world += group(
    line(114, 354, 526, 354, C.muted, 'stroke-opacity=".4"') +
      text(320, 371, "比較基準：前三根均量 30 隻", C.muted, 11, mid),
    compare,
  );

  let svg =
    '<defs><clipPath id="volume-window"><rect x="56" y="58" width="888" height="325" rx="8"/></clipPath></defs>';
  svg += text(64, 32, "VOLUME / 1 MIN", C.muted, 10, 'letter-spacing="2.5"');
  svg += text(
    936,
    32,
    focus > 0.5 ? "14:30 · 一分鐘的成交總量" : "同一商品 · 五個等長的一分鐘",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#volume-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-680 -230)">${world}</g></g>`;
  if (focus > 0 && !state.preview) {
    const latest = state.latest,
      age = latest ? playhead - latest.playedAt : Infinity;
    const noteAlpha = focus * (1 - show(15000));
    if (latest) {
      const drop = reduced ? 1 : ease(age / 650),
        px = 500 + 90 * (1 - drop),
        barTop = y + (volumeY(state.volume) - 230) * scale,
        py = 165 + drop * (barTop - 165);
      svg += group(
        text(px, py, `+${latest.size}`, C[latest.side], 22, num),
        noteAlpha * (1 - ease((age - 1400) / 500)),
      );
      svg += group(
        text(
          748,
          139,
          latest.side === "buy" ? "主動買入" : "主動賣出",
          C[latest.side],
          12,
          mid,
        ) + text(748, 179, `${latest.size} 隻`, C.ink, 31, num),
        noteAlpha,
      );
    }
    svg += group(
      text(260, 173, "成交數量", C.muted, 12, mid) +
        text(260, 204, "每筆只計一次", C.muted, 12, mid),
      focus,
    );
    svg += group(
      rect(
        639,
        123,
        211,
        77,
        "none",
        'rx="8" stroke="#7f8c85" stroke-dasharray="4 5" stroke-opacity=".65"',
      ) +
        text(745, 150, "等待中的掛單", C.muted, 12, mid) +
        text(745, 181, `${state.waiting} 隻`, C.sell, 24, num),
      focus * show(15000),
    );
  }
  svg += text(64, 403, "數量單位：隻", C.muted, 10);
  svg += group(
    text(
      936,
      403,
      "本例配色：收 ≥ 開＝綠　收 ＜ 開＝金",
      C.muted,
      10,
      'text-anchor="end"',
    ),
    colorRead,
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
