import { ExchangeSession } from "./exchange-session.js";
import { RULES, reservePerLot, fee } from "./exchange-engine.js";
import { STEP_MS } from "./exchange-market.js";
import { readSave, writeSave } from "./exchange-storage.js";
import {
  ExchangeChart,
  formatPrice,
  formatSize,
  formatCash,
  formatTime,
} from "./exchange-chart.js";

const $ = (id) => document.getElementById(id);
const CHART_KEY = "metabear.exchange.chart.v1";
let session,
  restored = false,
  saveFailed = false;
let playing = true,
  speed = 1,
  side = "buy",
  type = "limit",
  records = "open";
let accumulator = 0,
  lastFrame = performance.now(),
  lastRender = 0,
  lastSave = performance.now();
let toastTimer,
  messageTimer,
  seeking = false,
  seekFrame = 0;
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;
try {
  const saved = await readSave();
  if (saved) {
    session = ExchangeSession.load(saved);
    restored = true;
    playing = false;
  }
} catch {
  saveFailed = true;
}
session ||= new ExchangeSession(freshSeed());
const chart = new ExchangeChart(
  $("market-chart"),
  $("candle-stats"),
  renderChartView,
);
try {
  const preferences = JSON.parse(localStorage.getItem(CHART_KEY) || "{}");
  for (const key of Object.keys(chart.indicators))
    if (typeof preferences.indicators?.[key] === "boolean")
      chart.indicators[key] = preferences.indicators[key];
  if ([10, 30, 60, 300].includes(preferences.frame))
    chart.frame = preferences.frame;
  if (Number.isFinite(preferences.spacing))
    chart.viewport.spacing = Math.max(1, Math.min(180, preferences.spacing));
} catch {
  /* Chart preferences never block a saved game. */
}
for (const input of document.querySelectorAll("[data-indicator]"))
  input.checked = chart.indicators[input.dataset.indicator];
selected("[data-frame]", "frame", chart.frame);
$("order-price").value = (session.world.exchange.lastPrice / 100).toFixed(2);

function text(id, value) {
  const node = $(id);
  if (node.textContent !== value) node.textContent = value;
}
function signed(value, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}
function signClass(node, positive) {
  node.classList.toggle("positive", positive);
  node.classList.toggle("negative", !positive);
}
function decimal(value) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) return NaN;
  const [integer, fraction = ""] = trimmed.split(".");
  const result = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : NaN;
}

function toast(message) {
  clearTimeout(toastTimer);
  text("toast", message);
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4200);
}
function orderMessage(message, error = false) {
  clearTimeout(messageTimer);
  text("order-message", message);
  $("order-message").classList.toggle("error", error);
  messageTimer = setTimeout(() => {
    text("order-message", "");
  }, 9000);
}
let saving = false,
  pendingSave;
