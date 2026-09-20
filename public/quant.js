"use strict";
const $ = (id) => document.getElementById(id);
const money = (v, decimals = 2) =>
  Number.isFinite(v)
    ? v.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : "—";
const signed = (v, suffix = "") =>
  Number.isFinite(v) ? `${v > 0 ? "+" : ""}${money(v)}${suffix}` : "—";
const short = (v) =>
  !Number.isFinite(v)
    ? "—"
    : Math.abs(v) >= 1e6
      ? `${(v / 1e6).toFixed(2)}M`
      : Math.abs(v) >= 1e3
        ? `${(v / 1e3).toFixed(1)}K`
        : money(v, 1);
const utc = (v, date = false) =>
  v
    ? new Date(v)
        .toISOString()
        .slice(date ? 5 : 11, date ? 19 : 19)
        .replace("T", " ")
    : "—";
const actionNames = { long: "做多", short: "做空", wait: "觀望", hold: "持有" };
const colors = {
  teal: "#78e1d5",
  red: "#e58491",
  gold: "#e8bd7d",
  grid: "#1c2a38",
  muted: "#8199ad",
};
let mode = "live",
  symbol = "BTCUSDT",
  barCount = 180,
  ledgerKind = "decisions";
let data = null,
  activeRequest = null,
  detailRequest = null,
  chart = null,
  mouseIndex = null;
