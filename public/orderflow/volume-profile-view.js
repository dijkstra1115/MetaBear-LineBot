import { TIMING, PRICES, clamp, ease } from "./volume-profile-model.js";
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
export const priceY = (price) => 232 - (price - 100) * 45;
export function cameraAt(playhead, reduced = false) {
  const into = reduced
    ? Number(playhead >= TIMING.focused)
    : ease((playhead - TIMING.zoomIn) / (TIMING.focused - TIMING.zoomIn));
  const out = reduced
    ? Number(playhead >= TIMING.panorama)
    : ease((playhead - TIMING.zoomOut) / (TIMING.panorama - TIMING.zoomOut));
  const focus = into * (1 - out);
  return { focus, scale: 1 + 0.18 * focus, x: 500, y: 215 - 5 * focus };
}
export function fragmentGeometry(fragment, reduced = false) {
  const start = {
    x: 158 + fragment.minuteIndex * 150,
    y: 330 - (fragment.sourceOffset + fragment.size) * 1.15,
    width: 44,
    height: fragment.size * 1.15,
  };
  const end = {
    x: 650 + fragment.targetOffset * 2.8,
    y: priceY(fragment.price) - 11.5,
    width: fragment.size * 2.8,
    height: 23,
  };
  if (fragment.owner === "source") return start;
  if (fragment.owner === "profile") return end;
  const p = reduced ? 1 : ease(fragment.progress);
  return {
    x: start.x + (end.x - start.x) * p,
    y:
      start.y +
      (end.y - start.y) * p -
      (reduced ? 0 : 34 * Math.sin(p * Math.PI)),
    width: start.width + (end.width - start.width) * p,
    height: start.height + (end.height - start.height) * p,
  };
}
export function drawVolumeProfile({ story, state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 450) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const selection = show(2800),
    poc = show(TIMING.poc),
    destination = show(4200);
  let world = "";
  for (const price of PRICES) {
    const py = priceY(price);
    world += line(
      118,
      py,
      880,
      py,
      C.grid,
      'stroke-opacity=".48" stroke-dasharray="2 7"',
    );
    world += text(622, py + 4, price, C.muted, 11, num);
    world += group(
      rect(
        648,
        py - 13.5,
        176,
        27,
        "none",
        'rx="4" stroke="#30464c" stroke-opacity=".6"',
      ),
      destination,
    );
  }
  world += group(
    rect(
      131,
      75,
      398,
      286,
      "none",
      'rx="9" stroke="#a0dfce" stroke-opacity=".25" stroke-dasharray="4 6"',
    ),
    selection * (1 - show(6000)),
  );
  for (const [index, minute] of story.minutes.entries()) {
    const cx = 180 + index * 150,
      candle = minute.candle,
      color = candle.close >= candle.open ? C.buy : C.sell;
    const top = priceY(Math.max(candle.open, candle.close)),
      bottom = priceY(Math.min(candle.open, candle.close));
    world += line(
      cx,
      priceY(candle.high),
      cx,
      priceY(candle.low),
      color,
      'stroke-width="2"',
    );
    world += rect(
      cx - 9,
      top,
      18,
      Math.max(2, bottom - top),
      color,
      'rx="2" fill-opacity=".8"',
    );
    world += line(cx, 246, cx, 253, C.faint, 'stroke-dasharray="2 4"');
    world += rect(
      cx - 24,
      330 - minute.volume * 1.15 - 2,
      48,
      minute.volume * 1.15 + 4,
      "none",
      'rx="3" stroke="#385057" stroke-opacity=".55"',
    );
    world += text(
      cx,
      330 - minute.volume * 1.15 - 10,
      state.pendingByMinute[index],
      C.ink,
      17,
      `${num} data-pending-minute="${index}"`,
    );
    world += text(cx, 353, minute.label, C.muted, 10, num);
  }
  // Each quantity has exactly one owner, including while its rectangle travels.
  // Drawing the travelling fragment replaces its source, not a second copy.
  for (const fragment of state.fragments) {
    const g = fragmentGeometry(fragment, reduced);
    const active = fragment.owner === "transit",
      isPoc = fragment.price === story.poc.price;
    const fill = active ? C.ink : isPoc ? C.buy : "#719e95";
    world += rect(
      g.x,
      g.y,
      g.width,
      g.height,
      fill,
      `rx="2" fill-opacity="${active ? 0.88 : 0.7}" stroke="#0b1218" stroke-width="1" data-fragment-id="${fragment.id}" data-owner="${fragment.owner}" data-quantity="${fragment.size}"`,
    );
    if (active)
      world += text(
        g.x + g.width / 2,
        g.y + g.height / 2 + 4,
        fragment.size,
        "#15312e",
        11,
        num,
      );
  }
  for (const row of state.profile) {
    world += group(
      text(
        650 + row.volume * 2.8 + 18,
        priceY(row.price) + 5,
        row.volume,
        row.volume ? C.ink : C.faint,
        17,
        `${num} data-profile-price="${row.price}" data-profile-volume="${row.volume}"`,
      ),
      destination,
    );
  }
  world += group(
    rect(
      645,
      priceY(101) - 16,
      205,
      32,
      "none",
      'rx="5" stroke="#a0dfce" stroke-opacity=".8"',
    ) + text(748, priceY(101) - 19, "POC · 101 元 / 60 隻", C.buy, 12, mid),
    poc,
  );
  let svg =
    '<defs><clipPath id="volume-profile-window"><rect x="56" y="55" width="888" height="323" rx="8"/></clipPath></defs>';
  svg += text(64, 32, "VOLUME PROFILE", C.muted, 10, 'letter-spacing="2.5"');
  svg += text(
    936,
    32,
    `範圍 ${story.range} · 總成交 ${story.total} 隻`,
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#volume-profile-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-500 -215)">${world}</g></g>`;
  svg += text(300, 54, "按時間 · 待歸類", C.muted, 9, mid);
  svg += group(text(757, 54, "按價位 · 已歸類", C.muted, 9, mid), destination);
  svg += text(64, 404, `待歸類 ${state.pending}`, C.muted, 12);
  svg += text(
    500,
    404,
    `移動中 ${state.inTransit}`,
    state.inTransit ? C.ink : C.faint,
    12,
    mid,
  );
  svg += text(
    936,
    404,
    `已歸類 ${state.classified} / ${story.total}`,
    C.ink,
    12,
    'text-anchor="end"',
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