async function save() {
  lastSave = performance.now();
  pendingSave = session.serialize();
  if (saving) return;
  saving = true;
  while (pendingSave) {
    const raw = pendingSave;
    pendingSave = null;
    try {
      await writeSave(raw);
      saveFailed = false;
    } catch {
      saveFailed = true;
    }
  }
  saving = false;
  text("save-status", saveFailed ? "無法存檔 · 請保留此頁面" : "此裝置已存檔");
}
function saveChart() {
  try {
    localStorage.setItem(
      CHART_KEY,
      JSON.stringify({
        indicators: chart.indicators,
        frame: chart.frame,
        spacing: chart.viewport.spacing,
      }),
    );
  } catch {
    /* Optional preferences. */
  }
}
function renderChartView(view) {
  const active = Object.entries(chart.indicators).filter(
    ([, enabled]) => enabled,
  );
  text("indicator-count", String(active.length));
  text(
    "study-legend",
    active
      .map(
        ([key]) =>
          ({
            volume: "VOL",
            cvd: "CVD",
            delta: "Δ",
            heatmap: "HEAT",
            footprint: view.footprint ? "FP" : "FP · 放大顯示",
          })[key],
      )
      .join("  ·  "),
  );
  $("chart-live").hidden = view.depth || view.live;
  for (const id of ["zoom-in", "zoom-out"]) $(id).disabled = view.depth;
  const period =
    chart.frame < 60 ? `${chart.frame} 秒` : `${chart.frame / 60} 分`;
  text("chart-caption", view.depth ? "目前委託深度" : `${period} K`);
  text(
    "chart-history",
    view.depth ? "BEAR / USDT" : `${view.count.toLocaleString()} / 4,320 根`,
  );
  text(
    "chart-detail",
    view.depth
      ? "累計掛單量 · BEAR"
      : view.detail ||
          [
            `${formatTime(view.from)} — ${formatTime(view.to)}`,
            view.footprint
              ? `賣 × 買 · 每列 ${formatPrice(view.increment)}`
              : "",
            chart.indicators.cvd
              ? `CVD 起點 ${formatTime(view.cvdAnchor)}`
              : "",
            chart.indicators.heatmap ? "掛單密度 · 10 秒快照" : "",
            view.footprint && view.footprintMissing
              ? "舊存檔此段無逐價資料"
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
  );
}
function pause() {
  playing = false;
  accumulator = 0;
  renderControls();
}

function renderControls() {
  const past = session.inPast;
  text("play-label", playing ? "暫停" : past ? "回放" : "繼續");
  text("play-icon", playing ? "Ⅱ" : "▶");
  $("play-pause").setAttribute(
    "aria-label",
    playing ? "暫停市場" : past ? "回放市場" : "繼續市場",
  );
  text(
    "market-status",
    playing ? (past ? "歷史回放中" : "市場運行中") : "市場已暫停",
  );
  $("state-dot").classList.toggle("paused", !playing);
  text("sim-clock", formatTime(session.world.tick));
  text("branch-label", `時間線 ${String(session.branch).padStart(2, "0")}`);
  text("earliest-time", formatTime(session.earliest));
  text("latest-time", formatTime(session.head));
  text("timeline-note", past ? "回看中 · 操作將開啟新時間線" : "市場時間");
  text("session-code", `MARKET #${session.world.seed}`);
  $("timeline").min = session.earliest;
  $("timeline").max = Math.max(session.head, 1);
  if (!seeking) $("timeline").value = session.world.tick;
  $("timeline").disabled = session.head === 0;
  $("timeline").setAttribute("aria-valuetext", formatTime(session.world.tick));
  $("rewind").disabled = session.world.tick <= session.earliest;
  $("return-live").hidden = !past;
  $("fork").hidden = !past;
}

function renderMarket() {
  const world = session.world,
    x = world.exchange;
  const price = x.lastPrice,
    change = (price / session.origin - 1) * 100;
  text("last-price", formatPrice(price));
  text("book-price", formatPrice(price));
  text("price-change", `${signed(change)}%`);
  signClass($("last-price"), change >= 0);
  signClass($("price-change"), change >= 0);
  signClass($("book-price"), change >= 0);
  text("session-high", formatPrice(world.stats.high));
  text("session-low", formatPrice(world.stats.low));
  const volume = world.stats.volume;
  text(
    "session-volume",
    (volume / 100).toLocaleString("en-US", { maximumFractionDigits: 0 }),
  );
  chart.draw(world);
}

function groupedBook(side) {
  const grouping = Number($("book-group").value);
  const grouped = new Map();
  for (const row of session.world.exchange.levels(side)) {
    const price =
      (side === "buy"
        ? Math.floor(row.price / grouping)
        : Math.ceil(row.price / grouping)) * grouping;
    const item = grouped.get(price) || { price, size: 0, own: 0 };
    item.size += row.size;
    item.own += row.own;
    grouped.set(price, item);
  }
  let total = 0;
  return [...grouped.values()]
    .slice(0, 10)
    .map((row) => ({ ...row, total: (total += row.size) }));
}

function renderBook() {
  const bids = groupedBook("buy"),
    asks = groupedBook("sell");
  const max = Math.max(1, ...[...bids, ...asks].map((r) => r.total));
  for (const [id, rows, side] of [
    ["asks", asks.toReversed(), "sell"],
    ["bids", bids, "buy"],
  ]) {
    const parent = $(id);
    // Keep buttons stable while quotes move; a click reads the price visible on its own row.
    while (parent.children.length > rows.length)
      parent.lastElementChild.remove();
    while (parent.children.length < rows.length) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "book-row";
      const bar = document.createElement("i");
      bar.className = "depth-bar";
      button.append(bar);
      for (let i = 0; i < 3; i++) button.append(document.createElement("span"));
      parent.append(button);
    }
    rows.forEach((row, i) => {
      const button = parent.children[i];
      button.className = `book-row ${side}${row.own ? " own" : ""}`;
      button.dataset.price = row.price;
      button.setAttribute(
        "aria-label",
        `${side === "buy" ? "買" : "賣"}價 ${formatPrice(row.price)}，${formatSize(row.size)} BEAR，填入限價`,
      );
      button.children[0].style.width = `${(row.total / max) * 100}%`;
      button.children[1].textContent = formatPrice(row.price);
      button.children[2].textContent = formatSize(row.size);
      button.children[3].textContent = (row.total / 100).toFixed(1);
    });
  }
  const x = session.world.exchange;
  const bestBid = x.book("buy")[0],
    bestAsk = x.book("sell")[0];
  text(
    "spread",
    bestBid && bestAsk ? formatPrice(bestAsk.price - bestBid.price) : "—",
  );
  const buySize = bids.at(-1)?.total || 0,
    sellSize = asks.at(-1)?.total || 0;
  const ratio =
    buySize + sellSize ? (buySize / (buySize + sellSize)) * 100 : 50;
  text("bid-ratio", `買 ${ratio.toFixed(0)}%`);
  text("ask-ratio", `賣 ${(100 - ratio).toFixed(0)}%`);
  $("bid-bar").style.width = `${ratio}%`;
}