function text(id, value) {
  $(id).textContent = value;
}
function tone(el, value) {
  el.classList.toggle("positive", value > 0);
  el.classList.toggle("negative", value < 0);
}
function node(tag, value, cls) {
  const el = document.createElement(tag);
  if (value !== undefined) el.textContent = value;
  if (cls) el.className = cls;
  return el;
}
function cell(value, cls) {
  return node("td", value, cls);
}
function api(path, extra = {}) {
  return `/api/quant/${path}?${new URLSearchParams({ mode, symbol, ...extra })}`;
}
async function refresh(force = false) {
  if (activeRequest && !force) return;
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(api("summary"), { signal: controller.signal });
    if (!response.ok) throw Error(`HTTP ${response.status}`);
    const next = await response.json();
    if (controller !== activeRequest) return;
    data = next;
    render();
  } catch (e) {
    if (controller !== activeRequest) return;
    text(
      "notice",
      "研究服務暫時無法讀取。保留上次資料；目前顯示不代表最新狀態。",
    );
    $("notice").className = "notice error";
    text("connection-text", "連線中斷");
    $("connection-dot").className = "dot red";
  } finally {
    clearTimeout(timeout);
    if (controller === activeRequest) activeRequest = null;
  }
}
function render() {
  if (!data) return;
  document
    .querySelectorAll(
      ".stats,.heatmap-panel,.workspace,.positions-panel,.ledger-panel",
    )
    .forEach((el) => (el.hidden = false));
  const s = data.state,
    f = data.frame,
    x = f?.features,
    isDemo = mode === "demo";
  const age = f ? Math.max(0, data.time - f.time) : Infinity;
  const stale = !isDemo && age > 30000;
  const good = f?.healthy && !stale && !data.error;
  text(
    "connection-text",
    isDemo
      ? "合成示例 · 固定回放"
      : good
        ? x?.ready
          ? "Bybit 行情連線正常"
          : "行情連線正常 · 累積訊號"
        : "行情等待中",
  );
  $("connection-dot").className = `dot${isDemo || !good ? " amber" : ""}`;
  $("notice").className =
    `notice${isDemo ? " demo" : data.error || stale ? " error" : ""}`;
  const problems = data.error
    ? [data.error]
    : stale
      ? ["最新快照已過期，等待服務恢復"]
      : (x?.issues ?? ["等待第一份行情快照"]);
  text(
    "notice",
    isDemo
      ? "示例回放｜合成價格與訂單流，只用來展示策略流程與介面；這裡的績效不是真實行情測試結果。"
      : problems.length
        ? `即時資料｜${problems.join(" · ")}。Jev 尚未接入，所有交易由規則策略在本站模擬。`
        : "即時資料｜Bybit 公開主網行情 · 每約 10 秒保存快照、每 5 分鐘判斷 · 本站模擬成交 · Jev 尚未接入",
  );
  text("equity", money(data.equity));
  const ret = (data.equity / data.config.initialBalance - 1) * 100;
  text("return", signed(ret, "%"));
  tone($("return"), ret);
  text("net-profit", signed(s.netProfit));
  tone($("net-profit"), s.netProfit);
  text("drawdown", `${money(s.maxDrawdownPct)}%`);
  const exposure = s.positions.reduce((n, p) => n + p.qty * p.lastMark, 0);
  text("exposure", `目前總曝險 ${money((exposure / data.equity) * 100, 1)}%`);
  text("completed", s.completed);
  text(
    "win-rate",
    s.completed ? `${money((s.wins / s.completed) * 100, 1)}%` : "—",
  );
  text("fees", `累計手續費 ${money(s.totalFees)} USDT`);
  text("market-title", `${symbol.slice(0, -4)} / USDT`);
  text("market-price", f?.mark > 0 ? money(f.mark) : "—");
  text("market-change", isDemo ? "SYNTHETIC DATA" : "BYBIT · MARK PRICE");
  text("book-age", f?.bookTime ? `深度 ${utc(f.bookTime)} UTC` : "深度時間 —");
  text("spread", `${money(x?.spreadBps)} bps`);
  text(
    "oi-value",
    f?.oi != null ? `${short(f.oi)} ${symbol.slice(0, -4)}` : "—",
  );
  text("oi-change", x?.oiChangePct != null ? signed(x.oiChangePct, "%") : "—");
  text(
    "funding-rate",
    f?.fundingRate != null ? `${money(f.fundingRate * 100, 4)}%` : "—",
  );
  text("funding-next", f?.nextFundingTime ? utc(f.nextFundingTime) : "—");
  const sum = (levels) =>
    (levels ?? []).slice(0, 50).reduce((n, [p, q]) => n + p * q, 0);
  text("bid-notional", f?.bids.length ? short(sum(f.bids)) : "—");
  text("ask-notional", f?.asks.length ? short(sum(f.asks)) : "—");
  text(
    "imbalance",
    x?.imbalance != null ? signed(x.imbalance * 100, "%") : "—",
  );
  tone($("imbalance"), x?.imbalance ?? 0);
  renderSignal();
  renderDepthRows();
  renderPositions();
  renderLedger();
  liquidityHeatmap.update(mode, symbol, data.frame?.time ?? null);
  drawCharts();
  text(
    "risk-status",
    s.haltedDay === s.day
      ? "已觸發單日虧損限制，停止新倉"
      : s.paused
        ? "新倉已暫停"
        : "固定風控啟用",
  );
  text(
    "last-update",
    f ? `${isDemo ? "示例時間" : "快照"} ${utc(f.time)} UTC` : "等待快照",
  );
}
function renderSignal() {
  const d = data.decisions.find((d) => d.symbol === symbol);
  text("signal-status", data.frame?.features.ready ? "資料完整" : "等待資料");
  $("signal-status").className =
    `status-tag ${data.frame?.features.ready ? "positive" : "amber-text"}`;
  text("signal-action", d ? actionNames[d.action] : "觀望");
  $("signal-action").className =
    `signal-action ${d?.action === "long" ? "positive" : d?.action === "short" ? "negative" : ""}`;
  text(
    "signal-reason",
    d ? d.reasons.join("；") : "先收集完整訂單流，才開始判斷。",
  );
  text(
    "decision-time",
    d ? `上次判斷 ${utc(d.time)} UTC · 每 5 分鐘更新` : "每 5 分鐘記錄一次決策",
  );
  const rows = [];
  for (const c of d?.checks ?? []) {
    const row = node("div", undefined, "check-row");
    row.append(node("span", c.label), node("span", c.value, "check-value"));
    const dots = node("span", undefined, "check-dots");
    for (const [name, pass] of [
      ["做多", c.long],
      ["做空", c.short],
    ]) {
      const dot = node(
        "span",
        pass ? "✓" : "−",
        pass ? "check-pass" : "check-fail",
      );
      dot.title = `${name}：${pass ? "符合" : "未符合"}`;
      dot.setAttribute("aria-label", dot.title);
      dots.append(dot);
    }
    row.append(dots);
    rows.push(row);
  }
  $("checks").replaceChildren(
    ...(rows.length ? rows : [node("p", "等待第一筆決策", "empty-inline")]),
  );
}
function renderDepthRows() {
  const f = data.frame,
    rows = [];
  for (
    let i = 0;
    i < Math.min(f?.bids.length ?? 0, f?.asks.length ?? 0, 5);
    i++
  ) {
    const row = node("div", undefined, "depth-row");
    for (const value of [
      money(f.bids[i][1], 3),
      money(f.bids[i][0]),
      money(f.asks[i][0]),
      money(f.asks[i][1], 3),
    ])
      row.append(node("span", value));
    rows.push(row);
  }
  $("depth-rows").replaceChildren(...rows);
}
function renderPositions() {
  const positions = data.state.positions,
    rows = [];
  text(
    "position-count",
    `${positions.length} 個持倉 · ${data.state.pending.length} 筆待成交`,
  );
  for (const p of positions) {
    const row = node("tr"),
      market = cell(p.symbol),
      side = node(
        "span",
        p.side === "long" ? "做多" : "做空",
        `position-side ${p.side === "long" ? "positive" : "negative"}`,
      );
    market.append(side);
    const pnl = (p.lastMark - p.entry) * p.qty * (p.side === "long" ? 1 : -1),
      pnlCell = cell(signed(pnl));
    tone(pnlCell, pnl);
    row.append(
      market,
      cell(money(p.qty, 3)),
      cell(money(p.entry)),
      cell(money(p.stop)),
      cell(money(p.target)),
      pnlCell,
      cell(utc(p.openedAt, true)),
    );
    rows.push(row);
  }
  if (!rows.length) {
    const row = node("tr"),
      empty = cell(
        "目前沒有持倉。符合條件的訊號會在下一份有效深度嘗試模擬成交。",
        "table-empty",
      );
    empty.colSpan = 7;
    row.append(empty);
    rows.push(row);
  }
  $("positions").replaceChildren(...rows);
  const marksOld =
    mode === "live" && positions.some((p) => data.time - p.markTime > 30000);
  text(
    "execution-note",
    marksOld
      ? "持倉標價已過期，未實現損益暫時保留最後觀測值；等待新深度處理出場。"
      : "市價模擬逐檔消耗深度，另加 1 bps 不利滑價與單邊 5.5 bps 手續費。未實現損益尚未扣除出場成本。",
  );
}
function renderLedger() {
  const isDecision = ledgerKind === "decisions";
  const isFill = ledgerKind === "fills";
  const kindName = isDecision ? "決策" : isFill ? "成交" : "風控事件";
  const headings = isDecision
    ? ["時間 UTC", "交易對", "判斷", "原因", "原始紀錄"]
    : isFill
      ? [
          "時間 UTC",
          "交易對 / 方向",
          "動作",
          "數量 / 成交價",
          "手續費",
          "平倉淨損益",
        ]
      : ["時間 UTC", "交易對", "事件", "說明", "金額 USDT"];
  const head = node("tr");
  for (const h of headings) head.append(node("th", h));
  $("ledger-head").replaceChildren(head);
  const records = data[ledgerKind]
      .filter((d) => d.symbol === symbol)
      .slice(0, 12),
    rows = [];
  for (const d of records) {
    const row = node("tr");
    if (isDecision) {
      const action = cell();
      action.append(
        node("span", actionNames[d.action], `action-pill ${d.action}`),
      );
      const linkCell = cell(),
        button = node("button", "查看 →", "decision-link");
      button.addEventListener("click", () => openDetail(d.id));
      linkCell.append(button);
      const reason = cell(d.reasons.join("；"), "reason-cell");
      reason.title = reason.textContent;
      row.append(
        cell(utc(d.time, true)),
        cell(d.symbol),
        action,
        reason,
        linkCell,
      );
    } else if (isFill) {
      const pnl = cell(d.netPnl === null ? "—" : signed(d.netPnl));
      tone(pnl, d.netPnl ?? 0);
      if (d.fundingUncertain) {
        pnl.append(node("span", " *"));
        pnl.title = "Funding 資料不完整，淨損益可能低估或高估";
      }
      row.append(
        cell(utc(d.time, true)),
        cell(`${d.symbol} · ${d.side === "long" ? "多" : "空"}`),
        cell(d.kind === "entry" ? "開倉" : d.reason),
        cell(`${money(d.qty, 3)} @ ${money(d.price)}`),
        cell(money(d.fee)),
        pnl,
      );
    } else {
      const names = {
        reject: "拒絕成交",
        cancel: "取消計畫",
        funding: "估算資金費",
        funding_missing: "資金費缺漏",
        funding_gap: "結算資料中斷",
        exit_depth: "出場深度不足",
      };
      const message = cell(d.message, "reason-cell");
      message.title = d.message;
      row.append(
        cell(utc(d.time, true)),
        cell(d.symbol),
        cell(names[d.kind] ?? d.kind),
        message,
        cell(d.amount == null ? "—" : signed(d.amount)),
      );
    }
    rows.push(row);
  }
  if (!rows.length) {
    const row = node("tr"),
      empty = cell(
        isDecision
          ? "等待策略的第一筆判斷"
          : isFill
            ? "尚無模擬成交；觀望也是策略的一部分。"
            : "尚無拒絕成交、取消計畫或資金費事件。",
        "table-empty",
      );
    empty.colSpan = headings.length;
    row.append(empty);
    rows.push(row);
  }
  $("ledger").replaceChildren(...rows);
  $("export").href = api("export", { kind: ledgerKind });
  text(
    "ledger-caption",
    `顯示 ${symbol} 最近 ${records.length} 筆${kindName} · 匯出包含兩個交易對的全部紀錄`,
  );
}
function surface(id, range, labels = true, formatter = short) {
  const canvas = $(id),
    width = canvas.clientWidth,
    height = canvas.clientHeight;
  if (!width || !height) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const box = { l: 7, r: width - 67, t: 12, b: height - (labels ? 23 : 10) };
  let lo = range[0],
    hi = range[1];
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  const pad = (hi - lo || Math.abs(hi) * 0.001 || 1) * 0.1;
  lo -= pad;
  hi += pad;
  const y = (v) => box.b - ((v - lo) / (hi - lo)) * (box.b - box.t);
  ctx.font = "9px Consolas, monospace";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3,
      yp = y(v);
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(box.l, yp);
    ctx.lineTo(box.r, yp);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.fillText(formatter(v), box.r + 9, yp);
  }
  return { canvas, ctx, width, height, box, y, lo, hi };
}
function xAxis(p, times) {
  if (times.length < 2) return;
  const { ctx, box } = p;
  ctx.fillStyle = colors.muted;
  ctx.font = "9px Consolas, monospace";
  const count = p.width < 430 ? 3 : 5;
  for (let i = 0; i < count; i++) {
    const index = Math.round(((times.length - 1) * i) / (count - 1));
    ctx.textAlign = i === 0 ? "left" : i === count - 1 ? "right" : "center";
    ctx.fillText(
      utc(times[index]).slice(0, 5),
      box.l + ((box.r - box.l) * index) / (times.length - 1),
      box.b + 15,
    );
  }
  ctx.textAlign = "left";
}
function line(p, values, color, fill = false) {
  if (values.length < 2) return;
  const { ctx, box, y } = p;
  const x = (i) => box.l + (i / (values.length - 1)) * (box.r - box.l);
  ctx.beginPath();
  let previous = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      previous = false;
      return;
    }
    if (previous) ctx.lineTo(x(i), y(v));
    else ctx.moveTo(x(i), y(v));
    previous = true;
  });
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  if (fill && values.every(Number.isFinite)) {
    ctx.lineTo(box.r, box.b);
    ctx.lineTo(box.l, box.b);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, box.t, 0, box.b);
    gradient.addColorStop(0, `${color}24`);
    gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}
