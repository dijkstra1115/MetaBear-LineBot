// Flow Arena rooms: lobby, a simplified trading screen and results, driven by the room's stream.
// The page never changes the market on its own. Orders go to the room; the room's echo is what
// moves this player's copy (see arena-replica.js), so every player sees the same market.
import { ARENA_START_BALANCE } from "./flow-arena-engine.js";
import { arenaChartPriceAtY, drawArenaChart } from "./flow-arena-chart.js";
import { ArenaReplica } from "./arena-replica.js";
import { ARENA_CODE, ARENA_ROOM_SIZE, cleanName, newRoomCode } from "./arena-protocol.js";

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 0) => Number(value).toLocaleString("zh-TW", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value, digits = 2) => `${value >= 0 ? "+" : "−"}${fmt(Math.abs(value), digits)}`;
const money = (value) => `${value >= 0 ? "+" : "−"}$${fmt(Math.abs(value))}`;
const price = (cents) => fmt(cents / 100, 0);
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const grade = (score) => score >= 200 ? "S" : score >= 100 ? "A" : score >= 40 ? "B" : score > 0 ? "C" : "D";

const TOKEN_KEY = "metabear-arena-token";
const NAME_KEY = "metabear-flow-arena-handle";
const TIPS_KEY = "metabear-arena-tips-seen";
const SIZES = { small: 500, medium: 1250, large: 2500 };
const LEVEL_LABEL = { rookie: "新手", skilled: "中階", expert: "高手" };

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private mode keeps working without it. */ } },
};

function playerToken() {
  let token = store.get(TOKEN_KEY);
  if (!token || token.length < 16) {
    token = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    store.set(TOKEN_KEY, token);
  }
  return token;
}

const state = {
  code: null,
  socket: null,
  retry: 0,
  fatal: false,
  you: null,
  seats: [],
  status: "lobby",
  replica: null,
  countdownUntil: 0,
  size: "medium",
  lastPanels: 0,
  seenFeed: 0,
  seenKnockouts: 0,
  seenEvents: null,
  endStandings: null,
};
const chartView = { zoom: 1, offset: 0, cursorPrice: null, sizeLabel: "", layer: "liq", flashes: [], pulse: 0, compact: false };

const run = () => state.replica?.run ?? null;
const orderLots = () => Math.max(1, Math.round(SIZES[state.size] * 100 / run().contractBtc));
const btc = (lots) => `${fmt(run().btc(lots))} BTC`;
const seatName = (id) => id === state.you ? "你" : state.seats.find((seat) => seat.id === id)?.name ?? run()?.trader(id)?.name ?? "玩家";

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function show(view) {
  for (const id of ["entry", "lobby", "game"]) $(id).hidden = id !== view;
}

/* ---------- Entry ---------- */

function roomFromUrl() {
  const code = (new URL(location.href).searchParams.get("room") ?? "").toUpperCase();
  return ARENA_CODE.test(code) ? code : null;
}

function enterRoom(code) {
  const name = cleanName($("entry-name").value);
  store.set(NAME_KEY, name);
  const url = new URL(location.href);
  url.searchParams.set("room", code);
  history.replaceState(null, "", url);
  state.code = code;
  state.fatal = false;
  connect();
  renderLobby();
  show("lobby");
}

$("create-room").addEventListener("click", () => {
  const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  enterRoom(newRoomCode(random));
});
$("join-room").addEventListener("click", () => {
  const code = $("join-code").value.trim().toUpperCase();
  if (!ARENA_CODE.test(code)) { $("entry-error").textContent = "房號是 6 個英數字，請再確認一次"; return; }
  enterRoom(code);
});
$("join-code").addEventListener("keydown", (event) => { if (event.key === "Enter") $("join-room").click(); });

/* ---------- Connection ---------- */

function setConnection(text, online) {
  $("connection").hidden = !text;
  $("connection").textContent = text;
  $("connection").classList.toggle("online", online);
}

