import { BASE_PRICE, CANDLE_INTERVAL } from "./absorption-model.js";
const colors = {
  buy: "#78e1d5",
  sell: "#e8bd7d",
  muted: "#9cabbc",
  ink: "#edf2f4",
  rule: "#273442",
  red: "#f29a89",
};
export const formatPrice = (value) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
export const formatQty = (value) => value.toFixed(2);
export const formatDelta = (value) =>
  (value >= 0 ? "+" : "") + formatQty(value);
const label = (x, y, value, attrs = "") =>
  '<text x="' +
  x +
  '" y="' +
  y +
  '" ' +
  (attrs.includes("fill=") ? "" : 'fill="' + colors.muted + '" ') +
  (attrs.includes("font-size=") ? "" : 'font-size="11" ') +
  attrs +
  ">" +
  value +
  "</text>";
const line = (x, y, x2, y2, color = colors.rule, attrs = "") =>
  '<line x1="' +
  x +
  '" y1="' +
  y +
  '" x2="' +
  x2 +
  '" y2="' +
  y2 +
  '" stroke="' +
  color +
  '" ' +
  attrs +
  "/>";
const rect = (x, y, w, h, color, attrs = "") =>
  '<rect x="' +
  x +
  '" y="' +
  y +
  '" width="' +
  Math.max(0, w) +
  '" height="' +
  Math.max(0, h) +
  '" fill="' +
  color +
  '" ' +
  attrs +
  "/>";
const path = (d, color, attrs = "") =>
  '<path d="' +
  d +
  '" fill="none" stroke="' +
  color +
  '" stroke-width="1.5" ' +
  attrs +
  "/>";
const money = (x, y, value, color = colors.ink, attrs = "") =>
  label(x, y, value, 'class="num" fill="' + color + '" ' + attrs);
const group = (content, opacity = 1) =>
  '<g opacity="' + opacity + '">' + content + "</g>";

