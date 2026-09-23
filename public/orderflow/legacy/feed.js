import { aggregate, metrics } from "../engine.js";

export class BybitSession {
  constructor(onFrame, onStatus) {
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.active = false;
    this.epoch = 0;
  }
  reset() {
    this.bids = new Map();
    this.asks = new Map();
    this.ready = false;
    this.update = 0;
    this.trades = [];
    this.ids = new Set();
    this.ticker = {};
    this.history = [];
    this.liquidations = [];
    this.buy = 0;
    this.sell = 0;
    this.value = 0;
    this.lastBook = 0;
    this.lastTicker = 0;
    this.lastTrade = 0;
    this.started = Date.now();
    this.lastSample = 0;
  }
  connect(symbol = "BTCUSDT") {
    this.stop();
    this.symbol = symbol;
    this.active = true;
    this.attempts = 0;
    this.open();
  }
  open() {
    if (!this.active) return;
    this.reset();
    const epoch = ++this.epoch;
    this.onStatus("connecting", "連接 Bybit 公開行情中…");
    const ws = new WebSocket("wss://stream.bybit.com/v5/public/linear");
    this.ws = ws;
    const timer = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) ws.close();
    }, 12000);
    ws.onopen = () => {
      clearTimeout(timer);
      this.syncTimer = setTimeout(() => {
        if (!this.ready || !this.lastTicker) ws.close();
      }, 12000);
      ws.send(
        JSON.stringify({
          op: "subscribe",
          args: [
            `orderbook.50.${this.symbol}`,
            `publicTrade.${this.symbol}`,
            `tickers.${this.symbol}`,
            `allLiquidation.${this.symbol}`,
          ],
        }),
      );
      this.ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ op: "ping" }));
      }, 20000);
      this.paint = setInterval(() => {
        if (!this.ready) return;
        const now = Date.now(),
          stale = now - this.lastBook > 15000 || now - this.lastTicker > 15000;
        if (!stale) this.attempts = 0;
        this.onStatus(
          stale ? "stale" : "live",
          stale ? "資料已過期 · 暫停紙上成交" : `${this.symbol} · 公開即時行情`,
        );
        const frame = this.frame();
        if (now - this.lastSample >= 1000) {
          this.history.push({
            time: now,
            price: frame.price,
            cvd: frame.cvd,
            oi: frame.oi,
            volume: frame.volume,
            bids: frame.bids.slice(0, 12),
            asks: frame.asks.slice(0, 12),
          });
          this.history = this.history.slice(-120);
          this.lastSample = now;
        }
        this.onFrame({ ...frame, stale });
      }, 300);
    };
    ws.onmessage = (event) => {
      if (epoch !== this.epoch) return;
      try {
        this.ingest(JSON.parse(event.data));
      } catch {
        this.onStatus("error", "行情訊息無法解析，正在重新同步");
        ws.close();
      }
    };
    ws.onerror = () =>
      this.onStatus(
        "error",
        "目前無法連接 Bybit，將自動重試；教學模式仍可使用。",
      );
    ws.onclose = () => {
      clearTimeout(timer);
      if (epoch !== this.epoch) return;
      clearInterval(this.ping);
      clearInterval(this.paint);
      clearTimeout(this.syncTimer);
      this.ready = false;
      if (this.active) {
        this.onStatus("disconnected", "連線中斷 · 重連將重新起算 CVD");
        this.retry = setTimeout(
          () => this.open(),
          Math.min(15000, 1500 * 2 ** this.attempts++),
        );
      }
    };
  }
  ingest(msg) {
    if (msg.op === "subscribe" && msg.success === false)
      throw Error("Subscription rejected");
    if (!msg.topic) return;
    const d = msg.data,
      now = Date.now();
    if (msg.topic.startsWith("orderbook.")) {
      if (msg.type === "snapshot" || d.u === 1) {
        this.bids.clear();
        this.asks.clear();
        this.ready = true;
        this.update = 0;
      }
      if (!this.ready || Number(d.u) <= this.update) return;
      for (const [rows, map] of [
        [d.b, this.bids],
        [d.a, this.asks],
      ])
        for (const [p, q] of rows || []) {
          const price = Number(p),
            size = Number(q);
          if (
            !Number.isFinite(price) ||
            !Number.isFinite(size) ||
            price <= 0 ||
            size < 0
          )
            throw Error("Invalid book");
          if (size === 0) map.delete(price);
          else map.set(price, size);
        }
      this.update = Number(d.u);
      this.lastBook = now;
    } else if (msg.topic.startsWith("publicTrade.")) {
      for (const t of d) {
        if (this.ids.has(t.i)) continue;
        const size = Number(t.v),
          price = Number(t.p);
        if (
          !(size > 0 && price > 0) ||
          !Number.isFinite(size * price) ||
          !["Buy", "Sell"].includes(t.S)
        )
          continue;
        this.ids.add(t.i);
        if (this.ids.size > 20000)
          this.ids.delete(this.ids.values().next().value);
        const side = t.S === "Buy" ? "buy" : "sell";
        this[side] += size;
        this.value += size * price;
        this.trades.push({ id: t.i, time: Number(t.T), price, size, side });
        this.lastTrade = now;
      }
      this.trades = this.trades.slice(-5000);
    } else if (msg.topic.startsWith("tickers.")) {
      if (msg.type === "snapshot") this.ticker = {};
      Object.assign(this.ticker, d);
      this.lastTicker = now;
    } else if (msg.topic.startsWith("allLiquidation.")) {
      this.liquidations.unshift(
        ...d.map((t) => ({
          side: t.S === "Buy" ? "long" : "short",
          size: Number(t.v),
          bankruptcy: Number(t.p),
          time: Number(t.T),
        })),
      );
      this.liquidations = this.liquidations.slice(0, 30);
    }
  }
  frame() {
    const levels = (map, dir) =>
      [...map]
        .map(([price, size]) => ({ price, size, hidden: 0, own: 0 }))
        .sort((a, b) => dir * (a.price - b.price))
        .slice(0, 50);
    const bids = levels(this.bids, -1),
      asks = levels(this.asks, 1),
      t = this.ticker,
      volume = this.buy + this.sell;
    const bid = bids.slice(0, 10).reduce((s, r) => s + r.size, 0),
      ask = asks.slice(0, 10).reduce((s, r) => s + r.size, 0);
    const oi =
      t.singleOpenInterest !== undefined
        ? Number(t.singleOpenInterest)
        : t.openInterest !== undefined
          ? Number(t.openInterest) / 2
          : null;
    return {
      price:
        Number(t.lastPrice) || this.trades.at(-1)?.price || bids[0]?.price || 0,
      mark: Number(t.markPrice) || null,
      index: Number(t.indexPrice) || null,
      funding: t.fundingRate === undefined ? null : Number(t.fundingRate),
      oi,
      oiBasis:
        t.singleOpenInterest !== undefined
          ? "singleOpenInterest"
          : "openInterest ÷ 2",
      volume,
      cvd: this.buy - this.sell,
      delta: metrics(this.trades.filter((t) => t.time >= Date.now() - 10000))
        .cvd,
      buy: this.buy,
      sell: this.sell,
      vwap: volume ? this.value / volume : null,
      bids,
      asks,
      trades: this.trades.slice(-600),
      profile: aggregate(this.trades, this.symbol === "BTCUSDT" ? 5 : 0.5),
      history: this.history,
      events: [],
      ownOrders: [],
      imbalance: bid + ask ? (bid - ask) / (bid + ask) : 0,
      liquidations: this.liquidations,
      source: "Bybit 公開主網",
      unit: this.symbol === "BTCUSDT" ? "BTC" : "ETH",
      time: Date.now(),
      started: this.started,
      lastBook: this.lastBook,
      lastTicker: this.lastTicker,
      bookVersion: this.update,
    };
  }
  stop() {
    this.active = false;
    this.epoch++;
    clearTimeout(this.retry);
    clearTimeout(this.syncTimer);
    clearInterval(this.ping);
    clearInterval(this.paint);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
  }
}