function connect() {
  if (state.socket && state.socket.readyState <= 1) return;
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${scheme}://${location.host}/arena/ws?room=${state.code}`);
  state.socket = socket;
  setConnection("連線中…", false);
  socket.addEventListener("open", () => {
    state.retry = 0;
    setConnection("已連線", true);
    send({ type: "hello", name: store.get(NAME_KEY) ?? "", token: playerToken() });
  });
  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    handle(message);
  });
  socket.addEventListener("close", () => {
    if (state.socket !== socket || state.fatal) return;
    setConnection("連線中斷，重新連線中…", false);
    setTimeout(connect, Math.min(8000, 500 * 2 ** state.retry++));
  });
}

function send(message) {
  if (state.socket?.readyState === 1) state.socket.send(JSON.stringify(message));
}

function leaveRoom() {
  send({ type: "leave" });
  state.fatal = true;
  state.socket?.close();
  state.socket = null;
  state.replica = null;
  state.code = null;
  history.replaceState(null, "", location.pathname);
  setConnection("", false);
  if ($("result").open) $("result").close();
  show("entry");
}

/* ---------- Room messages ---------- */

function handle(message) {
  switch (message.type) {
    case "welcome":
      state.you = message.you;
      break;
    case "lobby":
      state.seats = message.seats;
      state.status = message.status;
      // Back to the lobby (a rematch, or a room that was never started): drop the old market.
      if (message.status === "lobby") {
        state.replica = null;
        if ($("result").open) $("result").close();
        show("lobby");
      } else if (!state.replica && message.status !== "finished") show("lobby");
      renderLobby();
      break;
    case "start":
    case "sync":
      startGame(message);
      break;
    case "action": {
      if (!state.replica) break;
      const result = state.replica.apply(message);
      if (message.trader === state.you) ownResult(message, result);
      break;
    }
    case "tick":
    case "check":
      if (!state.replica) break;
      state.replica.apply(message);
      if (message.type === "tick") afterTick();
      if (state.replica.desync) setMessage("畫面和房間不同步了，請重新整理頁面", true);
      break;
    case "end":
      if (state.replica) state.replica.apply(message);
      showResult(message.standings);
      break;
    case "rejected":
      setMessage(message.error ?? "無法下單", true);
      break;
    case "error":
      if (message.fatal) {
        state.fatal = true;
        state.socket?.close();
        setConnection("", false);
        history.replaceState(null, "", location.pathname);
        show("entry");
        $("entry-error").textContent = message.message;
      }
      break;
    default:
      break;
  }
}

/* ---------- Lobby ---------- */

function renderLobby() {
  $("room-code").textContent = state.code ?? "——";
  const link = `${location.origin}${location.pathname}?room=${state.code}`;
  $("line-share").href = `https://line.me/R/msg/text/?${encodeURIComponent(`來 Flow Arena 跟我對戰！房號 ${state.code}\n${link}`)}`;
  const me = state.seats.find((seat) => seat.id === state.you);
  const hostSeat = state.seats.find((seat) => seat.host);
  // Mirrors the room: the host leads, or the first player online while the host is offline.
  const host = Boolean(me?.host || (hostSeat && !hostSeat.connected && state.seats.find((seat) => !seat.bot && seat.connected)?.id === state.you));
  const list = $("seats");
  list.replaceChildren();
  for (let i = 0; i < ARENA_ROOM_SIZE; i++) {
    const seat = state.seats[i];
    const item = el("li", seat ? seat.id === state.you ? "you" : "" : "empty");
    if (!seat) { item.textContent = "空位"; list.append(item); continue; }
    const dot = el("span", seat.connected ? "dot" : "dot off");
    item.append(dot, el("strong", "", seat.id === state.you ? `${seat.name}（你）` : seat.name));
    if (seat.host) item.append(el("span", "tag host", "房主"));
    if (seat.bot) item.append(el("span", "tag bot", `電腦 · ${LEVEL_LABEL[seat.level] ?? ""}`));
    if (host && seat.id !== state.you && (seat.bot || !seat.connected)) {
      const remove = el("button", "remove", "×");
      remove.type = "button";
      remove.title = "移除";
      remove.addEventListener("click", () => send({ type: "removeSeat", id: seat.id }));
      item.append(remove);
    }
    list.append(item);
  }
  const lobby = state.status === "lobby" || state.status === "finished";
  $("host-controls").hidden = !host || !lobby;
  for (const button of document.querySelectorAll("[data-bot]")) button.disabled = state.seats.length >= ARENA_ROOM_SIZE;
  $("start-game").hidden = !host || !lobby;
  const ready = state.seats.filter((seat) => seat.bot || seat.connected).length;
  $("start-game").disabled = ready < 2;
  $("lobby-note").textContent = !lobby ? "對戰進行中…" : host ? ready < 2 ? "至少要 2 位玩家（可以加電腦）才能開始。" : "人到齊就按開始；離線的玩家不會加入這局。" : "等待房主開始對戰。";
}

