// Shared character and product illustrations for the continuous beginner story.
const C = {
  ink: "#e1ebe7",
  muted: "#7f99a2",
  grid: "#293e46",
  buy: "#8bd7c4",
  sell: "#d8b689",
  panel: "#101b22",
};
const text = (x, y, s, c = C.muted, size = 12, attrs = "") =>
  `<text x="${x}" y="${y}" fill="${c}" font-size="${size}" ${attrs}>${s}</text>`;
const rect = (x, y, w, h, c, attrs = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${attrs}/>`;
const line = (x, y, x2, y2, c = C.grid, attrs = "") =>
  `<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="${c}" ${attrs}/>`;
const center = 'text-anchor="middle"';
const number = 'class="number"';

// A bear token is one requested unit, never a fraction or a shipment of cash.
export function bear(x, y, r = 10, color = C.sell, attrs = "") {
  return `<g transform="translate(${x} ${y})" ${attrs} fill="${C.panel}" stroke="${color}" stroke-width="1.3">
    <circle cx="${-r * 0.72}" cy="${-r * 0.65}" r="${r * 0.42}"/><circle cx="${r * 0.72}" cy="${-r * 0.65}" r="${r * 0.42}"/>
    <ellipse rx="${r}" ry="${r * 0.87}"/><ellipse cy="${r * 0.29}" rx="${r * 0.4}" ry="${r * 0.28}" fill="${color}" fill-opacity=".16" stroke="none"/>
    <circle cx="${-r * 0.33}" cy="${-r * 0.12}" r="${r * 0.07}" fill="${color}"/><circle cx="${r * 0.33}" cy="${-r * 0.12}" r="${r * 0.07}" fill="${color}"/>
    <path d="M${-r * 0.12},${r * 0.22} Q0,${r * 0.38} ${r * 0.12},${r * 0.22}" fill="none"/>
  </g>`;
}

export function actor(x, role) {
  const buyer = role === "buy",
    exchange = role === "exchange";
  const color = buyer ? C.buy : exchange ? C.ink : C.sell;
  const y = exchange ? 55 : 123;
  let s = `<g data-role="${role}">`;
  s += `<circle cx="${x}" cy="${y}" r="37" fill="${color}" fill-opacity=".035" stroke="${color}" stroke-opacity=".14"/>`;
  if (exchange) {
    s += rect(
      x - 24,
      y - 19,
      48,
      36,
      C.panel,
      `rx="11" stroke="${color}" stroke-opacity=".65"`,
    );
    s +=
      line(x, y - 19, x, y - 27, color) +
      `<circle cx="${x}" cy="${y - 30}" r="3" fill="${C.buy}"/>`;
    s += rect(x - 16, y - 8, 32, 12, C.grid, 'rx="5"');
    s += `<circle cx="${x - 8}" cy="${y - 2}" r="2.5" fill="${C.buy}"/><circle cx="${x + 8}" cy="${y - 2}" r="2.5" fill="${C.sell}"/>`;
    s += `<path d="M${x - 8},${y + 11} H${x + 8}" stroke="${color}" stroke-linecap="round"/>`;
    s += rect(
      x - 29,
      y + 20,
      58,
      15,
      C.panel,
      `rx="7" stroke="${color}" stroke-opacity=".35"`,
    );
  } else {
    s += `<path d="M${x - 24},${y + 25} Q${x - 22},${y + 4} ${x},${y + 5} Q${x + 22},${y + 4} ${x + 24},${y + 25}" fill="${color}" fill-opacity=".19" stroke="${color}" stroke-opacity=".6"/>`;
    s += `<circle cx="${x}" cy="${y - 7}" r="16" fill="${C.panel}" stroke="${color}"/>`;
    s += `<path d="M${x - 15},${y - 11} Q${x - 6},${y - 31} ${x + 14},${y - 12}" fill="${color}" fill-opacity=".4" stroke="${color}"/>`;
    s += `<circle cx="${x - 5}" cy="${y - 6}" r="1.4" fill="${color}"/><circle cx="${x + 5}" cy="${y - 6}" r="1.4" fill="${color}"/>`;
    if (buyer)
      s +=
        rect(x + 20, y + 5, 15, 19, C.panel, `rx="2" stroke="${color}"`) +
        `<path d="M${x + 23},${y + 5} V${y + 1} Q${x + 27},${y - 5} ${x + 32},${y + 1} V${y + 5}" fill="none" stroke="${color}"/>`;
    else
      s +=
        rect(
          x - 12,
          y + 12,
          24,
          21,
          C.panel,
          `rx="3" stroke="${color}" stroke-opacity=".8"`,
        ) + bear(x, y + 23, 6, color);
  }
  s += text(
    x,
    y + 58,
    exchange ? "交易所" : buyer ? "買方" : "賣方",
    color,
    16,
    center,
  );
  if (exchange) s += text(x, y + 77, "撮合買賣委託", C.muted, 10, center);
  return s + "</g>";
}