function drawCharts() {
  if (!data) return;
  drawPrice();
  drawFlow();
  drawDepth();
  drawEquity();
  liquidityHeatmap.resize();
}
function drawPrice() {
  const candles = (data.frame?.candles ?? []).slice(-barCount);
  $("price-empty").hidden = candles.length > 0;
  const p = surface(
    "price-chart",
    candles.length
      ? [
          Math.min(...candles.map((b) => b.low)),
          Math.max(...candles.map((b) => b.high)),
        ]
      : [0, 1],
    true,
    (v) => money(v, symbol === "BTCUSDT" ? 0 : 1),
  );
  if (!p || !candles.length) {
    chart = null;
    return;
  }
  const { ctx, box, y } = p,
    unit = (box.r - box.l) / candles.length,
    x = (i) => box.l + (i + 0.5) * unit;
  candles.forEach((b, i) => {
    ctx.strokeStyle = ctx.fillStyle =
      b.close >= b.open ? colors.teal : colors.red;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x(i), y(b.high));
    ctx.lineTo(x(i), y(b.low));
    ctx.stroke();
    ctx.fillRect(
      x(i) - Math.max(1, unit * 0.6) / 2,
      y(Math.max(b.open, b.close)),
      Math.max(1, unit * 0.6),
      Math.max(1, Math.abs(y(b.open) - y(b.close))),
    );
  });
  const last = candles.at(-1);
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = "#557168";
  ctx.beginPath();
  ctx.moveTo(box.l, y(last.close));
  ctx.lineTo(box.r, y(last.close));
  ctx.stroke();
  ctx.setLineDash([]);
  for (const fill of data.fills.filter(
    (v) =>
      v.symbol === symbol &&
      v.time >= candles[0].time &&
      v.time < last.time + 60000,
  )) {
    const i = candles.findIndex(
      (b) => fill.time >= b.time && fill.time < b.time + 60000,
    );
    if (i < 0) continue;
    const isBuy = (fill.side === "long") === (fill.kind === "entry"),
      yy = y(isBuy ? candles[i].low : candles[i].high) + (isBuy ? 9 : -9);
    ctx.fillStyle = fill.kind === "entry" ? colors.gold : "#e8edf0";
    ctx.beginPath();
    ctx.moveTo(x(i), yy + (isBuy ? -4 : 4));
    ctx.lineTo(x(i) - 4, yy + (isBuy ? 3 : -3));
    ctx.lineTo(x(i) + 4, yy + (isBuy ? 3 : -3));
    ctx.closePath();
    ctx.fill();
  }
  xAxis(
    p,
    candles.map((b) => b.time),
  );
  chart = { ...p, candles, unit, x };
  if (mouseIndex !== null && candles[mouseIndex]) {
    ctx.strokeStyle = "#668594";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x(mouseIndex), box.t);
    ctx.lineTo(x(mouseIndex), box.b);
    ctx.stroke();
    ctx.setLineDash([]);
    const b = candles[mouseIndex];
    text(
      "price-tooltip",
      `${utc(b.time, true)} UTC\nO ${money(b.open)}  H ${money(b.high)}\nL ${money(b.low)}  C ${money(b.close)}`,
    );
  }
  text(
    "candle-caption",
    `${candles.length} 根已收盤 K 線 · 價格 USDT · 時間 UTC`,
  );
}
function drawFlow() {
  const f = data.frame,
    perp = f?.perp ?? [],
    spot = new Map((f?.spot ?? []).map((v) => [v.time, v]));
  const rows = perp.filter((v) => spot.has(v.time));
  let a = 0,
    b = 0;
  const av = rows.map((r) => (a += r.buy - r.sell)),
    bv = rows.map((r) => {
      const s = spot.get(r.time);
      return (b += s.buy - s.sell);
    });
  if (rows.length) {
    av.unshift(0);
    bv.unshift(0);
  }
  $("flow-empty").hidden = rows.length > 0;
  const p = surface(
    "flow-chart",
    av.length ? [Math.min(0, ...av, ...bv), Math.max(0, ...av, ...bv)] : [0, 1],
  );
  if (p) {
    line(p, av, colors.teal);
    line(p, bv, colors.gold);
    xAxis(
      p,
      rows.length ? [rows[0].time, ...rows.map((r) => r.time + 60000)] : [],
    );
  }
  text(
    "flow-caption",
    rows.length
      ? `${utc(rows[0].time)}–${utc(rows.at(-1).time + 60000)} UTC · 窗口起點 CVD 歸零 · 累積 USDT · 連線中斷後重新收集`
      : "僅計入本次連線完整收集的成交，從窗口起點歸零",
  );
}
function drawDepth() {
  const f = data.frame,
    bids = f?.bids ?? [],
    asks = f?.asks ?? [];
  const accumulate = (rows) => {
    let amount = 0;
    return rows.map(([p, q]) => [p, (amount += p * q)]);
  };
  const buy = accumulate(bids),
    sell = accumulate(asks),
    all = [...buy, ...sell];
  $("depth-empty").hidden = bids.length > 0 && asks.length > 0;
  const p = surface("depth-chart", [0, Math.max(1, ...all.map((v) => v[1]))]);
  if (!p || !buy.length || !sell.length) return;
  const min = buy.at(-1)[0],
    max = sell.at(-1)[0],
    x = (price) =>
      p.box.l + ((price - min) / (max - min)) * (p.box.r - p.box.l);
  for (const [rows, color] of [
    [buy, colors.teal],
    [sell, colors.red],
  ]) {
    p.ctx.beginPath();
    rows.forEach(([price, amount], i) => {
      if (i) p.ctx.lineTo(x(price), p.y(amount));
      else p.ctx.moveTo(x(price), p.y(amount));
    });
    p.ctx.strokeStyle = color;
    p.ctx.lineWidth = 1.5;
    p.ctx.stroke();
    p.ctx.lineTo(x(rows.at(-1)[0]), p.y(0));
    p.ctx.lineTo(x(rows[0][0]), p.y(0));
    p.ctx.closePath();
    p.ctx.fillStyle = `${color}18`;
    p.ctx.fill();
  }
  p.ctx.fillStyle = colors.muted;
  p.ctx.textAlign = "left";
  p.ctx.fillText(money(min, 1), p.box.l, p.box.b + 15);
  p.ctx.textAlign = "right";
  p.ctx.fillText(money(max, 1), p.box.r, p.box.b + 15);
  p.ctx.textAlign = "left";
}
function drawEquity() {
  const samples = data.samples ?? [],
    values = samples.map((s) => s.equity);
  $("equity-empty").hidden = samples.length > 1;
  const p = surface(
    "equity-chart",
    values.length
      ? [
          Math.min(data.config.initialBalance, ...values),
          Math.max(data.config.initialBalance, ...values),
        ]
      : [9990, 10010],
    true,
    (v) => money(v, 0),
  );
  if (!p) return;
  const valid = values.map((v, i) =>
    i &&
    (samples[i].session !== samples[i - 1].session ||
      samples[i].time - samples[i - 1].time > 90000)
      ? null
      : v,
  );
  line(p, valid, colors.teal, true);
  xAxis(
    p,
    samples.map((s) => s.time),
  );
  const yy = p.y(data.config.initialBalance);
  if (yy >= p.box.t && yy <= p.box.b) {
    p.ctx.strokeStyle = "#6a6351";
    p.ctx.setLineDash([3, 4]);
    p.ctx.beginPath();
    p.ctx.moveTo(p.box.l, yy);
    p.ctx.lineTo(p.box.r, yy);
    p.ctx.stroke();
    p.ctx.setLineDash([]);
  }
}
async function showJson(path, title, description, params = {}) {
  detailRequest?.abort();
  const controller = new AbortController();
  detailRequest = controller;
  text("dialog-title", title);
  text("dialog-description", description);
  text("detail-json", "讀取中…");
  text("copy-json", "複製 JSON");
  if (!$("detail-dialog").open) $("detail-dialog").showModal();
  document.body.classList.add("dialog-open");
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(api(path, params), {
      signal: controller.signal,
    });
    if (!response.ok) throw Error("無法讀取紀錄");
    const body = await response.json();
    if (controller === detailRequest)
      text("detail-json", JSON.stringify(body, null, 2));
  } catch (e) {
    if (controller === detailRequest)
      text("detail-json", "紀錄暫時無法讀取，請稍後再試。");
  } finally {
    clearTimeout(timer);
  }
}
function openDetail(id) {
  void showJson(
    "decision",
    "決策原始紀錄",
    "以下為當次保存的規則判斷與完整行情快照；不包含事後資料。",
    { id },
  );
}
for (const value of ["live", "demo"])
  $(value + "-mode").addEventListener("click", () => {
    if (mode === value) return;
    mode = value;
    data = null;
    mouseIndex = null;
    $("price-tooltip").hidden = true;
    for (const v of ["live", "demo"]) {
      $(v + "-mode").classList.toggle("selected", mode === v);
      $(v + "-mode").setAttribute("aria-pressed", String(mode === v));
    }
    text("notice", `正在切換至${mode === "live" ? "即時資料" : "合成示例"}…`);
    // Hide the previous source immediately, so a failed request cannot relabel old figures.
    document
      .querySelectorAll(
        ".stats,.heatmap-panel,.workspace,.positions-panel,.ledger-panel",
      )
      .forEach((el) => (el.hidden = true));
    void refresh(true).then(() => {
      if (data)
        document
          .querySelectorAll(
            ".stats,.heatmap-panel,.workspace,.positions-panel,.ledger-panel",
          )
          .forEach((el) => (el.hidden = false));
      drawCharts();
    });
  });