for (const button of document.querySelectorAll("[data-bot]")) button.addEventListener("click", () => send({ type: "addBot", level: button.dataset.bot }));
$("start-game").addEventListener("click", () => send({ type: "start" }));
$("leave-lobby").addEventListener("click", leaveRoom);
$("copy-link").addEventListener("click", async () => {
  const link = `${location.origin}${location.pathname}?room=${state.code}`;
  try { await navigator.clipboard.writeText(link); $("share-status").textContent = "邀請連結已複製，貼給朋友就能加入。"; }
  catch { $("share-status").textContent = `請複製這個連結：${link}`; }
});

/* ---------- Game ---------- */

function startGame(message) {
  state.replica = new ArenaReplica(message, state.you);
  state.countdownUntil = message.type === "start" ? performance.now() + message.countdown * 1000 : 0;
  state.seenFeed = run().feedId;
  state.seenKnockouts = run().knockouts.length;
  state.seenEvents = run().events[0] ?? null;
  state.endStandings = null;
  chartView.flashes = [];
  if ($("result").open) $("result").close();
  setMessage("");
  show("game");
  if (!store.get(TIPS_KEY)) $("tips").hidden = false;
  renderPanels();
}

function setMessage(text, error = false) {
  $("trade-message").textContent = text;
  $("trade-message").classList.toggle("error", error);
}

function toast(text, tone = "mint") {
  const item = el("div", `toast ${tone}`, text);
  $("toasts").append(item);
  setTimeout(() => item.remove(), 2600);
  while ($("toasts").children.length > 3) $("toasts").firstChild.remove();
}

function ownResult(message, result) {
  if (!result) return;
  if (result.ok === false) { setMessage(result.error ?? "無法下單", true); return; }
  if (message.op === "submit") {
    const [side, type, , limit] = message.args;
    if (result.matched) {
      const cascade = result.cascade?.lots ? `，觸發 ${btc(result.cascade.lots)} 強平！` : "";
      setMessage(`${side === "buy" ? "買入" : "賣出"} ${btc(result.matched)}，均價 ${price(result.avgPrice)}${cascade}`);
      if (result.stalled) toast("推不動！有人在這個價位吸收", "gold");
    } else if (type === "limit") setMessage(`掛單 ${btc(result.resting)} 在 ${price(limit)}，等別人來成交`);
  } else if (message.op === "close") setMessage(result.matched ? `已平倉，均價 ${price(result.avgPrice)}` : "已平倉");
  else if (message.op === "setLeverage") setMessage(`槓桿改為 ${message.args[0]}×`);
}

