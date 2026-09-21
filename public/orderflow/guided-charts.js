const n = (value) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
const signed = (value) => `${value > 0 ? "+" : ""}${n(value)}`;
const text = (x, y, value, cls = "g-label", anchor = "start") =>
  `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${value}</text>`;
const box = (x, y, w, h, cls = "g-panel") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" class="${cls}"/>`;
export const priceY = (price) => 42 + (106 - price) * 25;
const detailY = (price) => 85 + (103 - price) * 54;

function priceReference(s, scale, detail = 0, rightOpacity = 1) {
  // The left-hand price frame survives every price-based view. Only the
  // reference lines behind non-price summaries recede, without losing the
  // candle's position or its current-price guide.
  return (
    Array.from({ length: 11 }, (_, i) => 106 - i)
      .map(
        (p) =>
          `<g class="f-price-row" data-price="${p}" opacity="${p >= 100 && p <= 103 ? 1 : 1 - detail}"><line x1="58" x2="220" y1="${scale(p)}" y2="${scale(p)}"/><line x1="220" x2="610" y1="${scale(p)}" y2="${scale(p)}" opacity="${rightOpacity}"/>${text(43, scale(p) + 6, p, "g-axis", "end")}</g>`,
      )
      .join("") +
    `<g class="g-current-reference"><line class="f-last-price-line" x1="58" x2="220" y1="${scale(s.price)}" y2="${scale(s.price)}"/><line class="f-last-price-line" x1="220" x2="610" y1="${scale(s.price)}" y2="${scale(s.price)}" opacity="${rightOpacity}"/></g>`
  );
}
function candle(s, scale = priceY) {
  const { open, high, low, close } = s.candle;
  return high === low
    ? `<line class="f-candle-flat" x1="103" x2="145" y1="${scale(open)}" y2="${scale(open)}"/>${text(124, scale(open) + 35, `行情 ${close}`, "g-small", "middle")}`
    : `<g class="f-candle-shape ${close < open ? "f-candle-down" : ""}"><line x1="124" x2="124" y1="${scale(high)}" y2="${scale(low)}"/><rect x="111" y="${Math.min(scale(open), scale(close))}" width="26" height="${Math.max(2, Math.abs(scale(close) - scale(open)))}" rx="1"/></g>${text(124, 337, `100 → ${close}`, "g-small", "middle")}`;
}
function book(s, reveal, scale = priceY) {
  const rows = [
    ...s.asks.map((r) => ({ ...r, side: "賣" })),
    ...s.bids.map((r) => ({ ...r, side: "買" })),
  ];
  const max = Math.max(12, ...rows.map((r) => r.size));
  return (
    rows
      .map(
        (r) =>
          `<g class="g-order" transform="translate(345 ${scale(r.price) - 11})"><rect width="260" height="22" rx="5" class="g-order-bg"/><rect width="${Math.max(5, (r.size / max) * 260)}" height="22" rx="5" class="g-depth"/>${text(12, 17, `${r.side}方 · ${r.price}`, "g-order-label")}${text(247, 17, n(r.size), "g-order-label", "end")}</g>`,
      )
      .join("") +
    (reveal === "compact"
      ? ""
      : text(473, 337, "等待中的掛量 · 單位", "g-small", "middle"))
  );
}
function tally(s, reveal) {
  const max = Math.max(1, s.stats.buy, s.stats.sell);
  let out = text(264, 60, "已經發生的成交", "g-heading");
  out +=
    text(264, 112, "主動買", "g-buy") +
    box(352, 90, Math.max(2, (s.stats.buy / max) * 182), 30, "g-buy-bar") +
    text(595, 114, n(s.stats.buy), "g-value", "end");
  out +=
    text(264, 178, "主動賣", "g-sell") +
    box(352, 156, Math.max(2, (s.stats.sell / max) * 182), 30, "g-sell-bar") +
    text(595, 180, n(s.stats.sell), "g-value", "end");
  if (reveal === "volume" || reveal === "sides")
    out += text(264, 250, `成交量 ${n(s.stats.volume)} 單位`, "g-heading");
  if (reveal === "delta")
    out +=
      text(
        264,
        246,
        `${n(s.stats.buy)} − ${n(s.stats.sell)} = ${signed(s.delta)}`,
        "g-equation",
      ) + text(264, 285, "本段 Delta", "g-small");
  if (reveal === "cvd")
    out +=
      text(264, 246, `CVD ${signed(s.stats.cvd)}`, "g-equation") +
      text(
        264,
        285,
        s.intervals.length
          ? `${s.intervals.map(signed).join(" + ")}，本段 ${signed(s.delta)}`
          : "主動買量 − 主動賣量",
        "g-small",
      );
  if (reveal === "liquidation")
    out +=
      text(
        264,
        245,
        `成交量 ${s.stats.volume} · CVD ${signed(s.stats.cvd)}`,
        "g-label",
      ) + text(264, 286, `剩餘 OI ${s.oi}`, "g-heading");
  return out;
}
function footprint(s, reveal, scale = detailY) {
  let comparison = null;
  const rowHeight = Math.min(38, Math.abs(scale(101) - scale(102)) - 3);
  let out =
    text(280, 70, "主動賣", "g-sell") + text(470, 70, "主動買", "g-buy");
  for (const row of s.profile) {
    const lower = s.profile.find((r) => r.price === row.price - 1);
    const imbalance =
      reveal === "imbalance" && lower?.sell > 0 && row.buy >= lower.sell * 3;
    if (imbalance) comparison = { row, lower, ratio: row.buy / lower.sell };
    out += box(
      266,
      scale(row.price) - rowHeight / 2,
      315,
      rowHeight,
      "g-foot-row",
    );
    out +=
      text(318, scale(row.price) + 7, row.sell, "g-sell", "middle") +
      text(408, scale(row.price) + 7, "×", "g-small", "middle") +
      text(
        500,
        scale(row.price) + 7,
        row.buy,
        imbalance ? "g-gold" : "g-buy",
        "middle",
      );
    if (imbalance)
      out += `<path class="g-diagonal" d="M 480 ${scale(row.price) + 10} L 337 ${scale(lower.price) - 9}"/>`;
  }
  out += text(
    265,
    275,
    comparison
      ? `${comparison.row.price} 的買 ${n(comparison.row.buy)} ↔ ${comparison.lower.price} 的賣 ${n(comparison.lower.sell)}`
      : "每一列，都是這個價位的成交",
    "g-small",
  );
  if (comparison)
    out += text(
      265,
      313,
      `${n(comparison.row.buy)} ÷ ${n(comparison.lower.sell)} = ${n(comparison.ratio)} 倍`,
      "g-equation",
    );
  return out;
}
function profile(s, reveal, scale = detailY) {
  const max = Math.max(1, ...s.profile.map((r) => r.volume));
  return (
    text(263, 71, "把同價位的買賣量相加", "g-heading") +
    s.profile
      .map(
        (r) =>
          `<rect x="263" y="${scale(r.price) - 10}" width="${(r.volume / max) * 255}" height="20" rx="4" class="${reveal === "poc" && r.volume === max ? "g-gold-bar" : "g-buy-bar"}"/>${text(580, scale(r.price) + 7, r.volume, "g-label", "end")}`,
      )
      .join("") +
    text(
      263,
      272,
      reveal === "poc"
        ? `POC ${s.profile.find((r) => r.volume === max)?.price} · 成交最多的價位`
        : "橫條長度 = 這個價位的總成交量",
      "g-small",
    )
  );
}
function average(s, reveal, scale = priceY) {
  const rows = [...s.profile].reverse();
  const numerator = rows
    .map((r) => `${n(r.price)} × ${n(r.volume)}`)
    .join(" + ");
  const denominator = rows.map((r) => n(r.volume)).join(" + ");
  return (
    `<line class="g-average-line" x1="75" x2="608" y1="${scale(s.stats.vwap)}" y2="${scale(s.stats.vwap)}"/>` +
    text(
      266,
      64,
      reveal === "vwap" ? "VWAP · 量加權平均價" : "每 1 單位，都有一票",
      "g-heading",
    ) +
    text(272, 199, numerator, "g-equation") +
    `<line class="g-rule" x1="272" x2="590" y1="215" y2="215"/>` +
    text(426, 248, denominator, "g-equation", "middle") +
    text(426, 303, `= ${n(s.stats.vwap)}`, "g-number", "middle")
  );
}
function reserve(s) {
  const row = s.asks.find((r) => r.price === 101);
  const remaining = (row?.size || 0) + (row?.hidden || 0);
  return (
    text(263, 60, "101 的賣單 · 教學內部視角", "g-heading") +
    box(263, 95, 340, 70) +
    text(282, 126, "外面看見", "g-small") +
    text(575, 143, row?.size || 0, "g-number", "end") +
    box(263, 180, 340, 70, "g-hidden-panel") +
    text(282, 211, "保留、尚未顯示", "g-small") +
    text(575, 228, row?.hidden || 0, "g-number", "end") +
    text(
      263,
      306,
      `原有 ${remaining + s.stats.volume} − 已成交 ${s.stats.volume} = 剩餘 ${remaining}`,
      "g-small",
    )
  );
}
function pace(s) {
  return (
    text(255, 60, "一樣長的觀察時窗", "g-heading") +
    s.windows
      .map((value, i) => {
        const x = 281 + i * 110,
          h = value * 42;
        return `<rect class="g-buy-bar" x="${x}" y="${261 - h}" width="57" height="${Math.max(2, h)}" rx="6"/>${text(x + 29, 244 - h, value, "g-value", "middle")}${text(x + 29, 298, `第 ${i + 1} 段`, "g-small", "middle")}`;
      })
      .join("")
  );
}
function absorption(s, reveal, scale = priceY, progress = 1) {
  let cvd = 0;
  const points = [{ x: 274, y: 322, value: 0 }];
  s.trades.forEach((trade, index) => {
    cvd += trade.side === "buy" ? trade.size : -trade.size;
    points.push({ x: 274 + (index + 1) * 75, y: 322 - cvd * 5.5, value: cvd });
  });
  const resting = s.asks.find((row) => row.price === 101)?.size || 0;
  let out =
    book(s, "compact", scale) +
    text(
      263,
      54,
      resting ? `101 還有 ${n(resting)} 單位願意賣` : "101 的賣單已經用完",
      "g-heading",
    ) +
    text(
      263,
      86,
      s.price > 101 ? "剩餘買量，開始找更高的賣方" : "每次成交，供給就少一份",
      "g-small",
    ) +
    text(263, 256, "CVD · 累計主動買 − 主動賣", "g-small") +
    text(602, 257, signed(s.stats.cvd), "g-flow-total", "end") +
    '<path d="M 274 270 V 322 H 600" class="g-flow-axis"/>';
  points.slice(1).forEach((point, i) => {
    const previous = points[i];
    const t = i === points.length - 2 ? progress : 1;
    const x = previous.x + (point.x - previous.x) * t;
    const y = previous.y + (point.y - previous.y) * t;
    out += `<path d="M ${previous.x} ${previous.y} L ${x} ${y}" class="g-flow-line"/><circle cx="${x}" cy="${y}" r="4" class="g-buy-bar"/>`;
    out += text(point.x, 345, signed(point.value), "g-small", "middle");
  });
  return out + text(274, 345, "起點", "g-small", "middle");
}