export function drawJourneyChart({
  story,
  state,
  time,
  view = "book",
  mobile = false,
  blend = 1,
  previousView = view,
  chapter,
  reduced = false,
}) {
  const W = mobile ? 390 : 940,
    H = mobile ? 400 : 350;
  const x = mobile ? 24 : 32,
    cw = mobile ? 292 : 324,
    py = mobile ? 28 : 40,
    ph = mobile ? 64 : 100;
  const end = Math.max(18000, time),
    max = chapter < 2 ? 3 : 5.5,
    min = chapter < 2 ? 0 : -0.5;
  const px = (at) => x + (at / end) * cw;
  const priceY = (value) =>
    py + ph - ((value - BASE_PRICE - min) / (max - min)) * ph;
  const cy = mobile ? 147 : 231,
    ch = mobile ? 22 : 66,
    cvdMax = chapter < 2 ? 20 : 35;
  const deltaY = (value) => cy + ch - (value / cvdMax) * ch;
  let result = label(x, py - 14, "K 線 · 3 秒");
  const candleWidth = Math.min(23, ((cw * CANDLE_INTERVAL) / end) * 0.48);
  const volumeBottom = mobile ? 122 : 198,
    volumeHeight = mobile ? 14 : 23;
  for (const offset of [min, (max + min) / 2, max]) {
    const y = priceY(BASE_PRICE + offset);
    result += line(x, y, x + cw, y, "#21303e", 'stroke-dasharray="2 5"');
    result += money(
      x + cw + 7,
      y + 3,
      (BASE_PRICE + offset).toFixed(1),
      colors.muted,
      'font-size="9"',
    );
  }
  result += line(
    x,
    priceY(state.price),
    x + cw,
    priceY(state.price),
    "#82939f",
    'stroke-dasharray="3 5" opacity=".5"',
  );
  result += label(x, mobile ? 102 : 171, "成交量 BTC");
  result += line(x, volumeBottom, x + cw, volumeBottom);
  for (const candle of state.candles) {
    const cx = px(
      candle.start + Math.min(CANDLE_INTERVAL, end - candle.start) / 2,
    );
    const color =
      candle.close > candle.open
        ? colors.buy
        : candle.close < candle.open
          ? colors.red
          : colors.ink;
    const top = Math.min(priceY(candle.open), priceY(candle.close)),
      height = Math.max(
        2,
        Math.abs(priceY(candle.open) - priceY(candle.close)),
      );
    result +=
      '<g data-candle-start="' +
      candle.start +
      '">' +
      line(
        cx,
        priceY(candle.high),
        cx,
        priceY(candle.low),
        color,
        'stroke-width="1.5"',
      );
    result += rect(
      cx - candleWidth / 2,
      top - (height === 2 ? 1 : 0),
      candleWidth,
      height,
      color,
    );
    const vh = (candle.volume / 6) * volumeHeight;
    result +=
      rect(
        cx - candleWidth / 2,
        volumeBottom - vh,
        candleWidth,
        vh,
        color,
        'opacity=".5"',
      ) + "</g>";
  }
  if (view === "vwap" && state.vwap !== null) {
    let qty = 0,
      value = 0,
      d = "";
    for (const trade of state.trades) {
      qty += trade.size;
      value += trade.size * trade.price;
      d += (d ? " L " : "M ") + px(trade.at) + " " + priceY(value / qty);
    }
    result += path(d, colors.sell);
    result += label(
      x + cw - 6,
      py - 14,
      "VWAP " + formatPrice(state.vwap),
      'text-anchor="end" fill="' + colors.sell + '"',
    );
  }
  if (view === "risk") {
    result += line(
      x,
      priceY(state.mark),
      x + cw,
      priceY(state.mark),
      colors.sell,
      'stroke-dasharray="2 3"',
    );
    result += label(
      x + cw - 6,
      py - 14,
      "標記 " + formatPrice(state.mark),
      'text-anchor="end" fill="' + colors.sell + '"',
    );
  }
  result += label(
    x,
    cy - 13,
    view === "oi" ? "未平倉量 OI · BTC" : "累計主動買賣差 · BTC",
  );
  let d = "",
    running = 0;
  if (view === "oi") {
    const y = (value) => cy + ch - ((value - 1198) / 4) * ch;
    for (const frame of story.frames.filter((frame) => frame.at <= time))
      d +=
        (d ? " H " : "M ") +
        px(frame.at) +
        (d ? " V " : " ") +
        y(frame.state.oi);
    d += " H " + px(time);
    result += path(d, colors.sell);
    result += money(
      x + cw + 7,
      y(state.oi) + 3,
      formatQty(state.oi),
      colors.sell,
      'font-size="9"',
    );
  } else {
    d = "M " + px(0) + " " + deltaY(0);
    for (const trade of state.trades) {
      running += trade.side === "buy" ? trade.size : -trade.size;
      d += " H " + px(trade.at) + " V " + deltaY(running);
    }
    d += " H " + px(time);
    result += path(d, colors.buy);
    result += money(
      x + cw + 7,
      deltaY(state.cvd) + 3,
      formatDelta(state.cvd),
      colors.buy,
      'font-size="9"',
    );
  }
  for (const fraction of [0, 0.5, 1])
    result += label(
      px(end * fraction),
      mobile ? 184 : 329,
      ((end * fraction) / 1000).toFixed(0) + "s",
      'text-anchor="middle"',
    );
  const bx = mobile ? 24 : 444,
    bw = mobile ? 342 : 251,
    by = mobile ? 215 : 50;
  const rows = chapter < 2 ? 9 : 14,
    top = chapter < 2 ? 3 : 5.5,
    rowH = mobile ? (chapter < 2 ? 18 : 12) : 19;
  const recent = story.events.filter(
    (event) => event.at <= time && time - event.at < 750,
  );

  function detail(panelView) {
    let out = "";
    if (["funding", "oi", "risk"].includes(panelView)) {
      if (panelView === "oi") {
        out += label(bx, by - 18, "成交之後留下的合約");
        out += label(bx, by + 14, "未平倉量 · 單邊口徑");
        out += money(
          bx,
          by + 45,
          formatQty(state.oi) + " BTC",
          colors.sell,
          'font-size="26"',
        );
        out += line(bx, by + 60, bx + bw, by + 60);
        out += label(bx, by + 82, "本段累計成交");
        out += money(
          bx + bw,
          by + 82,
          formatQty(state.volume) + " BTC",
          colors.buy,
          'text-anchor="end"',
        );
        out += label(bx, by + 108, "同一筆成交，有買方也有賣方。");
        out += label(bx, by + 128, "OI 不代表哪一方的人數更多。");
      }
      if (panelView === "funding") {
        out += label(
          bx,
          by - 18,
          state.settlement ? "本次資金費用已結算" : "接近本次資金費用結算",
        );
        out += label(bx, by + 12, "費率");
        out += money(
          bx + bw,
          by + 12,
          state.rate === null
            ? "等待更新"
            : formatDelta(state.rate * 100) + "%",
          colors.sell,
          'text-anchor="end" font-size="18"',
        );
        out += label(bx, by + 40, "永續 / 指數");
        out += money(
          bx + bw,
          by + 40,
          formatPrice(state.price) + " / " + formatPrice(state.index),
          colors.ink,
          'text-anchor="end"',
        );
        out += label(bx, by + 61, "目前價格溢價");
        out += money(
          bx + bw,
          by + 61,
          ((state.price / state.index - 1) * 100 >= 0 ? "+" : "") +
            ((state.price / state.index - 1) * 100).toFixed(4) +
            "%",
          colors.ink,
          'text-anchor="end"',
        );
        out += line(bx, by + 76, bx + bw, by + 76);
        out += label(bx, by + 98, "結算名義部位 10,000 USDT 的例子");
        out += money(
          bx,
          by + 127,
          state.settlement
            ? "多方  −1  →  空方  +1 USDT"
            : "正費率：多方付款給空方",
          colors.buy,
          'font-size="14"',
        );
        if (!reduced && state.settlement && time - state.settlement.at < 1300) {
          const t = (time - state.settlement.at) / 1300;
          out +=
            '<circle cx="' +
            (bx + 60 + t * (bw - 100)) +
            '" cy="' +
            (by + 147) +
            '" r="4" fill="' +
            colors.buy +
            '"/>';
        }
      }
      if (panelView === "risk") {
        out += label(bx, by - 18, "公開風險資訊");
        out += label(bx, by + 10, "標記價 / 最新成交");
        out += money(
          bx,
          by + 34,
          formatPrice(state.mark) + " / " + formatPrice(state.price),
          colors.sell,
          'font-size="18"',
        );
        out += line(bx, by + 49, bx + bw, by + 49);
        out += label(bx, by + 68, "多單強平回報 · 已計入成交量");
        if (!state.liquidations.length)
          out += label(bx, by + 96, "此時還沒有新的強平回報。");
        state.liquidations.slice(-3).forEach((event, index) => {
          out += money(
            bx,
            by + 95 + index * 25,
            (event.at / 1000).toFixed(2) + "s",
            colors.muted,
          );
          out += money(
            bx + bw,
            by + 95 + index * 25,
            "賣出 " + formatQty(event.size) + " BTC",
            colors.red,
            'text-anchor="end"',
          );
        });
      }
      return out;
    }
    if (panelView === "heatmap") {
      out += label(bx, by - 18, "掛單留下的時間 · 金色賣量／綠色買量");
      const cells = story.frames.filter(
        (frame) => frame.at >= 18000 && frame.at <= time,
      );
      const shown = cells.slice(-28),
        left = bx + 63,
        width = bw - 63;
      for (let r = 0; r < rows; r++) {
        const level = BASE_PRICE + top - r * 0.5,
          y = by + r * rowH;
        out += money(bx, y + 4, (level - BASE_PRICE).toFixed(1), colors.muted);
        shown.forEach((frame, col) => {
          const ask = frame.state.asks.find((row) => row.price === level),
            bid = frame.state.bids.find((row) => row.price === level),
            qty = (ask || bid)?.size || 0;
          out += rect(
            left + (col / 28) * width,
            y - rowH / 2,
            width / 28 - 1,
            rowH - 2,
            ask ? colors.sell : colors.buy,
            'opacity="' + Math.min(0.9, (qty / 10) * 0.9) + '"',
          );
        });
      }
      out += label(
        bx,
        by + rows * rowH + 10,
        "價位 = 68,420 + 左側數字；每欄為掛單更新",
      );
      return out;
    }
    const footprint = ["footprint", "imbalance"].includes(panelView);
    const profile = ["profile", "vwap"].includes(panelView);
    out += label(
      bx,
      by - 18,
      footprint
        ? "整段逐價成交 · 左賣 / 右買"
        : profile
          ? "成交量分布 · 自行情起點"
          : "公開掛單 · 價格 / BTC",
    );
    const maxVolume = Math.max(1, ...state.profile.map((row) => row.volume));
    const poc = state.profile.find((row) => row.volume === maxVolume)?.price;
    for (let i = 0; i < rows; i++) {
      const level = BASE_PRICE + top - i * 0.5,
        y = by + i * rowH;
      const ask = state.asks.find((row) => row.price === level),
        bid = state.bids.find((row) => row.price === level),
        row = ask || bid;
      const volume = state.profile.find((row) => row.price === level);
      if (level === state.price)
        out += rect(
          bx - 5,
          y - rowH / 2 + 1,
          bw + 10,
          rowH - 1,
          "#243441",
          'rx="2"',
        );
      out += money(
        bx,
        y + 4,
        formatPrice(level),
        profile || footprint
          ? colors.muted
          : ask
            ? colors.sell
            : bid
              ? colors.buy
              : "#647384",
      );
      if (footprint) {
        const lower = state.profile.find((row) => row.price === level - 0.5);
        const imbalance =
          panelView === "imbalance" &&
          lower?.sell > 0 &&
          (volume?.buy || 0) >= lower.sell * 3;
        if (imbalance)
          out += rect(
            bx + bw - 60,
            y - rowH / 2,
            65,
            rowH,
            colors.buy,
            'opacity=".18"',
          );
        out += money(
          bx + bw - 95,
          y + 4,
          formatQty(volume?.sell || 0),
          colors.sell,
          'text-anchor="end"',
        );
        out += money(
          bx + bw,
          y + 4,
          formatQty(volume?.buy || 0) + (imbalance ? " ◀" : ""),
          colors.buy,
          'text-anchor="end"',
        );
      } else if (profile) {
        const color = level === poc ? colors.sell : colors.buy;
        out += rect(
          bx + 91,
          y - rowH / 2 + 2,
          ((volume?.volume || 0) / maxVolume) * (bw - 146),
          rowH - 3,
          color,
          'opacity=".5"',
        );
        out += money(
          bx + bw,
          y + 4,
          formatQty(volume?.volume || 0),
          color,
          'text-anchor="end"',
        );
      } else {
        const color = ask ? colors.sell : colors.buy;
        if (row)
          out += rect(
            bx + 91,
            y - rowH / 2 + 2,
            (row.size / 12) * (bw - 91),
            rowH - 3,
            color,
            'opacity=".25"',
          );
        out += money(
          bx + bw,
          y + 4,
          row ? formatQty(row.size) : "—",
          row ? colors.ink : "#647384",
          'text-anchor="end"',
        );
        const last = recent.filter((event) => event.price === level).at(-1);
        if (last)
          out += line(
            bx - 6,
            y - rowH / 2 + 2,
            bx - 6,
            y + rowH / 2,
            last.kind === "trade" ? colors.buy : colors.sell,
            'stroke-width="3" opacity="' + (1 - (time - last.at) / 750) + '"',
          );
      }
    }
    if (profile && poc)
      out += label(
        bx,
        by + rows * rowH + 10,
        "POC " + formatPrice(poc) + " · " + formatQty(maxVolume) + " BTC",
      );
    if (panelView === "imbalance")
      out += label(
        bx,
        by + rows * rowH + 10,
        "◀ 買量 ≥ 下一檔賣量 × 3；兩側均須有量",
      );
    return out;
  }
  if (previousView !== view && blend < 1)
    result +=
      group(detail(previousView), 1 - blend) + group(detail(view), blend);
  else result += detail(view);
  if (!mobile) {
    result += line(414, 20, 414, 332) + line(725, 20, 725, 332);
    result += label(754, 32, "逐筆成交");
    const tape = [];
    for (const trade of state.trades) {
      const previous = tape.at(-1);
      if (
        previous &&
        previous.at === trade.at &&
        previous.price === trade.price &&
        previous.side === trade.side
      )
        previous.size += trade.size;
      else tape.push({ ...trade });
    }
    tape
      .slice(-10)
      .reverse()
      .forEach((trade, index) => {
        const y = 64 + index * 26,
          color = trade.side === "buy" ? colors.buy : colors.sell;
        const age = (time - trade.at) / 700;
        if (age < 1 && !reduced)
          result += rect(
            738,
            y - 14,
            187,
            23,
            color,
            'opacity="' + 0.14 * (1 - age) + '"',
          );
        result += money(746, y, trade.side === "buy" ? "買" : "賣", color);
        result += money(768, y, formatPrice(trade.price), color);
        result += money(
          914,
          y,
          formatQty(trade.size),
          color,
          'text-anchor="end"',
        );
      });
  }
  let camera = 0;
  if (chapter === 1 && !mobile && !reduced) {
    const boundaries = [0, 5200, 10000, 14000, 18000];
    const positions = [0, 1, 0, 0.7, 0];
    const step = boundaries.findIndex((end) => end >= time);
    if (step > 0) {
      const eased =
        1 - Math.pow(1 - Math.min(1, (time - boundaries[step - 1]) / 1280), 3);
      camera =
        positions[step - 1] + (positions[step] - positions[step - 1]) * eased;
    }
  }
  return {
    svg: result,
    viewBox: [20 * camera, 8 * camera, W - 20 * camera, H - 5 * camera].join(
      " ",
    ),
  };
}