// Liquidation waves, other players blown out, and headlines become short toasts and feed rows.
function afterTick() {
  const market = run();
  const waves = market.liquidationFeed.filter((item) => item.id > state.seenFeed && !item.warm);
  if (waves.length) {
    state.seenFeed = waves.at(-1).id;
    const lots = waves.reduce((sum, item) => sum + item.lots, 0);
    const chain = Math.max(...waves.map((item) => item.chain));
    const side = waves.at(-1).side === "short" ? "空單" : "多單";
    const yours = waves.some((item) => item.ignited);
    toast(`💥 ${side}爆倉 ${btc(lots)}${chain > 1 ? ` · 連環 ×${chain}` : ""}${yours ? " · 你引爆的！" : ""}`, yours ? "gold" : waves.at(-1).side === "short" ? "mint" : "coral");
    for (const item of waves) chartView.flashes.push({ from: item.from, to: item.to, side: item.side, born: performance.now(), age: 0 });
  }
  for (const item of market.knockouts.slice(state.seenKnockouts)) {
    if (item.victim === state.you) toast(item.by ? "你被推爆了！" : "你的倉位被強平了", "coral");
    else if (item.by === state.you) toast("🎯 你推爆了一名玩家！", "violet");
    else toast("一名玩家被強平", "violet");
  }
  state.seenKnockouts = market.knockouts.length;
  renderPanels();
}

function renderPanels() {
  const market = run();
  if (!market) return;
  const you = market.you;
  const account = you.account;
  const equity = you.equity();
  const roi = (equity / ARENA_START_BALANCE - 1) * 100;
  $("equity").textContent = fmt(equity);
  $("roi").textContent = `${signed(roi)}%`;
  $("roi").className = roi > 0 ? "positive" : roi < 0 ? "negative" : "";

  if (account.position) {
    const long = account.position > 0;
    $("position").textContent = `${long ? "做多" : "做空"} ${btc(Math.abs(account.position))}`;
    const pnl = account.position * (market.markPrice() - account.entry) / market.denominator;
    $("pnl").textContent = money(pnl);
    $("pnl").className = pnl > 0 ? "positive" : pnl < 0 ? "negative" : "";
    const liq = you.liquidationPrice();
    const distance = liq ? Math.abs(liq / market.markPrice() - 1) * 100 : null;
    $("liq").textContent = liq ? `強平價 ${price(liq)}（${fmt(distance, 1)}%）` : "";
    $("liq").classList.toggle("danger", distance != null && distance < 3);
  } else {
    $("position").textContent = "空手";
    $("pnl").textContent = "";
    $("liq").textContent = `槓桿 ${you.leverage}×`;
    $("liq").classList.remove("danger");
  }

  for (const button of document.querySelectorAll("[data-size]")) {
    button.classList.toggle("active", button.dataset.size === state.size);
  }
  const flat = !account.position && !you.orders().length;
  for (const button of document.querySelectorAll("[data-leverage]")) {
    button.classList.toggle("active", Number(button.dataset.leverage) === you.leverage);
    button.disabled = !flat;
  }

  const orders = $("orders");
  orders.replaceChildren();
  const resting = you.orders();
  if (!resting.length) orders.append(el("li", "empty", "還沒有掛單。點圖表上的價格就能掛。"));
  for (const order of resting) {
    const item = el("li", "", `${order.side === "buy" ? "買" : "賣"} ${btc(order.lots)} @ ${price(order.price)}`);
    const cancel = el("button", "", "✕");
    cancel.type = "button";
    cancel.title = "撤單";
    cancel.addEventListener("click", () => send({ type: "action", op: "cancel", args: [order.id] }));
    item.append(cancel);
    orders.append(item);
  }

  const players = $("players");
  players.replaceChildren();
  for (const trader of market.traders) {
    const seat = state.seats.find((item) => item.id === trader.id);
    const item = el("li", trader.id === state.you ? "you" : "");
    item.append(el("span", seat?.connected === false ? "dot off" : "dot"), el("strong", "", trader.id === state.you ? `${trader.name}（你）` : trader.name));
    const knocked = market.knockouts.filter((knockout) => knockout.victim === trader.id).length;
    if (knocked) item.append(el("em", "", `被強平 ${knocked} 次`));
    players.append(item);
  }

  const feed = $("feed");
  feed.replaceChildren();
  const events = market.events.slice(0, 5);
  if (!events.length) feed.append(el("li", "empty", "還很平靜。"));
  for (const event of events) {
    const item = el("li");
    item.append(el("time", "", clock(Math.max(0, market.duration - event.time))), document.createTextNode(`${event.title} ${event.detail}`));
    feed.append(item);
  }

  // Plain-language market pulse: who is taking, whether positions are opening, estimated fuel.
  const recent = market.market.tradeLog.filter((trade) => trade.time > market.time - 10 && trade.takerOwner !== "liquidation");
  const flow = recent.reduce((sum, trade) => sum + (trade.aggressorSide === "buy" ? trade.lots : -trade.lots), 0);
  const candles = market.market.candles;
  const oiNow = candles.at(-1)?.oi;
  const oiBefore = candles.at(-6)?.oi;
  const oiChange = oiNow != null && oiBefore != null ? (oiNow - oiBefore) / Math.max(1, oiBefore) : 0;
  const fuel = market.fuel(0.03);
  const pulse = $("pulse");
  pulse.replaceChildren(
    el("span", flow > 400 ? "up" : flow < -400 ? "down" : "", flow > 400 ? "主動買盤強" : flow < -400 ? "主動賣盤強" : "買賣拉鋸"),
    el("span", oiChange > 0.03 ? "up" : oiChange < -0.03 ? "down" : "", oiChange > 0.03 ? "持倉量上升：新倉進場" : oiChange < -0.03 ? "持倉量下降：有人離場" : "持倉量持平"),
    el("span", "", `熱圖估計 ↑${btc(fuel.short)} ↓${btc(fuel.long)}`),
  );
}

