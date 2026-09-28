import { TIMING, clamp, ease, signed } from "./delta-concept-model.js";
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
export const cvdY = (value) => 370 - value * 1.6;
export const deltaY = (value) => 245 - value * 1.25;
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
    scale: 1 + 0.6 * focus,
    x: 270 + 210 * focus,
    y: 205 + 35 * focus,
  };
}
export function drawDeltaConcept({ story, state, playhead, reduced }) {
  const { focus, scale, x, y } = cameraAt(playhead, reduced);
  const show = (at, duration = 450) =>
    reduced ? Number(playhead >= at) : ease((playhead - at) / duration);
  const cum = show(TIMING.cvd);
  let world = "";
  for (const [index, minute] of story.minutes.entries()) {
    const cx = 270 + index * 240;
    const color = minute.candle.close >= minute.candle.open ? C.buy : C.sell;
    let column = text(
      cx,
      81,
      `${minute.label}–${minute.endLabel}`,
      C.muted,
      11,
      num,
    );
    for (const [rowIndex, row] of minute.rows.entries()) {
      const py = 110 + rowIndex * 32;
      column +=
        rect(cx - 85, py - 13, 58, 26, C.sell, 'rx="3" fill-opacity=".13"') +
        text(cx - 56, py + 5, row.sell, row.sell ? C.sell : C.faint, 18, num);
      column +=
        rect(cx + 27, py - 13, 58, 26, C.buy, 'rx="3" fill-opacity=".13"') +
        text(cx + 56, py + 5, row.buy, row.buy ? C.buy : C.faint, 18, num);
      column += text(
        cx - 101,
        py + 4,
        row.price,
        C.faint,
        9,
        'text-anchor="end"',
      );
    }
    const bodyY = 110,
      bodyHeight = 32;
    column += line(
      cx,
      bodyY - 3,
      cx,
      bodyY + bodyHeight + 3,
      color,
      'stroke-width="1.5"',
    );
    column += rect(
      cx - 7,
      bodyY,
      14,
      bodyHeight,
      color,
      'rx="2" fill-opacity=".8"',
    );
    const formula =
      index === 0 ? show(TIMING.formula) : show(story.deltaAt[index] - 350);
    column += group(
      text(cx, 180, `${minute.buy} − ${minute.sell}`, C.ink, 16, num),
      formula,
    );
    column += group(
      line(cx, 188, cx, 200, C.faint, 'stroke-dasharray="2 4"'),
      formula,
    );
    const revealed = index < state.deltaCount;
    if (revealed) {
      const color = minute.delta >= 0 ? C.buy : C.sell;
      const top = Math.min(deltaY(0), deltaY(minute.delta));
      column += rect(
        cx - 21,
        top,
        42,
        Math.abs(minute.delta) * 1.25,
        color,
        `rx="3" fill-opacity=".75" data-delta-index="${index}" data-delta="${minute.delta}"`,
      );
      column += text(
        cx + 43,
        deltaY(minute.delta) + 6,
        signed(minute.delta),
        color,
        20,
        'class="number"',
      );
    }
    column += group(
      line(cx - 87, 245, cx + 89, 245, C.grid, 'stroke-opacity=".85"'),
      show(TIMING.firstDelta),
    );
    column += group(
      text(
        cx,
        280,
        `Delta ${revealed ? signed(minute.delta) : "—"}`,
        C.muted,
        11,
        mid,
      ),
      show(TIMING.firstDelta),
    );
    world += group(column, index === 0 ? 1 : 1 - focus);
  }
  const xs = [130, 270, 510, 750];
  let cumulative =
    line(112, 370, 855, 370, C.grid, 'stroke-opacity=".75"') +
    text(112, 386, `${story.resetLabel} 歸零`, C.muted, 10);
  let path = "";
  for (const [index, point] of state.points.entries()) {
    const px = xs[index],
      py = cvdY(point.value);
    path += index ? ` L${px} ${py}` : `M${px} ${py}`;
    cumulative += `<circle cx="${px}" cy="${py}" r="4" fill="${index ? C.buy : C.muted}" data-cvd="${point.value}"/>`;
    cumulative += text(
      px,
      py - 11,
      signed(point.value),
      index ? C.ink : C.muted,
      17,
      num,
    );
    if (index) cumulative += text(px, 386, point.label, C.muted, 10, num);
  }
  cumulative =
    `<path d="${path}" fill="none" stroke="${C.buy}" stroke-width="2"/>` +
    cumulative;
  for (let index = 0; index < state.cvdCount; index++) {
    const cx = 270 + index * 240,
      minute = story.minutes[index];
    cumulative += line(
      cx,
      290,
      cx,
      cvdY(minute.cvd) - 25,
      C.faint,
      'stroke-dasharray="2 4" stroke-opacity=".6"',
    );
  }
  cumulative +=
    text(880, 331, "CVD", C.muted, 11, mid) +
    text(880, 360, signed(state.cvd), C.ink, 27, num);
  world += group(cumulative, cum);
  let svg =
    '<defs><clipPath id="delta-concept-window"><rect x="56" y="57" width="888" height="338" rx="8"/></clipPath></defs>';
  svg += text(64, 32, "DELTA → CVD", C.muted, 10, 'letter-spacing="2.5"');
  svg += text(
    936,
    32,
    focus > 0.5 ? "14:30 · 單一分鐘" : "同一組已完成成交 · 每段一分鐘",
    C.muted,
    11,
    'text-anchor="end"',
  );
  svg += `<g clip-path="url(#delta-concept-window)"><g data-camera-scale="${scale}" transform="translate(${x} ${y}) scale(${scale}) translate(-270 -205)">${world}</g></g>`;
  svg += group(
    text(480, 58, "主動買入量　−　主動賣出量", C.muted, 12, mid),
    focus * show(TIMING.formula),
  );
  svg += text(64, 407, "左主動賣 · 右主動買 ｜ 單位：隻", C.muted, 10);
  svg += group(
    text(936, 407, "CVD 起點：本例 14:30＝0", C.muted, 10, 'text-anchor="end"'),
    cum,
  );
  return { svg, viewBox: "0 0 1000 430", width: 1000, height: 430 };
}
