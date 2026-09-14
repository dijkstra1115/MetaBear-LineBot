import fs from "node:fs/promises";
const text = (x, y, s, color = "#dbe7f3", size = 22) =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}">${s}</text>`;
const line = (x1, y1, x2, y2, color = "#395169", dash = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>`;
const wrap = (title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 400" role="img"><title>${title}</title><rect width="760" height="400" rx="12" fill="#101d2d"/><g font-family="sans-serif">${text(28, 38, title, "#8be0d7", 24)}${body}${text(28, 375, "MetaBear 概念示意・非即時行情", "#9db1c4", 16)}</g></svg>`;
await fs.writeFile(
  "public/guides/market/cvd-example.svg",
  wrap(
    "CVD：把每段成交量差加起來",
    [
      text(32, 80, "時間 →"),
      text(185, 80, "第 1 段"),
      text(385, 80, "第 2 段"),
      text(585, 80, "第 3 段"),
      text(32, 125, "主動買入"),
      text(208, 125, "80"),
      text(408, 125, "30"),
      text(608, 125, "70"),
      text(32, 165, "主動賣出"),
      text(208, 165, "50"),
      text(408, 165, "50"),
      text(608, 165, "30"),
      text(32, 205, "當段差值"),
      text(200, 205, "+30", "#38c99a"),
      text(400, 205, "−20", "#ef6b78"),
      text(600, 205, "+40", "#38c99a"),
      line(170, 285, 680, 285, "#395169", "5 5"),
      text(120, 293, "0"),
      '<polyline points="160,285 220,255 420,275 620,235" fill="none" stroke="#8be0d7" stroke-width="4"/>',
      text(180, 243, "30"),
      text(398, 310, "10"),
      text(600, 222, "50"),
      text(32, 330, "CVD：0 → 30 → 10 → 50（示例單位相同）", "#dbe7f3", 20),
    ].join(""),
  ),
);
await fs.writeFile(
  "public/guides/market/depth-example.svg",
  wrap(
    "委託簿深度：還在排隊的買單與賣單",
    [
      text(32, 82, "累積數量（BTC）", "#9db1c4", 18),
      line(80, 300, 690, 300),
      line(80, 100, 80, 300),
      text(45, 305, "0"),
      text(37, 205, "10"),
      text(37, 110, "20"),
      '<path d="M110 300 V120 H180 V200 H250 V250 H320 V280 H355 V300 Z" fill="#38c99a" fill-opacity="0.22" stroke="#38c99a" stroke-width="3"/>',
      '<path d="M405 300 V280 H450 V250 H520 V180 H600 V120 H675 V300 Z" fill="#ef6b78" fill-opacity="0.22" stroke="#ef6b78" stroke-width="3"/>',
      text(140, 105, "買單", "#38c99a"),
      text(550, 105, "賣單", "#ef6b78"),
      text(112, 337, "98"),
      text(343, 337, "99.9"),
      text(405, 337, "100.1"),
      text(640, 337, "102"),
      text(545, 370, "價格（USDT）", "#9db1c4", 16),
      text(282, 160, "中間空隙是買賣價差", "#dbe7f3", 18),
      line(380, 172, 380, 280, "#9db1c4", "4 4"),
    ].join(""),
  ),
);
await fs.writeFile(
  "public/guides/market/oi-example.svg",
  wrap(
    "OI 與 Volume，數的是不同事情",
    [
      text(32, 90, "原本有 100 張未平倉合約"),
      text(32, 145, "雙方新開 10 張"),
      text(385, 145, "OI 110　／　成交量 +10", "#38c99a", 23),
      text(32, 205, "雙方平掉 10 張"),
      text(385, 205, "OI 90　／　成交量 +10", "#ef6b78", 23),
      text(32, 265, "一方開倉、一方平倉"),
      text(385, 265, "OI 100　／　成交量 +10", "#8be0d7", 23),
      text(
        32,
        325,
        "三個獨立例子：都從 OI 100 開始；每筆合約只計一次。",
        "#9db1c4",
        18,
      ),
    ].join(""),
  ),
);
