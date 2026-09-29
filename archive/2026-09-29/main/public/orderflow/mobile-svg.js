export const C = {
  ink: "#e1ebe7",
  muted: "#91a4ab",
  grid: "#293e46",
  buy: "#8bd7c4",
  sell: "#d8b689",
  down: "#d99c88",
  panel: "#101b22",
};
export const number = 'class="number"';
export const center = 'text-anchor="middle"';
export const text = (x, y, value, color = C.muted, size = 14, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${attrs}>${value}</text>`;
export const rect = (x, y, w, h, color = C.panel, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${color}" ${attrs}/>`;
export const line = (x, y, x2, y2, color = C.grid, attrs = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${color}" ${attrs}/>`;
export const panel = (y, h) =>
  rect(12, y, 336, h, C.panel, 'rx="8" stroke="#293e46"');
export const frame = (svg, height = 470) => ({
  svg,
  width: 360,
  height,
  viewBox: `0 0 360 ${height}`,
});
export function candle(c, x, y, width = 24, attrs = "") {
  if (!c) return "";
  const color = c.close > c.open ? C.buy : c.close < c.open ? C.down : C.muted;
  return (
    `<g data-candle="true" data-close="${c.close}" data-high="${c.high}" data-low="${c.low}" ${attrs}>` +
    line(x, y(c.high), x, y(c.low), color, 'stroke-width="2"') +
    rect(
      x - width / 2,
      Math.min(y(c.open), y(c.close)),
      width,
      Math.max(2, Math.abs(y(c.open) - y(c.close))),
      color,
      'rx="1"',
    ) +
    "</g>"
  );
}
export function stepPath(points, x, y, field = "price") {
  return points
    .map((p, i) =>
      i ? `H${x(p.at)}V${y(p[field])}` : `M${x(p.at)},${y(p[field])}`,
    )
    .join(" ");
}