function renderClock(now) {
  const market = run();
  if (!market) return;
  const counting = state.countdownUntil > now;
  $("countdown").hidden = !counting;
  if (counting) $("countdown").textContent = String(Math.ceil((state.countdownUntil - now) / 1000));
  const left = Math.max(0, market.duration - market.time);
  $("game-clock").textContent = clock(left);
  $("game-clock").classList.toggle("urgent", left <= 15);
}

function frame(now) {
  if (state.replica && !$("game").hidden) {
    const canvas = $("chart");
    chartView.compact = canvas.clientWidth < 720;
    for (const flash of chartView.flashes) flash.age = (now - flash.born) / 1300;
    chartView.flashes = chartView.flashes.filter((flash) => flash.age < 1);
    chartView.sizeLabel = `${fmt(SIZES[state.size])} BTC`;
    drawArenaChart(canvas, run(), chartView);
    renderClock(now);
  }
  requestAnimationFrame(frame);
}

function trade(op, args) {
  if (!state.replica || run().finished) return;
  if (state.countdownUntil > performance.now()) { setMessage("倒數結束後才能下單", true); return; }
  send({ type: "action", op, args });
}

$("buy").addEventListener("click", () => { if (run()) trade("submit", ["buy", "market", orderLots(), null, {}]); });
$("sell").addEventListener("click", () => { if (run()) trade("submit", ["sell", "market", orderLots(), null, {}]); });
$("close").addEventListener("click", () => {
  if (!run()?.you.account.position) { setMessage("目前沒有部位", true); return; }
  trade("close", []);
});
$("cancel-all").addEventListener("click", () => trade("cancelAll", []));
for (const button of document.querySelectorAll("[data-size]")) button.addEventListener("click", () => { state.size = button.dataset.size; renderPanels(); });
for (const button of document.querySelectorAll("[data-leverage]")) button.addEventListener("click", () => trade("setLeverage", [Number(button.dataset.leverage)]));