function renderPortfolio() {
  const x = session.world.exchange,
    account = x.accounts.player,
    available = x.available("player");
  const equity = account.cash + account.base * x.lastPrice;
  const pnl = (equity / session.initialEquity - 1) * 100;
  text("equity", formatCash(equity));
  text("pnl", `${signed(pnl)}%`);
  signClass($("pnl"), pnl >= 0);
  text("cash-balance", formatCash(account.cash));
  text("base-balance", formatSize(account.base));
  text(
    "locked-balance",
    `${formatCash(available.lockedCash)} USDT / ${formatSize(available.lockedBase)} BEAR`,
  );
  text(
    "total-fees",
    `${formatCash(
      x.playerOrders.reduce((sum, o) => sum + o.fee, 0),
      4,
    )} USDT`,
  );
  $("allocation-bar").style.width =
    `${equity ? (account.cash / equity) * 100 : 0}%`;
  text(
    "available-balance",
    side === "buy"
      ? `${formatCash(available.cash)} USDT`
      : `${formatSize(available.base)} BEAR`,
  );
}

function estimate() {
  const x = session.world.exchange,
    size = decimal($("order-size").value),
    price = decimal($("order-price").value);
  text("estimate-label", type === "market" ? "預估成交金額" : "委託金額");
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > RULES.maxSize ||
    (type === "limit" &&
      (!Number.isSafeInteger(price) ||
        price <= 0 ||
        price > RULES.maxPrice ||
        price * size > RULES.maxNotional))
  ) {
    text("estimated-total", "— USDT");
    text("estimated-fee", "— USDT");
    return;
  }
  if (type === "limit") {
    text("estimated-total", `${formatCash(price * size)} USDT`);
    text(
      "estimated-fee",
      `≤ ${formatCash(size * fee(price, RULES.takerFeeBps), 4)} USDT`,
    );
  } else {
    const quote = x.quote(side, size);
    text("estimated-total", `${formatCash(quote.value)} USDT`);
    text("estimated-fee", `${formatCash(quote.fee, 4)} USDT`);
  }
}