export function recordingFrame(f) {
  return {
    price: f.price,
    oi: f.oi,
    cvd: f.cvd,
    volume: f.volume,
    vwap: f.vwap,
    delta: f.delta,
    index: f.index,
    funding: f.funding,
    unit: f.unit,
    time: f.time,
    bids: f.bids.slice(0, 20),
    asks: f.asks.slice(0, 20),
    trades: f.trades.slice(-100),
  };
}
export function parseRecording(text) {
  if (text.length > 10000000) throw Error("檔案超過 10 MB。");
  const data = JSON.parse(text);
  if (
    data.format !== "metabear-orderflow-v1" ||
    !Array.isArray(data.frames) ||
    data.frames.length < 2 ||
    data.frames.length > 300
  )
    throw Error("需要 2–300 個取樣快照的 Orderflow 錄製檔。");
  const num = (x, positive = false) => {
    if (
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      Math.abs(x) > 1e15 ||
      (positive && x <= 0)
    )
      throw Error("錄製檔包含無效數值。");
    return x;
  };
  const nullable = (x) => (x === null ? null : num(x));
  const history = [];
  let lastTime = 0;
  return data.frames.map((f) => {
    const time = num(f.time, true);
    if (time < lastTime) throw Error("錄製時間必須依序排列。");
    lastTime = time;
    const rows = (list) => {
      if (!Array.isArray(list) || !list.length || list.length > 50)
        throw Error("無效的訂單簿。");
      return list.map((r) => ({
        price: num(r.price, true),
        size: num(r.size, true),
        own: 0,
        hidden: 0,
      }));
    };
    if (
      !["BTC", "ETH"].includes(f.unit) ||
      !Array.isArray(f.trades) ||
      f.trades.length > 600
    )
      throw Error("無效的商品或成交資料。");
    if (f.unit !== data.frames[0].unit) throw Error("錄製檔不能混合商品。");
    const trades = f.trades.map((t) => {
      if (!["buy", "sell"].includes(t.side)) throw Error("無效的成交方向。");
      return {
        side: t.side,
        price: num(t.price, true),
        size: num(t.size, true),
        time: num(t.time),
      };
    });
    const bids = rows(f.bids).sort((a, b) => b.price - a.price),
      asks = rows(f.asks).sort((a, b) => a.price - b.price);
    if (bids[0].price >= asks[0].price) throw Error("錄製訂單簿買賣價交叉。");
    const bidSize = bids.slice(0, 10).reduce((sum, r) => sum + r.size, 0);
    const askSize = asks.slice(0, 10).reduce((sum, r) => sum + r.size, 0);
    const frame = {
      price: num(f.price, true),
      oi: nullable(f.oi),
      cvd: num(f.cvd),
      volume: num(f.volume),
      vwap: nullable(f.vwap),
      delta: num(f.delta),
      index: nullable(f.index),
      funding: nullable(f.funding),
      time,
      bids,
      asks,
      trades,
      profile: aggregate(trades, f.unit === "BTC" ? 5 : 0.5),
      source: "Bybit 取樣回放",
      unit: f.unit,
      ownOrders: [],
      events: [],
      liquidations: [],
      imbalance: (bidSize - askSize) / (bidSize + askSize),
    };
    history.push({
      time,
      price: frame.price,
      cvd: frame.cvd,
      oi: frame.oi,
      volume: frame.volume,
      bids: bids.slice(0, 12),
      asks: asks.slice(0, 12),
    });
    frame.history = history.slice(-120);
    return frame;
  });
}
