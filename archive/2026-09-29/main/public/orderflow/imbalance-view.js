import { TIMING, clamp, ease } from "./imbalance-model.js";
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
export const priceY = (price) => 286 - (price - 100) * 62;
export function projectedTextBox(px, py, value, size, anchor, camera) {
  const width = String(value).length * size;
  const left =
    px - (anchor === "middle" ? width / 2 : anchor === "end" ? width : 0);
  return {
    left: camera.x + (left - 500) * camera.scale,
    right: camera.x + (left + width - 500) * camera.scale,
    top: camera.y + (py - size - camera.worldY) * camera.scale,
    bottom: camera.y + (py + size * 0.28 - camera.worldY) * camera.scale,
  };
}
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  let target = 255;
  for (const [at, next] of [
    [13000, 193],
    [17500, 131],
    [21500, 69],
  ]) {
    const amount = reduced
      ? Number(playhead >= at + 1200)
      : ease((playhead - at) / 1200);
    target += (next - target) * amount;
  }
  return {
    focus,
    scale: 0.66 + 0.74 * focus,
    worldY: 200 + (target - 200) * focus,
    x: 500,
    y: 205,
  };
}
export function drawImbalance({ story, state, playhead, reduced }) {
  const { focus, scale, worldY, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 450) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const activePair = state.current,
    compare = state.showComparison ? show(activePair.revealAt, 250) : 0;
  // Peripheral rows can leave the camera, but individual glyphs never straddle
  // the clip edge. Bounds use a conservative full-em width for every character.
  const worldText = (px, py, value, color = C.muted, size = 12, attrs = "") => {
    const anchor = attrs.includes('text-anchor="middle"')
      ? "middle"
      : attrs.includes('text-anchor="end"')
        ? "end"
        : "start";
    const box = projectedTextBox(px, py, value, size, anchor, {
      x,
      y,
      worldY,
      scale,
    });
    return box.left >= 60 &&
      box.right <= 940 &&
      box.top >= 82 &&
      box.bottom <= 319
      ? text(px, py, value, color, size, `${attrs} data-window-label="1"`)
      : "";
  };
  let world = "";
  for (const [index, candle] of story.context.entries()) {
    const cx = 30 + index * 470,
      selected = index === 1;
    let column = "";
    for (const row of candle.rows) {
      const py = priceY(row.price),
        highlighted = selected && state.highlightedPrices.includes(row.price);
      const currentBid = selected && row.price === activePair.lower.price;
      const currentAsk = selected && row.price === activePair.upper.price;
      const dim =
        !focus || !selected || currentBid || currentAsk ? 1 : 1 - focus * 0.62;
      let cells = line(
        cx - 150,
        py,
        cx + 150,
        py,
        C.grid,
        'stroke-opacity=".45" stroke-dasharray="2 6"',
      );
      cells += worldText(
        cx - 160,
        py + 5,
        row.price,
        C.muted,
        12,
        'text-anchor="end"',
      );
      cells +=
        rect(cx - 130, py - 20, 95, 40, C.sell, 'rx="4" fill-opacity=".12"') +
        worldText(
          cx - 82.5,
          py + 9,
          row.sell,
          row.sell ? C.sell : C.faint,
          26,
          `${num} data-bid-price="${row.price}" data-column="${index}"`,
        );
      cells +=
        rect(
          cx + 35,
          py - 20,
          95,
          40,
          highlighted ? C.buy : "#446c65",
          `rx="4" fill-opacity="${highlighted ? 0.26 : 0.17}"`,
        ) +
        worldText(
          cx + 82.5,
          py + 9,
          row.buy,
          row.buy ? C.buy : C.faint,
          26,
          `${num} data-ask-price="${row.price}" data-column="${index}"`,
        );
      if (highlighted)
        cells += rect(
          cx + 138,
          py - 19,
          4,
          38,
          C.buy,
          `rx="2" data-imbalance-price="${row.price}"`,
        );
      if (selected && compare) {
        if (currentBid)
          cells += group(
            rect(
              cx - 134,
              py - 24,
              103,
              48,
              "none",
              'rx="6" stroke="#d8bd87" stroke-width="1.5"',
            ),
            compare,
          );
        if (currentAsk)
          cells += group(
            rect(
              cx + 31,
              py - 24,
              103,
              48,
              "none",
              'rx="6" stroke="#a0dfce" stroke-width="1.5"',
            ),
            compare,
          );
      }
      column += group(cells, dim);
    }
    const top = priceY(Math.max(candle.candle.open, candle.candle.close)),
      bottom = priceY(Math.min(candle.candle.open, candle.candle.close));
    const color = candle.candle.close >= candle.candle.open ? C.buy : C.sell;
    column += group(
      line(
        cx,
        priceY(candle.candle.high),
        cx,
        priceY(candle.candle.low),
        color,
        'stroke-width="2"',
      ) +
        rect(
          cx - 8,
          top,
          16,
          Math.max(2, bottom - top),
          color,
          'rx="2" fill-opacity=".75"',
        ),
      1 - focus * 0.82,
    );
    column += worldText(cx, 332, `${candle.label} · 已完成`, C.muted, 14, mid);
    world += group(column, selected ? 1 : 1 - focus);
  }
  if (compare) {
    const bottom = priceY(activePair.lower.price),
      top = priceY(activePair.upper.price);
    world += group(
      `<path d="M465 ${bottom} L535 ${top}" fill="none" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="4 4"/>` +
        `<circle cx="465" cy="${bottom}" r="3" fill="${C.sell}"/><circle cx="535" cy="${top}" r="3" fill="${C.buy}"/>`,
      compare,
    );
  }
  let svg =
    '<defs><clipPath id="imbalance-window"><rect x="56" y="78" width="888" height="245" rx="8"/></clipPath></defs>';
  svg += text(
    64,
    32,
    "FOOTPRINT IMBALANCE",
    C.muted,
    10,
    'letter-spacing="2.5"',
  );
  svg += text(
    936,
    32,
    "已完成足跡 · 買方對角示例",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#imbalance-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-500 ${-worldY})">${world}</g></g>`;
  svg += group(
    text(382, 62, "Bid · 主動賣", C.sell, 12, mid) +
      text(618, 62, "Ask · 主動買", C.buy, 12, mid),
    focus,
  );
  if (compare) {
    const formula =
      activePair.ratio === null
        ? `${activePair.upper.buy} ÷ 0 → 本例不計`
        : `${activePair.upper.buy} ÷ ${activePair.lower.sell} = ${activePair.ratio} 倍`;
    const result =
      activePair.ratio === null
        ? "零分母排除"
        : activePair.pass
          ? "達到門檻"
          : "未達門檻";
    svg += group(
      text(500, 355, formula, C.ink, 25, num) +
        text(500, 380, result, activePair.pass ? C.buy : C.muted, 12, mid),
      compare,
    );
  }
  svg += text(64, 407, "1 格＝1 元 · 比較相鄰價位，不是同價兩側", C.muted, 10);
  svg += group(
    text(
      936,
      407,
      "本例 ≥3:1（300%） · 零分母不計",
      C.muted,
      10,
      'text-anchor="end"',
    ),
    show(TIMING.firstRatio),
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