function rowCells(values) {
  const row = document.createElement("tr");
  for (const value of values) {
    const td = document.createElement("td");
    if (value instanceof Node) td.append(value);
    else td.textContent = value;
    row.append(td);
  }
  return row;
}
function sideTag(side, text) {
  const span = document.createElement("span");
  span.className = side === "buy" ? "positive" : "negative";
  span.textContent = text;
  return span;
}
let recordSignature = "";
function renderOrders() {
  const x = session.world.exchange,
    open = x.orders.filter((o) => o.owner === "player");
  text("open-count", String(open.length));
  $("cancel-all").disabled = !open.length;
  const orders =
    records === "open"
      ? x.playerOrders.filter((o) => ["open", "partial"].includes(o.status))
      : x.playerOrders;
  const fills = x.playerTrades.toReversed();
  const aheadById = new Map(
    orders.map((order) => [
      order.id,
      x.orders
        .filter(
          (o) =>
            o.side === order.side && o.price === order.price && o.id < order.id,
        )
        .reduce((n, o) => n + o.remaining, 0),
    ]),
  );
  const signature = `${records}:${JSON.stringify(records === "fills" ? fills : orders)}:${records === "open" ? JSON.stringify([...aheadById]) : ""}`;
  if (signature === recordSignature) return;
  recordSignature = signature;
  const headers =
    records === "fills"
      ? ["方向", "成交價", "數量", "手續費", "時間"]
      : [
          "方向 / 類型",
          "價格",
          "已成交 / 數量",
          records === "open" ? "排隊在前" : "狀態",
          "",
        ];
  const tr = document.createElement("tr");
  headers.forEach((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    tr.append(th);
  });
  $("orders-head").replaceChildren(tr);
  const rows = [];
  if (records === "fills")
    for (const trade of fills.slice(0, 100)) {
      const isTaker = trade.taker === "player";
      const ownSide = isTaker
        ? trade.side
        : trade.side === "buy"
          ? "sell"
          : "buy";
      const row = rowCells([
        sideTag(
          ownSide,
          `${ownSide === "buy" ? "買入" : "賣出"} · ${isTaker ? "T" : "M"}`,
        ),
        formatPrice(trade.price),
        formatSize(trade.size),
        formatCash(isTaker ? trade.takerFee : trade.makerFee, 4),
        formatTime(trade.time),
      ]);
      row.dataset.record = `fill-${trade.id}`;
      rows.push(row);
    }
  else
    for (const order of orders.slice(0, 100)) {
      const active = ["open", "partial"].includes(order.status);
      const ahead = aheadById.get(order.id);
      const status = {
        open: "等待成交",
        partial: "部分成交",
        filled: "全部成交",
        cancelled: order.filled ? "部分成交 · 已取消" : "已取消",
      }[order.status];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cancel-order";
      button.dataset.cancel = order.id;
      button.textContent = "撤單";
      button.setAttribute("aria-label", `撤銷 ${order.id} 號委託`);
      const statusNode = document.createElement("span");
      statusNode.textContent = status;
      statusNode.className = "fill-status";
      statusNode.title = order.reason || status;
      const row = rowCells([
        sideTag(
          order.side,
          `${order.side === "buy" ? "買" : "賣"} / ${order.type === "market" ? "市價" : "限價"}`,
        ),
        order.price ? formatPrice(order.price) : "市價",
        `${formatSize(order.filled)} / ${formatSize(order.size)}`,
        records === "open" ? formatSize(ahead) : statusNode,
        active ? button : "—",
      ]);
      row.dataset.record = `order-${order.id}`;
      rows.push(row);
    }
  const body = $("orders-body");
  const existing = new Map(
    [...body.children].map((row) => [row.dataset.record, row]),
  );
  const keep = new Set(rows.map((row) => row.dataset.record));
  for (const row of [...body.children])
    if (!keep.has(row.dataset.record)) row.remove();
  rows.forEach((newRow, index) => {
    const oldRow = existing.get(newRow.dataset.record);
    const row = oldRow || newRow;
    if (oldRow)
      [...newRow.children].forEach((cell, i) => {
        // A changing queue must not replace the button under the player's pointer.
        if (
          oldRow.children[i].querySelector("[data-cancel]") &&
          cell.querySelector("[data-cancel]")
        )
          return;
        if (oldRow.children[i].innerHTML !== cell.innerHTML)
          oldRow.children[i].replaceChildren(...cell.childNodes);
      });
    if (body.children[index] !== row)
      body.insertBefore(row, body.children[index] || null);
  });
  $("orders-empty").hidden = rows.length > 0;
  $("orders-empty").querySelector("strong").textContent =
    records === "open"
      ? "還沒有掛單"
      : records === "fills"
        ? "還沒有成交"
        : "還沒有交易紀錄";
}

