export const fmt = (n, digits = 2) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
const C = {
  text: "#dce6d4",
  muted: "#99a992",
  grid: "#2a352a",
  buy: "#71d9b2",
  sell: "#f59b9c",
  accent: "#d7ef85",
};
const text = (
  x,
  y,
  s,
  color = C.muted,
  anchor = "start",
  size = 12,
  cls = "",
) =>
  `<text x="${x}" y="${y}" fill="${color}" text-anchor="${anchor}" font-size="${size}"${cls ? ` class="${cls}"` : ""}>${s}</text>`;
const line = (x1, y1, x2, y2, color = C.grid, extra = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;
const rect = (x, y, w, h, color, extra = "") =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" fill="${color}" ${extra}/>`;
function series(values, x, y, w, h, min, max) {
  const range = max - min || 1;
  return values.map((n, i) => [
    x + (i / Math.max(1, values.length - 1)) * w,
    y + h - ((n - min) / range) * h,
  ]);
}
function path(points) {
  return points
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
}
export function miniChart(svg, history, key, color) {
  const W = Math.max(160, svg.clientWidth),
    H = 82;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const values = history
    .map((s) => s[key])
    .filter((v) => v != null && Number.isFinite(v));
  if (values.length < 2) {
    svg.innerHTML = text(8, 44, "等待下一個資料點", C.muted, "start", 11, "cn");
    return;
  }
  const min = Math.min(...values),
    max = Math.max(...values),
    pts = series(values, 2, 12, W - 4, 48, min, max);
  svg.innerHTML =
    line(0, 61, W, 61) +
    `<path d="${path(pts)} L${W - 2},64 L2,64 Z" fill="${color}" opacity=".07"/><path d="${path(pts)}" fill="none" stroke="${color}" stroke-width="1.5"/>` +
    text(2, 78, fmt(values[0], 1), C.muted, "start", 10) +
    text(W - 2, 78, fmt(values.at(-1), 1), color, "end", 10);
}
export function drawMarket(
  svg,
  f,
  zoom,
  reveal = false,
  selected = null,
  layer = "price",
) {
  const W = Math.max(320, svg.clientWidth),
    H = W < 520 ? 330 : 375,
    mobile = W < 520;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute(
    "aria-label",
    `${["價格走勢", "成交足跡", "訂單簿"][zoom]}，最新價 ${fmt(f.price)}，CVD ${fmt(f.cvd)} ${f.unit}。可用上方尺度按鈕操作。`,
  );
  if (!(f.price > 0)) {
    svg.innerHTML =
      text(W / 2, H / 2 - 8, "等待公開行情", C.text, "middle", 17, "cn") +
      text(
        W / 2,
        H / 2 + 23,
        "連線成功後，這裡將顯示真實資料。",
        C.muted,
        "middle",
        12,
        "cn",
      );
    return;
  }
  let out = "";
  if (zoom === 0 && layer === "heatmap") {
    const samples = f.history.slice(-60).filter((s) => s.bids && s.asks);
    const levels = samples.flatMap((s) => [...s.bids, ...s.asks]);
    if (!levels.length) {
      svg.innerHTML = text(
        W / 2,
        H / 2,
        "等待下一個深度快照",
        C.muted,
        "middle",
        13,
        "cn",
      );
      return;
    }
    const low = Math.min(
      ...levels.map((r) => r.price),
      ...samples.map((s) => s.price),
    );
    const high = Math.max(
      ...levels.map((r) => r.price),
      ...samples.map((s) => s.price),
    );
    const pad = Math.max((high - low) * 0.06, f.price * 0.000002);
    const min = low - pad,
      max = high + pad,
      left = 18,
      right = W - 78,
      top = 25,
      h = H - 77;
    const maxSize = Math.max(...levels.map((r) => r.size)),
      step = (right - left) / samples.length;
    const y = (p) => top + h - ((p - min) / (max - min)) * h;
    const prices = [...new Set(levels.map((r) => r.price))].sort(
      (a, b) => a - b,
    );
    const tick = Math.min(...prices.slice(1).map((p, i) => p - prices[i]));
    const cellH = Math.max(2, Math.min(13, (tick / (max - min)) * h * 0.8));
    for (let i = 0; i < 5; i++) {
      const p = max - ((max - min) * i) / 4;
      out +=
        line(left, y(p), right, y(p)) +
        text(right + 7, y(p) + 4, fmt(p, 1), C.muted, "start", 10);
    }
    samples.forEach((s, i) => {
      for (const [rows, color] of [
        [s.bids, C.buy],
        [s.asks, C.sell],
      ])
        for (const r of rows) {
          const alpha = 0.08 + 0.8 * Math.sqrt(r.size / maxSize);
          out += rect(
            left + i * step,
            y(r.price) - cellH / 2,
            Math.max(1, step - 0.4),
            cellH,
            color,
            `opacity="${alpha.toFixed(2)}" rx="1"`,
          );
        }
    });
    const pts = samples.map((s, i) => [left + (i + 0.5) * step, y(s.price)]);
    out += `<path d="${path(pts)}" fill="none" stroke="#edf5e7" stroke-width="1.6" stroke-linejoin="round"/>`;
    out +=
      text(
        left,
        H - 25,
        `較早 · ${samples.length} 張快照`,
        C.muted,
        "start",
        10,
        "cn",
      ) + text(right, H - 25, "現在 →", C.muted, "end", 10, "cn");
    out += text(
      W / 2,
      H - 4,
      "亮度＝可見掛量 · 空白可能超出記錄範圍",
      C.muted,
      "middle",
      11,
      "cn",
    );
  } else if (zoom === 2) {
    const count = mobile ? 5 : 6,
      asks = f.asks.slice(0, count).reverse(),
      bids = f.bids.slice(0, count);
    const mid = W / 2,
      gap = mobile ? 47 : 57,
      pad = mobile ? 15 : 28,
      sideW = mid - gap - pad;
    const maxSize = Math.max(1, ...asks.concat(bids).map((r) => r.size));
    out +=
      text(pad, 19, `BID · 買量 ${f.unit}`, C.buy, "start", 11, "cn") +
      text(mid, 19, "USDT", C.muted, "middle", 10) +
      text(W - pad, 19, `ASK · 賣量 ${f.unit}`, C.sell, "end", 11, "cn");
    const rowH = mobile ? 24 : 23,
      start = 33;
    const drawRow = (r, i, side, y) => {
      const buy = side === "buy",
        color = buy ? C.buy : C.sell,
        width = Math.max(2, (r.size / maxSize) * sideW);
      let s = `<g data-price="${r.price}" role="button" tabindex="0" aria-label="選取價格 ${r.price}">`;
      s += rect(
        pad - 5,
        y - 2,
        W - 2 * pad + 10,
        rowH,
        selected === r.price ? "#d7ef8514" : "transparent",
        'class="hit" rx="3"',
      );
      s += line(pad, y + rowH - 3, W - pad, y + rowH - 3, "#263125");
      s += rect(
        buy ? mid - gap - width : mid + gap,
        y + 1,
        width,
        rowH - 6,
        color,
        'opacity=".22" rx="2"',
      );
      s += line(
        buy ? mid - gap : mid + gap,
        y + 2,
        buy ? mid - gap : mid + gap,
        y + rowH - 6,
        color,
        'stroke-width="2"',
      );
      s += text(mid, y + 14, fmt(r.price, 1), color, "middle", 12);
      s += text(
        buy ? mid - gap - 7 : mid + gap + 7,
        y + 14,
        fmt(r.size, r.size < 0.001 ? 6 : 3),
        color,
        buy ? "end" : "start",
        11,
      );
      if (r.own > 0)
        s += text(
          buy ? pad : W - pad,
          y + 14,
          "◆",
          C.accent,
          buy ? "start" : "end",
          10,
        );
      if (reveal && r.hidden > 0)
        s += text(
          W - pad,
          y + 14,
          `+${fmt(r.hidden, 1)} 隱藏`,
          C.accent,
          "end",
          10,
          "cn",
        );
      return s + "</g>";
    };
    asks.forEach((r, i) => (out += drawRow(r, i, "sell", start + i * rowH)));
    const spreadY = start + asks.length * rowH;
    out +=
      rect(pad, spreadY, W - 2 * pad, 31, "#d7ef850a", 'rx="3"') +
      text(mid, spreadY + 20, `↔  ${fmt(f.price, 1)}`, C.accent, "middle", 14);
    out += text(pad + 8, spreadY + 20, "LAST", C.muted, "start", 9);
    bids.forEach(
      (r, i) => (out += drawRow(r, i, "buy", spreadY + 37 + i * rowH)),
    );
    out += text(
      W / 2,
      H - 10,
      reveal
        ? "虛線概念：隱藏量只在教學模型可見"
        : "點選價位可帶入限價 · ◆ 你的掛單",
      C.muted,
      "middle",
      11,
      "cn",
    );
  } else if (zoom === 1) {
    const rows = f.profile
      .slice()
      .sort((a, b) => b.volume - a.volume)
      .slice(0, mobile ? 9 : 11)
      .sort((a, b) => b.price - a.price);
    const max = Math.max(1, ...f.profile.map((r) => r.volume)),
      poc = f.profile.find(
        (r) => r.volume === Math.max(...f.profile.map((x) => x.volume)),
      );
    const priceX = 20,
      sellX = W * 0.36,
      buyX = W * 0.53,
      barX = W * 0.59,
      barW = W * 0.34;
    out +=
      text(priceX, 20, "價格箱", C.muted, "start", 11, "cn") +
      text(sellX, 20, "BID", C.sell, "end", 11) +
      text(buyX, 20, "ASK", C.buy, "end", 11) +
      text(barX, 20, "成交量分布", C.muted, "start", 11, "cn");
    if (!rows.length)
      out += text(
        W / 2,
        H / 2,
        "送出一筆成交，留下第一個足跡。",
        C.muted,
        "middle",
        13,
        "cn",
      );
    rows.forEach((r, i) => {
      const y = 39 + i * 26,
        lower = f.profile.find(
          (x) =>
            Math.abs(x.price - (r.price - (f.unit === "ETH" ? 0.5 : 5))) <
            0.00001,
        ),
        imbalance = lower && lower.sell > 0 && r.buy >= lower.sell * 3;
      out += `<g data-price="${r.price}" data-drill="2" role="button" tabindex="0" aria-label="價格箱 ${r.price}，主動賣 ${fmt(r.sell)}，主動買 ${fmt(r.buy)}">`;
      out +=
        rect(
          12,
          y - 1,
          W - 24,
          25,
          r === poc ? "#d7ef850a" : "transparent",
          'class="hit" rx="3"',
        ) + line(15, y + 25, W - 15, y + 25);
      out += text(
        priceX,
        y + 16,
        fmt(r.price, 0),
        r === poc ? C.accent : C.text,
        "start",
        11,
      );
      out +=
        text(sellX, y + 16, fmt(r.sell, 2), C.sell, "end", 11) +
        text((sellX + buyX) / 2, y + 16, "×", C.muted, "middle", 10) +
        text(
          buyX,
          y + 16,
          fmt(r.buy, 2),
          imbalance ? C.accent : C.buy,
          "end",
          11,
        );
      out += rect(
        barX,
        y + 5,
        (r.volume / max) * barW,
        14,
        r === poc ? C.accent : C.buy,
        `opacity="${r === poc ? 0.65 : 0.22}" rx="2"`,
      );
      if (r === poc) out += text(W - 17, y + 16, "POC", C.accent, "end", 9);
      out += "</g>";
    });
    out += text(
      20,
      H - 12,
      "左：主動賣出　×　右：主動買入",
      C.muted,
      "start",
      11,
      "cn",
    );
    if (!mobile)
      out += text(
        W - 20,
        H - 12,
        "亮色 Ask：對角 3:1 失衡",
        C.accent,
        "end",
        11,
        "cn",
      );
  } else {
    const history = f.history.length
      ? f.history
      : [{ price: f.price, volume: 0 }];
    const values = history.map((s) => s.price),
      low = Math.min(...values),
      high = Math.max(...values),
      pad = Math.max((high - low) * 0.18, f.price * 0.00003);
    const min = low - pad,
      max = high + pad,
      left = 19,
      right = W - (mobile ? 67 : 80),
      top = 25,
      height = H - 105;
    const points = series(values, left, top, right - left, height, min, max);
    for (let i = 0; i < 5; i++) {
      const y = top + (i * height) / 4;
      out +=
        line(left, y, right, y, C.grid, 'stroke-dasharray="2 5"') +
        text(
          right + 9,
          y + 4,
          fmt(max - (i * (max - min)) / 4, 1),
          C.muted,
          "start",
          10,
        );
    }
    out +=
      `<g data-drill="1" role="button" tabindex="0" aria-label="放大到成交足跡">` +
      rect(left, top, right - left, height, "transparent", 'class="hit"');
    out += `<path d="${path(points)} L${right},${top + height} L${left},${top + height} Z" fill="#d7ef85" opacity=".055"/><path d="${path(points)}" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linejoin="round"/>`;
    const last = points.at(-1);
    out += `<circle cx="${last[0]}" cy="${last[1]}" r="4" fill="${C.accent}"/><circle cx="${last[0]}" cy="${last[1]}" r="9" fill="none" stroke="${C.accent}" opacity=".25"/>`;
    if (f.vwap != null && f.vwap >= min && f.vwap <= max) {
      const y = top + height - ((f.vwap - min) / (max - min)) * height;
      out +=
        line(
          left,
          y,
          right,
          y,
          "#8ba3d3",
          'stroke-dasharray="5 5" opacity=".7"',
        ) + text(left + 4, y - 7, "VWAP", "#a1b9e9", "start", 10);
    }
    out += "</g>";
    const vols = history.map((s, i) =>
        i ? Math.max(0, s.volume - history[i - 1].volume) : 0,
      ),
      maxV = Math.max(1, ...vols),
      barW = (right - left) / history.length;
    vols.forEach((v, i) => {
      const buy = i === 0 || values[i] >= values[i - 1];
      out += rect(
        left + i * barW,
        H - 42 - (v / maxV) * 32,
        Math.max(1, barW - 2),
        (v / maxV) * 32,
        buy ? C.buy : C.sell,
        'opacity=".4"',
      );
    });
    out +=
      text(left, H - 20, "成交量", C.muted, "start", 10, "cn") +
      text(right, H - 20, "時間 / 事件 →", C.muted, "end", 10, "cn");
    out += text(
      W / 2,
      H - 2,
      "點擊走勢，走進這段成交的內部。",
      C.muted,
      "middle",
      11,
      "cn",
    );
  }
  svg.innerHTML = out;
}
