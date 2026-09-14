import { markets, snapshotDate } from "./market-data.js";
const money = (v) =>
  v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const ns = "http://www.w3.org/2000/svg";
function svgNode(tag, attrs, text) {
  const el = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs))
    el.setAttribute(key, String(value));
  if (text) el.textContent = text;
  return el;
}
export function drawMarket(key) {
  const m = markets[key];
  if (!m) return;
  document.querySelector("[data-market-name]").textContent = m.name;
  document.querySelector(".asset-icon").textContent = m.icon;
  document.querySelector("#snapshot-price").textContent = "$" + money(m.price);
  document.querySelector("#snapshot-date").textContent =
    `${m.quoteDate} · ${m.quoteLabel}`;
  document.querySelector("#snapshot-series").textContent = `日 K 線 · 綠漲紅跌`;
  document.querySelector("[data-market-note]").textContent =
    `更新 ${snapshotDate} · 固定快照，非即時行情${key === "nasdaq" ? "。QQQ 為 Nasdaq-100 ETF。" : "。"}`;
  const link = document.querySelector("#snapshot-source");
  link.textContent = m.source + " ↗";
  link.href = m.historyUrl;
  const quoteLink = document.querySelector("#snapshot-quote-source");
  quoteLink.href = m.url;
  const svg = document.querySelector("#snapshot-chart");
  svg.replaceChildren();
  svg.setAttribute(
    "aria-label",
    `${m.name} ${m.candles[0][0]} 至 ${m.candles.at(-1)[0]} 日 K 線，美元`,
  );
  const values = m.candles,
    low = Math.min(...values.map((p) => p[3])),
    high = Math.max(...values.map((p) => p[2])),
    pad = Math.max((high - low) * 0.18, 1),
    min = low - pad,
    max = high + pad;
  const x = (i) => 20 + (i * 460) / (values.length - 1),
    y = (v) => 15 + ((max - v) / (max - min)) * 155;
  for (let i = 0; i < 3; i++) {
    const value = min + ((max - min) * i) / 2,
      yy = y(value);
    svg.append(
      svgNode("line", { x1: 20, x2: 480, y1: yy, y2: yy, stroke: "#263c4d" }),
      svgNode(
        "text",
        { x: 490, y: yy + 4, fill: "#94a8b9", "font-size": 11 },
        money(value),
      ),
    );
  }
  m.candles.forEach(([date, open, high, low, close], i) => {
    const color = close >= open ? "#38c99a" : "#ef6b78";
    const candle = svgNode("g", { class: "market-candle" });
    candle.append(
      svgNode(
        "title",
        {},
        date +
          " · 開 " +
          money(open) +
          "／高 " +
          money(high) +
          "／低 " +
          money(low) +
          "／收 " +
          money(close),
      ),
    );
    candle.append(
      svgNode("line", {
        x1: x(i),
        x2: x(i),
        y1: y(high),
        y2: y(low),
        stroke: color,
        "stroke-width": 1.6,
      }),
      svgNode("rect", {
        x: x(i) - 10,
        y: Math.min(y(open), y(close)),
        width: 20,
        height: Math.max(1.5, Math.abs(y(open) - y(close))),
        fill: color,
        rx: 1,
      }),
    );
    svg.append(candle);
  });
  svg.append(
    svgNode(
      "text",
      { x: 20, y: 197, fill: "#94a8b9", "font-size": 11 },
      m.candles[0][0].slice(5),
    ),
    svgNode(
      "text",
      {
        x: 480,
        y: 197,
        fill: "#94a8b9",
        "font-size": 11,
        "text-anchor": "end",
      },
      m.candles.at(-1)[0].slice(5),
    ),
  );
  document
    .querySelectorAll("[data-market]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.market === key)),
    );
}