function liquidation(s, reveal, scale = priceY) {
  const states = {
    waiting: "尚未觸發",
    triggered: "觸發・待賣出",
    liquidating: "正在強制賣出",
    closed: "已完成平倉",
  };
  let out =
    text(255, 36, `風控用的標記價 ${s.markPrice}`, "g-heading") +
    text(255, 61, "保證金不足，平台會代為平倉", "g-small");
  s.positions.forEach((position, index) => {
    const x = 252 + index * 181;
    out +=
      `<g class="g-position g-position-${position.status}" data-position="${position.id}">${box(x, 78, 169, 98, "g-position-card")}` +
      text(
        x + 12,
        101,
        `${position.id} · 多單 ${position.size} 單位`,
        "g-label",
      ) +
      text(x + 12, 128, `清算門檻 ${position.threshold}`, "g-small") +
      text(x + 12, 157, states[position.status], "g-position-state") +
      "</g>";
  });
  out +=
    book({ ...s, asks: [] }, "compact", scale) +
    text(602, 196, "等待承接賣出的 Maker 買單", "g-small", "end");
  const phase = s.positions[1]?.status !== "waiting" ? 2 : s.stats.sell ? 1 : 0;
  out += `<g class="g-cascade"><text x="252" y="330" class="${phase >= 0 ? "g-sell" : "g-small"}">強制賣出</text>${text(351, 330, "→ 吃掉買單 → 價格下降", phase >= 1 ? "g-sell" : "g-small")}${text(252, 358, "標記價再下移 → 下一筆多單觸發", phase >= 2 ? "g-gold" : "g-small")}</g>`;
  return out;
}
function heatmap(s, reveal, scale = priceY) {
  const max = Math.max(
    1,
    ...s.tape.flatMap((frame) =>
      [...frame.asks, ...frame.bids].map((r) => r.size),
    ),
  );
  const width = 330 / Math.max(5, s.tape.length);
  let out = text(255, 60, "時間向右 →", "g-heading");
  s.tape.forEach((frame, i) => {
    out += [...frame.asks, ...frame.bids]
      .map(
        (r) =>
          `<rect class="g-heat-cell" x="${255 + i * width}" y="${scale(r.price) - 10}" width="${width - 3}" height="20" opacity="${0.1 + (0.9 * r.size) / max}"/>`,
      )
      .join("");
    out += text(255 + i * width + width / 2, 315, i + 1, "g-small", "middle");
  });
  out += text(
    255,
    354,
    reveal === "evidence"
      ? `逐筆成交：${s.stats.volume} 單位`
      : "暗 → 亮：可見掛量 少 → 多",
    "g-small",
  );
  return out;
}
function contracts(s, reveal) {
  let out = text(320, 50, "一對多空 = 1 單位合約", "g-heading", "middle");
  for (let i = 0; i < Math.max(1, s.oi); i++) {
    const py = 85 + i * 74;
    out += `<g opacity="${s.oi ? 1 : 0.35}">${box(88, py, 155, 52, "g-long-panel")}${text(165, py + 34, reveal === "transfer" && i === 0 ? "新多方接手" : "多方", "g-buy", "middle")}<path class="g-link" d="M 248 ${py + 26} H 385"/>${box(391, py, 155, 52, "g-short-panel")}${text(469, py + 34, "空方", "g-sell", "middle")}</g>`;
  }
  out += text(
    320,
    278,
    reveal === "intro" ? "還沒有建立合約" : `未平倉 OI ${s.oi}`,
    "g-number",
    "middle",
  );
  if (reveal !== "intro")
    out += text(
      320,
      327,
      `累計成交量 ${s.stats.volume} · ${reveal === "transfer" ? "換人，沒有增加合約" : reveal === "close" ? "雙方平倉，合約結束" : "雙方新開"}`,
      "g-small",
      "middle",
    );
  return out;
}
function funding(s, reveal) {
  const negative = s.rate < 0;
  let out = text(
    320,
    50,
    reveal === "intro"
      ? "永續合約 · 沒有固定到期日"
      : `資金費率 ${signed(s.rate * 100)}%`,
    "g-heading",
    "middle",
  );
  out +=
    box(64, 115, 155, 90, "g-long-panel") +
    text(142, 167, "多方", "g-buy", "middle") +
    box(422, 115, 155, 90, "g-short-panel") +
    text(499, 167, "空方", "g-sell", "middle");
  if (reveal !== "intro")
    out +=
      text(320, 169, negative ? "← 付款" : "付款 →", "g-gold", "middle") +
      text(
        320,
        261,
        s.payment === null
          ? "名義部位 10,000 USDT"
          : `已結算 ${n(Math.abs(s.payment))} USDT`,
        "g-number",
        "middle",
      ) +
      text(
        320,
        312,
        s.payment === null ? "等待本次結算" : "付款方向依費率正負改變",
        "g-small",
        "middle",
      );
  else
    out += text(320, 270, "持倉之間，按規則交換資金費用", "g-small", "middle");
  return out;
}
function basis(s) {
  return (
    text(320, 50, "比較的是價格，不是付款", "g-heading", "middle") +
    box(63, 100, 235, 132) +
    box(340, 100, 235, 132) +
    text(180, 140, "參考指數", "g-small", "middle") +
    text(457, 140, "永續價格", "g-small", "middle") +
    text(180, 202, s.premium.reference, "g-number", "middle") +
    text(457, 202, s.premium.contract, "g-number", "middle") +
    text(320, 298, `價格溢價 +${n(s.premium.percent)}%`, "g-equation", "middle")
  );
}
function comparison(s) {
  const rows = [...s.comparisons];
  if (rows.length < 2 && s.lastExecution)
    rows.push({ ...s.lastExecution, label: "薄盤" });
  return (
    text(255, 50, `同樣買 ${rows[0].size}，掛量不同`, "g-heading") +
    rows
      .map((row, i) => {
        const x = 244 + i * 184;
        return (
          box(x, 88, 166, 223) +
          text(x + 83, 126, row.label, "g-small", "middle") +
          text(x + 83, 187, n(row.avg), "g-number", "middle") +
          text(x + 83, 223, "成交均價", "g-small", "middle") +
          text(
            x + 83,
            272,
            `滑價 +${n(row.avg - row.fills[0].price)}`,
            "g-gold",
            "middle",
          )
        );
      })
      .join("")
  );
}
function evidence(s, reveal) {
  return (
    text(258, 60, "只看已揭露的證據", "g-heading") +
    text(258, 125, `最新成交 ${s.price}`, "g-equation") +
    text(258, 195, `CVD ${signed(s.stats.cvd)}`, "g-equation") +
    (reveal === "flow"
      ? text(258, 268, "下一步，再加入 OI", "g-small")
      : text(258, 265, `OI ${s.oi}（起始 10）`, "g-equation")) +
    text(
      258,
      323,
      reveal === "review"
        ? "對照你的事前紀錄，再回顧"
        : "觀察 ≠ 保證接下來的方向",
      "g-small",
    )
  );
}