let tapeSignature = "";
function renderTape() {
  const trades = session.world.exchange.trades.slice(-8).toReversed();
  const signature = trades.map((t) => t.id).join(",");
  if (signature === tapeSignature) return;
  tapeSignature = signature;
  $("trade-tape").replaceChildren(
    ...trades.map((trade) => {
      const row = document.createElement("div");
      row.className =
        "tape-row" +
        (trade.maker === "player" || trade.taker === "player" ? " player" : "");
      row.append(sideTag(trade.side, formatPrice(trade.price)));
      for (const value of [formatSize(trade.size), formatTime(trade.time)]) {
        const span = document.createElement("span");
        span.textContent = value;
        row.append(span);
      }
      return row;
    }),
  );
}
function render() {
  renderControls();
  renderMarket();
  renderBook();
  renderPortfolio();
  estimate();
  renderOrders();
  renderTape();
}
function selected(selector, key, value) {
  document.querySelectorAll(selector).forEach((button) => {
    const active = button.dataset[key] === String(value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
}
function setType(value) {
  type = value;
  selected("[data-type]", "type", type);
  $("price-field").hidden = type === "market";
  $("market-price-field").hidden = type !== "market";
  $("order-price").disabled = type === "market";
  estimate();
}
document.querySelectorAll("[data-side]").forEach((button) =>
  button.addEventListener("click", () => {
    side = button.dataset.side;
    selected("[data-side]", "side", side);
    text("submit-order", `${side === "buy" ? "買入" : "賣出"} BEAR`);
    $("submit-order").classList.toggle("sell", side === "sell");
    text("order-message", "");
    renderPortfolio();
    estimate();
  }),
);
document
  .querySelectorAll("[data-type]")
  .forEach((button) =>
    button.addEventListener("click", () => setType(button.dataset.type)),
  );
document.querySelectorAll("[data-records]").forEach((button) =>
  button.addEventListener("click", () => {
    records = button.dataset.records;
    selected("[data-records]", "records", records);
    renderOrders();
  }),
);
document.querySelectorAll("[data-chart]").forEach((button) =>
  button.addEventListener("click", () => {
    chart.mode = button.dataset.chart;
    selected("[data-chart]", "chart", chart.mode);
    chart.draw();
    $("market-chart").setAttribute(
      "aria-label",
      chart.mode === "depth"
        ? "BEAR 買賣累計深度圖"
        : "BEAR 互動 K 線圖；方向鍵平移，加減鍵縮放，End 追蹤最新",
    );
  }),
);
document.querySelectorAll("[data-frame]").forEach((button) =>
  button.addEventListener("click", () => {
    chart.frame = Number(button.dataset.frame);
    selected("[data-frame]", "frame", chart.frame);
    chart.draw();
    saveChart();
  }),
);
$("zoom-in").addEventListener("click", () => {
  chart.zoom(1.35);
  saveChart();
});
$("zoom-out").addEventListener("click", () => {
  chart.zoom(1 / 1.35);
  saveChart();
});
$("chart-live").addEventListener("click", () => chart.live());
$("indicators-open").addEventListener("click", () =>
  $("indicators-dialog").showModal(),
);
document.querySelectorAll("[data-indicator]").forEach((input) =>
  input.addEventListener("change", () => {
    chart.indicators[input.dataset.indicator] = input.checked;
    chart.draw();
    saveChart();
  }),
);
function expandChart(expanded) {
  document.querySelector(".chart-panel").classList.toggle("expanded", expanded);
  $("chart-expand").setAttribute("aria-pressed", expanded);
  $("chart-expand").setAttribute(
    "aria-label",
    expanded ? "收合圖表" : "展開圖表",
  );
  $("chart-expand").title = expanded ? "收合圖表 · Esc" : "展開圖表";
  chart.draw();
}
$("chart-expand").addEventListener("click", () =>
  expandChart($("chart-expand").getAttribute("aria-pressed") !== "true"),
);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("dialog[open]"))
    expandChart(false);
});
$("book-group").addEventListener("change", renderBook);
for (const id of ["asks", "bids"])
  $(id).addEventListener("click", (event) => {
    const row = event.target.closest("[data-price]");
    if (!row) return;
    setType("limit");
    $("order-price").value = (Number(row.dataset.price) / 100).toFixed(2);
    estimate();
  });