$("symbol").addEventListener("change", () => {
  symbol = $("symbol").value;
  data = null;
  mouseIndex = null;
  $("price-tooltip").hidden = true;
  document
    .querySelectorAll(
      ".stats,.heatmap-panel,.workspace,.positions-panel,.ledger-panel",
    )
    .forEach((el) => (el.hidden = true));
  text("notice", `正在讀取 ${symbol} 資料…`);
  void refresh(true);
});
$("refresh").addEventListener("click", () => {
  void refresh(true);
});
for (const button of document.querySelectorAll("[data-bars]"))
  button.addEventListener("click", () => {
    barCount = Number(button.dataset.bars);
    mouseIndex = null;
    $("price-tooltip").hidden = true;
    for (const b of document.querySelectorAll("[data-bars]"))
      b.classList.toggle("selected", b === button);
    if (data) drawPrice();
  });
for (const kind of ["decisions", "fills", "events"])
  $(kind + "-tab").addEventListener("click", () => {
    ledgerKind = kind;
    for (const v of ["decisions", "fills", "events"])
      $(v + "-tab").classList.toggle("selected", v === kind);
    if (data) renderLedger();
  });
$("price-chart").addEventListener("pointermove", (e) => {
  if (!chart) return;
  const px = e.clientX - chart.canvas.getBoundingClientRect().left;
  mouseIndex = Math.max(
    0,
    Math.min(
      chart.candles.length - 1,
      Math.floor((px - chart.box.l) / chart.unit),
    ),
  );
  $("price-tooltip").hidden = false;
  drawPrice();
});
$("price-chart").addEventListener("pointerleave", () => {
  mouseIndex = null;
  $("price-tooltip").hidden = true;
  if (data) drawPrice();
});
$("jev-preview").addEventListener("click", () => {
  void showJson(
    "jev-input",
    "預留給 Jev 的結構化輸入",
    "依 Jev 官方 state + questions 格式產生，包含實際觀測值與判斷準則。目前未送出、未消耗 API；模型回傳選項與機率，不會假造文字推理。",
  );
});
$("close-dialog").addEventListener("click", () => $("detail-dialog").close());
$("detail-dialog").addEventListener("close", () => {
  detailRequest?.abort();
  detailRequest = null;
  document.body.classList.remove("dialog-open");
});
$("copy-json").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("detail-json").textContent);
    text("copy-json", "已複製");
  } catch {
    text("copy-json", "請選取上方文字複製");
  }
});
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawCharts, 100);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
void refresh();
setInterval(() => {
  if (!document.hidden) void refresh();
}, 5000);