const views = {
  book,
  tally,
  footprint,
  profile,
  average,
  reserve,
  pace,
  absorption,
  liquidation,
  heatmap,
  contracts,
  funding,
  basis,
  comparison,
  evidence,
};
const isPriceScene = (view) =>
  !["contracts", "funding", "basis"].includes(view);
const isDetailView = (view) => ["footprint", "profile"].includes(view);
const rightReference = (view) =>
  ["book", "footprint", "profile", "average", "heatmap"].includes(view) ? 1 : 0;
const scaleAt = (detail) => (price) =>
  priceY(price) + (detailY(price) - priceY(price)) * detail;
const zoomLabel = (detail) =>
  `${(1 + detail * (54 / 25 - 1)).toFixed(1).replace(".0", "")}×`;

function foreground(s, content, scale) {
  let markup = (views[content.view] || book)(
    s,
    content.reveal,
    scale,
    content.flowProgress ?? 1,
  );
  if (content.reveal === "risk")
    markup += text(262, 355, "標記價 98 · 風險觸發 ≠ 已成交", "g-sell");
  return markup;
}

export function drawGuidedScene(root, s, content) {
  const $ = (id) => root.querySelector(`#${id}`);
  const view = content.view;
  const priceScene = isPriceScene(view);
  const detail = Number(isDetailView(view));
  const scale = scaleAt(detail);
  $("f-zoom-badge").textContent = zoomLabel(detail);
  $("f-book-world").innerHTML =
    (priceScene ? priceReference(s, scale, detail, rightReference(view)) : "") +
    foreground(s, content, scale);
  $("f-candle").innerHTML = priceScene ? candle(s, scale) : "";
  $("f-candle").setAttribute("aria-hidden", String(!priceScene));
  $("f-candle").setAttribute(
    "aria-label",
    `本段 K 線：開 ${s.candle.open}、高 ${s.candle.high}、低 ${s.candle.low}、收 ${s.candle.close}`,
  );
  $("f-book-desc").textContent =
    `${content.title} ${content.copy} 最新成交 ${s.price}，本課成交量 ${s.stats.volume}，主動買 ${s.stats.buy}，主動賣 ${s.stats.sell}。`;
  $("f-traveler").innerHTML = "";
  const bookView = ["book", "reserve", "absorption", "liquidation"].includes(
    view,
  );
  const flowView = view === "tally" || view === "footprint";
  root.querySelector(".f-book-key").innerHTML =
    `<span><i class="f-candle-key"></i>K 線</span><span><i class="${flowView ? "f-taker-key" : "f-maker-key"}"></i>${bookView ? "Maker：掛單等待" : view === "heatmap" ? "可見掛量" : flowView ? "主動買量" : "本課已揭露紀錄"}</span><span id="f-taker-key" ${bookView || flowView ? "" : "hidden"}><i class="${flowView ? "g-sell-key" : "f-taker-key"}"></i>${flowView ? "主動賣量" : "Taker：主動成交"}</span>`;
  root.querySelector(".f-book-key").style.visibility = priceScene
    ? "visible"
    : "hidden";
}