$("use-last").addEventListener("click", () => {
  $("order-price").value = (session.world.exchange.lastPrice / 100).toFixed(2);
  estimate();
});
for (const id of ["order-size", "order-price"])
  $(id).addEventListener("input", estimate);
document.querySelectorAll("[data-percent]").forEach((button) =>
  button.addEventListener("click", () => {
    const portion = Number(button.dataset.percent) / 100;
    const available = session.world.exchange.available("player");
    let size;
    if (side === "sell") size = Math.floor(available.base * portion);
    else if (type === "limit") {
      const price = decimal($("order-price").value);
      if (!Number.isSafeInteger(price) || price <= 0) {
        orderMessage("請先輸入有效價格", true);
        return;
      }
      size = Math.floor((available.cash * portion) / reservePerLot(price));
    } else {
      // Estimate against actual depth using the chosen fraction of currently available cash.
      let cash = Math.floor(available.cash * portion);
      size = 0;
      for (const maker of session.world.exchange.book("sell")) {
        if (maker.owner === "player") break;
        let take = Math.min(
          maker.remaining,
          Math.floor(cash / (maker.price * (1 + RULES.takerFeeBps / 10000))),
        );
        while (
          take > 0 &&
          take * maker.price + fee(take * maker.price, RULES.takerFeeBps) > cash
        )
          take--;
        size += take;
        cash -= take * maker.price + fee(take * maker.price, RULES.takerFeeBps);
        if (take < maker.remaining) break;
      }
    }
    $("order-size").value = (Math.min(RULES.maxSize, size) / 100).toFixed(2);
    estimate();
  }),
);
$("order-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const command = {
    side,
    type,
    size: decimal($("order-size").value),
    price: type === "limit" ? decimal($("order-price").value) : undefined,
  };
  const result = session.execute(command);
  if (!result.ok) {
    orderMessage(result.error || "無法送出委託", true);
    return;
  }
  const filled = result.filled
    ? `成交 ${formatSize(result.filled)} BEAR${result.filled ? ` · 均價 ${formatPrice(result.value / result.filled)}` : ""}`
    : "";
  const remaining = ["open", "partial"].includes(result.status)
    ? `掛單 ${formatSize(result.remaining)} BEAR`
    : result.reason;
  orderMessage([filled, remaining].filter(Boolean).join("；"));
  if (result.branched)
    toast(`時間線 ${String(session.branch).padStart(2, "0")} 已開始`);
  render();
  save();
});
$("orders-body").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cancel]");
  if (!button) return;
  const result = session.execute({
    action: "cancel",
    id: Number(button.dataset.cancel),
  });
  if (result.ok)
    toast(result.branched ? "已撤單，並開始新時間線" : "已撤單，資產已釋放");
  render();
  save();
});
$("cancel-all").addEventListener("click", () => {
  const result = session.execute({ action: "cancelAll" });
  toast(
    `已撤銷 ${result.count} 筆委託${result.branched ? "，並開始新時間線" : ""}`,
  );
  render();
  save();
});
$("play-pause").addEventListener("click", () => {
  playing = !playing;
  accumulator = 0;
  lastFrame = performance.now();
  renderControls();
  if (!playing) save();
});
$("step").addEventListener("click", () => {
  pause();
  session.advance(4);
  render();
  save();
});
$("speed").addEventListener("change", () => {
  speed = Number($("speed").value);
  accumulator = 0;
});
$("rewind").addEventListener("click", () => {
  pause();
  session.seek(session.world.tick - 120);
  render();
  save();
});
$("timeline").addEventListener("pointerdown", () => {
  seeking = true;
  pause();
});
$("timeline").addEventListener("input", () => {
  const target = Number($("timeline").value);
  seeking = true;
  pause();
  cancelAnimationFrame(seekFrame);
  seekFrame = requestAnimationFrame(() => {
    session.seek(target);
    render();
  });
});
$("timeline").addEventListener("change", () => {
  cancelAnimationFrame(seekFrame);
  session.seek(Number($("timeline").value));
  seeking = false;
  render();
  save();
});
window.addEventListener("pointerup", () => {
  seeking = false;
});
$("return-live").addEventListener("click", () => {
  pause();
  session.seek(session.head);
  render();
  save();
});
$("fork").addEventListener("click", () => {
  session.fork();
  pause();
  render();
  save();
  toast("已保留此刻，繼續交易即可改寫後續行情");
});
$("rules-open").addEventListener("click", () => {
  pause();
  $("rules-dialog").showModal();
});
$("new-open").addEventListener("click", () => {
  pause();
  $("new-seed").value = String(freshSeed());
  text("seed-error", "");
  $("new-dialog").showModal();
});
$("random-seed").addEventListener("click", () => {
  $("new-seed").value = String(freshSeed());
});
$("new-form").addEventListener("submit", (event) => {
  if (event.submitter?.value !== "new") return;
  const value = $("new-seed").value.trim(),
    seed = Number(value);
  if (
    !/^\d{1,10}$/.test(value) ||
    !Number.isSafeInteger(seed) ||
    seed < 1 ||
    seed > 4294967295
  ) {
    event.preventDefault();
    text("seed-error", "請輸入 1 至 4294967295 的市場代碼");
    return;
  }
  session = new ExchangeSession(seed);
  chart.viewport.live();
  recordSignature = "";
  tapeSignature = "";
  playing = true;
  accumulator = 0;
  lastFrame = performance.now();
  $("order-price").value = (session.world.exchange.lastPrice / 100).toFixed(2);
  $("order-size").value = "10";
  text("order-message", "");
  render();
  save();
  toast("新市場已開啟");
});
document.addEventListener("keydown", (event) => {
  if (
    event.code !== "Space" ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(
      event.target.tagName,
    ) ||
    document.querySelector("dialog[open]")
  )
    return;
  event.preventDefault();
  $("play-pause").click();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pause();
    save();
    saveChart();
  }
  lastFrame = performance.now();
});
window.addEventListener("pagehide", () => {
  pause();
  save();
  saveChart();
});

function frame(now) {
  // A reset/resume can run after this animation frame's timestamp was sampled.
  // Never feed a negative delta back into the fixed-step simulation.
  const elapsed = Math.max(0, Math.min(250, now - lastFrame));
  lastFrame = now;
  if (playing && !document.hidden && !seeking) {
    accumulator += elapsed * speed;
    const ticks = Math.min(12, Math.floor(accumulator / STEP_MS));
    if (ticks) {
      session.advance(ticks);
      accumulator -= ticks * STEP_MS;
    }
  }
  if (now - lastRender > 125) {
    render();
    lastRender = now;
  }
  if (now - lastSave > 5000) save();
  requestAnimationFrame(frame);
}
render();
$("terminal").setAttribute("aria-busy", "false");
$("terminal").removeAttribute("inert");
if (restored) toast("已回到上次離開的市場，按繼續即可交易");
else if (saveFailed) toast("上次存檔無法讀取，已開啟新市場");
requestAnimationFrame(frame);