// Clicking the chart rests an order at that price: below the price buys, above it sells.
$("chart").addEventListener("click", (event) => {
  const market = run();
  if (!market) return;
  const limit = arenaChartPriceAtY($("chart"), market, chartView, event.clientY);
  if (limit == null) return;
  trade("submit", [limit < market.market.last ? "buy" : "sell", "limit", orderLots(), limit, {}]);
});
$("chart").addEventListener("mousemove", (event) => {
  const market = run();
  chartView.cursorPrice = market ? arenaChartPriceAtY($("chart"), market, chartView, event.clientY) : null;
});
$("chart").addEventListener("mouseleave", () => { chartView.cursorPrice = null; });

document.addEventListener("keydown", (event) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if ($("game").hidden || $("result").open) return;
  const key = event.key.toLowerCase();
  if (key === "q") $("buy").click();
  else if (key === "e") $("sell").click();
  else if (key === "f") $("close").click();
  else if (["1", "2", "3"].includes(key)) { state.size = ["small", "medium", "large"][Number(key) - 1]; renderPanels(); }
});

$("tips-close").addEventListener("click", () => { $("tips").hidden = true; store.set(TIPS_KEY, "1"); });

/* ---------- Results ---------- */

function showResult(standings) {
  const market = run();
  const mine = standings.find((row) => row.id === state.you);
  $("result-title").textContent = mine ? `第 ${mine.rank} 名 · ${grade(mine.score)}` : "本局結果";
  $("result-summary").textContent = mine ? `你的報酬 ${signed(mine.roi)}%，得分 ${mine.score}。${mine.playerLiquidations ? `被強平 ${mine.playerLiquidations} 次。` : ""}` : "";
  const list = $("standings");
  list.replaceChildren();
  for (const row of standings) {
    const item = el("li", row.id === state.you ? "you" : "");
    item.append(el("b", "", `#${row.rank}`), el("span", "", seatName(row.id)), el("strong", "", String(row.score)), el("em", row.roi > 0 ? "positive" : row.roi < 0 ? "negative" : "", `${signed(row.roi)}%`));
    list.append(item);
  }
  const battle = $("battle");
  battle.replaceChildren();
  if (market) {
    const review = market.review();
    for (const item of review.knockouts) {
      const side = item.side === "long" ? "多單" : "空單";
      battle.append(el("li", "", item.by ? `第 ${item.time} 秒：${seatName(item.by)}推爆了${seatName(item.victim)}的${side}（${btc(item.lots)}）` : `第 ${item.time} 秒：${seatName(item.victim)}的${side}被市場強平（${btc(item.lots)}）`));
    }
    for (const duel of review.duels) {
      battle.append(el("li", "", `${seatName(duel.taker)}吃了${seatName(duel.maker)}的掛單 ${btc(duel.lots)}`));
    }
    const liquidated = market.stats.liquidatedLong + market.stats.liquidatedShort;
    battle.append(el("li", "", `這局共有 ${btc(liquidated)} 的槓桿散戶被強平。`));
  }
  const hostSeat = state.seats.find((seat) => seat.host);
  const host = hostSeat?.id === state.you || (hostSeat && !hostSeat.connected && state.seats.find((seat) => !seat.bot && seat.connected)?.id === state.you);
  $("rematch").hidden = !host;
  $("rematch-note").textContent = host ? "" : "等房主按「再來一局」。";
  if (!$("result").open) $("result").showModal();
}

$("rematch").addEventListener("click", () => { send({ type: "rematch" }); $("result").close(); });
$("result-leave").addEventListener("click", leaveRoom);
$("result").addEventListener("close", () => { if (state.status === "lobby" || state.status === "finished") { renderLobby(); show("lobby"); } });

/* ---------- Start ---------- */

$("entry-name").value = store.get(NAME_KEY) ?? "";
const initial = roomFromUrl();
// An invite link skips straight to the room once this browser has a name; otherwise ask first.
if (initial && store.get(NAME_KEY)) {
  state.code = initial;
  connect();
  renderLobby();
  show("lobby");
} else {
  if (initial) {
    $("join-code").value = initial;
    $("entry-error").textContent = `你被邀請加入房間 ${initial}，輸入名字後按「加入」。`;
  }
  show("entry");
}
requestAnimationFrame(frame);