export function prepareGuidedViewTransition(root, s, from, to) {
  if (
    (from.view === to.view && from.reveal === to.reveal) ||
    !isPriceScene(from.view) ||
    !isPriceScene(to.view)
  )
    return null;
  const fromDetail = Number(isDetailView(from.view));
  const toDetail = Number(isDetailView(to.view));
  const fromReference = rightReference(from.view);
  const toReference = rightReference(to.view);
  const world = root.querySelector("#f-book-world");
  world.innerHTML = `<g data-scene-layer="reference"></g><g data-scene-layer="outgoing" aria-hidden="true"></g><g data-scene-layer="incoming" aria-hidden="true" opacity="0"></g>`;
  const reference = world.querySelector('[data-scene-layer="reference"]');
  const outgoing = world.querySelector('[data-scene-layer="outgoing"]');
  const incoming = world.querySelector('[data-scene-layer="incoming"]');
  const candleLayer = root.querySelector("#f-candle");
  root.querySelector("#f-traveler").innerHTML = "";
  const ramp = (value) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  return {
    zooming: fromDetail !== toDetail,
    duration: fromDetail !== toDetail ? 1450 : 1100,
    frame(t) {
      // One interpolated price scale drives the axis, candle, resting orders
      // and footprint rows. OHLC and trade data stay unchanged during the move.
      const progress = ramp(t);
      const detail = fromDetail + (toDetail - fromDetail) * progress;
      const scale = scaleAt(detail);
      root.querySelector("#f-zoom-badge").textContent = zoomLabel(detail);
      reference.innerHTML = priceReference(
        s,
        scale,
        detail,
        fromReference + (toReference - fromReference) * progress,
      );
      outgoing.innerHTML = foreground(s, from, scale);
      incoming.innerHTML = foreground(s, to, scale);
      outgoing.setAttribute("opacity", String(1 - ramp(t / 0.58)));
      incoming.setAttribute("opacity", String(ramp((t - 0.22) / 0.78)));
      candleLayer.innerHTML = candle(s, scale);
    },
  };
}

export function drawGuidedTransition(root, snapshot, content, t) {
  const progress = t * t * (3 - 2 * t);
  if (
    content.view === "funding" &&
    content.ops.some((op) => op.type === "settle")
  ) {
    const x = snapshot.rate < 0 ? 499 - 357 * progress : 142 + 357 * progress;
    root.querySelector("#f-traveler").innerHTML =
      `<g transform="translate(${x - 47} 72)">${box(0, 0, 94, 33, "g-gold-bar")}${text(47, 23, `${n(Math.abs(snapshot.nominal * snapshot.rate))} USDT`, "g-payment", "middle")}</g>`;
  } else if (
    content.view === "contracts" &&
    content.ops.some((op) => op.type === "trade")
  ) {
    const op = content.ops.find((op) => op.type === "trade");
    const label =
      op.disposition === "open"
        ? `建立 ${op.size} 對合約`
        : op.disposition === "close"
          ? `雙方結束 ${op.size} 對`
          : "舊持有人 → 新持有人";
    root.querySelector("#f-traveler").innerHTML =
      `<circle cx="${250 + 132 * progress}" cy="111" r="7" class="g-gold-bar"/>${text(320, 232, label, "g-gold", "middle")}`;
  }
}

export function drawGuidedTraveler(root, fill, previousPrice, t) {
  const vertical = Math.min(1, t / 0.65),
    horizontal = Math.max(0, (t - 0.65) / 0.35);
  const ease = (value) => value * value * (3 - 2 * value);
  const x = 155 + 190 * ease(horizontal),
    py =
      priceY(previousPrice) +
      (priceY(fill.price) - priceY(previousPrice)) * ease(vertical);
  root.querySelector("#f-traveler").innerHTML =
    `<g class="g-traveler ${fill.side === "sell" ? "g-traveler-sell" : ""}" transform="translate(${x} ${py - 18})"><rect width="180" height="36" rx="18"/>${text(90, 25, `${fill.liquidationId ? `${fill.liquidationId} 強制賣` : `主動${fill.side === "buy" ? "買" : "賣"}`} ${n(fill.size)} 單位`, "g-label", "middle")}</g>`;
}
