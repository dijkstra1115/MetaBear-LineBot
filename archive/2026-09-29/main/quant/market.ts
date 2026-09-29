import { randomUUID } from "node:crypto";
import { projectLiquidity } from "./liquidity.js";
import {
  SYMBOLS,
  type SymbolName,
  type Candle,
  type Flow,
  type Frame,
  type Level,
  type LiquiditySnapshot,
} from "./types.js";

type Category = "linear" | "spot";
type Json = Record<string, unknown>;
const object = (v: unknown): Json =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const number = (v: unknown) =>
  typeof v === "number" || typeof v === "string" ? Number(v) : NaN;
function positive(v: unknown): number {
  const n = number(v);
  if (!Number.isFinite(n) || n <= 0) throw Error("invalid_market_number");
  return n;
}

/** Bybit publishes absolute sizes, not size differences, in each delta. */
export class OrderBook {
  bids = new Map<number, number>();
  asks = new Map<number, number>();
  time = 0;
  update = 0;
  ready = false;
  reset() {
    this.bids.clear();
    this.asks.clear();
    this.ready = false;
    this.update = 0;
    this.time = 0;
  }
  apply(kind: string, data: Json, time: number) {
    const update = number(data.u);
    if (!Number.isFinite(update) || !Number.isFinite(time))
      throw Error("invalid_book_sequence");
    if (kind === "snapshot" || update === 1) this.reset();
    else if (!this.ready || update <= this.update) return;
    const applySide = (map: Map<number, number>, rows: unknown) => {
      if (!Array.isArray(rows)) throw Error("invalid_book_side");
      for (const row of rows) {
        if (!Array.isArray(row)) throw Error("invalid_book_level");
        const price = positive(row[0]),
          qty = number(row[1]);
        if (!Number.isFinite(qty) || qty < 0) throw Error("invalid_book_size");
        if (qty === 0) map.delete(price);
        else map.set(price, qty);
      }
    };
    applySide(this.bids, data.b);
    applySide(this.asks, data.a);
    // The subscription is bounded. Levels leaving the window are not useful for coverage.
    for (const [p] of this.levels("bid").slice(1000)) this.bids.delete(p);
    for (const [p] of this.levels("ask").slice(1000)) this.asks.delete(p);
    this.time = time;
    this.update = update;
    this.ready = true;
  }
  levels(side: "bid" | "ask"): Level[] {
    return [...(side === "bid" ? this.bids : this.asks)].sort((a, b) =>
      side === "bid" ? b[0] - a[0] : a[0] - b[0],
    );
  }
}
export class TradeFlow {
  rows = new Map<number, Flow>();
  seen = new Map<string, number>();
  late = 0;
  lastLossTime = 0;
  private lastCleanup = 0;
  add(trade: Json, received: number) {
    const id = String(trade.i ?? "");
    if (!id || this.seen.has(id)) return;
    const time = positive(trade.T),
      price = positive(trade.p),
      qty = positive(trade.v);
    if (trade.S !== "Buy" && trade.S !== "Sell")
      throw Error("invalid_taker_side");
    // Late data cannot silently revise a previously closed decision window.
    if (
      time < Math.floor((received - 5000) / 60000) * 60000 ||
      received - time > 5000 ||
      time > received + 2000
    ) {
      this.late++;
      this.lastLossTime = received;
      return;
    }
    this.seen.set(id, time);
    const bucket = Math.floor(time / 60000) * 60000;
    const row = this.rows.get(bucket) ?? {
      time: bucket,
      buy: 0,
      sell: 0,
      trades: 0,
    };
    row[trade.S === "Buy" ? "buy" : "sell"] += price * qty;
    row.trades++;
    this.rows.set(bucket, row);
    if (received - this.lastCleanup >= 60000) {
      for (const [key, t] of this.seen)
        if (t < received - 600000) this.seen.delete(key);
      for (const t of this.rows.keys())
        if (t < received - 7200000) this.rows.delete(t);
      this.lastCleanup = received;
    }
  }
  closed(now: number, coverageStart: number): Flow[] {
    const end = Math.floor((now - 5000) / 60000) * 60000;
    const start = Math.max(
      Math.ceil(coverageStart / 60000) * 60000,
      end - 3600000,
    );
    const rows: Flow[] = [];
    for (let t = start; t < end; t += 60000)
      rows.push({
        ...(this.rows.get(t) ?? { time: t, buy: 0, sell: 0, trades: 0 }),
      });
    return rows;
  }
}
interface MarketState {
  book: OrderBook;
  perp: TradeFlow;
  spot: TradeFlow;
  candles: Candle[];
  ticker: Json;
  tickerTime: number;
  oiHistory: { time: number; value: number }[];
  restError: string | null;
  liquidity?: LiquiditySnapshot;
  liquidityError?: string | null;
}
export class BybitFeed {
  session = randomUUID();
  started = Date.now();
  stopped = false;
  markets = new Map<SymbolName, MarketState>();
  connections: Record<
    Category,
    {
      connected: boolean;
      since: number;
      lastMessage: number;
      error: string | null;
    }
  > = {
    linear: {
      connected: false,
      since: Date.now(),
      lastMessage: 0,
      error: null,
    },
    spot: { connected: false, since: Date.now(), lastMessage: 0, error: null },
  };
  private sockets: WebSocket[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  constructor() {
    for (const symbol of SYMBOLS)
      this.markets.set(symbol, {
        book: new OrderBook(),
        perp: new TradeFlow(),
        spot: new TradeFlow(),
        candles: [],
        ticker: {},
        tickerTime: 0,
        oiHistory: [],
        restError: null,
      });
  }
  async start() {
    this.connect("linear");
    this.connect("spot");
    void this.refreshDeep();
    await this.refresh();
  }
  private async refreshDeep() {
    if (this.stopped) return;
    await Promise.all(
      SYMBOLS.map(async (symbol) => {
        const market = this.markets.get(symbol)!;
        try {
          const result = await this.get("full_orderbook", {
            category: "linear",
            symbol,
          });
          const side = (value: unknown): Level[] => {
            if (!Array.isArray(value)) throw Error("深度快照格式錯誤");
            return value.slice(0, 10000).map((row) => {
              if (!Array.isArray(row)) throw Error("深度價位格式錯誤");
              return [positive(row[0]), positive(row[1])];
            });
          };
          const snapshot = projectLiquidity(
            symbol,
            side(result.b),
            side(result.a),
            positive(result.ts),
            "bybit-full-rest",
          );
          if (!snapshot) throw Error("深度快照買賣盤不完整");
          market.liquidity = snapshot;
          market.liquidityError = null;
        } catch (e) {
          market.liquidity = undefined;
          market.liquidityError =
            e instanceof Error ? e.message : "深度快照讀取失敗";
        }
      }),
    );
    // A slow deep-book request never blocks the trading loop or its stop checks.
    if (!this.stopped) {
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        void this.refreshDeep();
      }, 10000);
      this.timers.add(timer);
    }
  }
  stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    for (const ws of this.sockets) ws.close();
  }
  private connect(category: Category, attempt = 0) {
    if (this.stopped) return;
    const ws = new WebSocket(`wss://stream.bybit.com/v5/public/${category}`);
    this.sockets.push(ws);
    const conn = this.connections[category];
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    ws.addEventListener("open", () => {
      conn.connected = true;
      conn.since = Date.now();
      conn.lastMessage = Date.now();
      conn.error = null;
      const args = SYMBOLS.flatMap((s) =>
        category === "linear"
          ? [`orderbook.1000.${s}`, `publicTrade.${s}`, `tickers.${s}`]
          : [`publicTrade.${s}`],
      );
      ws.send(JSON.stringify({ op: "subscribe", args }));
      heartbeat = setInterval(() => {
        if (Date.now() - conn.lastMessage > 45000) {
          conn.error = "串流心跳逾時";
          ws.close();
          return;
        }
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ op: "ping" }));
      }, 20000);
    });
    ws.addEventListener("message", (e) => {
      try {
        if (typeof e.data !== "string" || e.data.length > 2_000_000)
          throw Error("invalid_stream_payload");
        const m = object(JSON.parse(e.data));
        conn.lastMessage = Date.now();
        if (m.success === false)
          throw Error(
            `subscription_rejected:${String(m.ret_msg).slice(0, 120)}`,
          );
        if (typeof m.topic !== "string") return;
        const symbol = m.topic.split(".").at(-1) as SymbolName,
          market = this.markets.get(symbol);
        if (!market) return;
        if (m.topic.startsWith("orderbook."))
          market.book.apply(String(m.type), object(m.data), number(m.ts));
        else if (m.topic.startsWith("publicTrade.") && Array.isArray(m.data)) {
          for (const t of m.data)
            (category === "linear" ? market.perp : market.spot).add(
              object(t),
              Date.now(),
            );
        } else if (m.topic.startsWith("tickers.")) {
          market.ticker =
            m.type === "snapshot"
              ? object(m.data)
              : { ...market.ticker, ...object(m.data) };
          market.tickerTime = number(m.ts);
        }
      } catch (error) {
        conn.error = error instanceof Error ? error.message : "串流資料錯誤";
        ws.close();
      }
    });
    ws.addEventListener("error", () => {
      conn.error = "WebSocket 連線失敗";
      ws.close();
    });
    ws.addEventListener("close", () => {
      clearInterval(heartbeat);
      conn.connected = false;
      conn.since = Date.now();
      if (category === "linear")
        for (const m of this.markets.values()) m.book.reset();
      this.sockets = this.sockets.filter((v) => v !== ws);
      if (!this.stopped) {
        const retry = setTimeout(
          () => {
            this.timers.delete(retry);
            this.connect(
              category,
              Date.now() - conn.lastMessage < 30000 ? 0 : attempt + 1,
            );
          },
          Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)),
        );
        this.timers.add(retry);
      }
    });
  }
  private async get(
    path: string,
    params: Record<string, string>,
  ): Promise<Json> {
    const url = new URL(`https://api.bybit.com/v5/market/${path}`);
    url.search = new URLSearchParams(params).toString();
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) throw Error(`Bybit HTTP ${response.status}`);
    const reader = response.body!.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > (path === "full_orderbook" ? 8_000_000 : 2_000_000)) {
        await reader.cancel();
        throw Error("行情回應過大");
      }
      chunks.push(value);
    }
    const body = object(JSON.parse(Buffer.concat(chunks).toString()));
    if (body.retCode !== 0) throw Error(`Bybit ${String(body.retCode)}`);
    return object(body.result);
  }
  async refresh() {
    await Promise.all(
      SYMBOLS.map(async (symbol) => {
        const market = this.markets.get(symbol)!;
        try {
          const result = await this.get("kline", {
            category: "linear",
            symbol,
            interval: "1",
            limit: "240",
          });
          if (!Array.isArray(result.list)) throw Error("K 線格式錯誤");
          market.candles = result.list
            .map((row) => {
              if (!Array.isArray(row)) throw Error("K 線格式錯誤");
              return {
                time: positive(row[0]),
                open: positive(row[1]),
                high: positive(row[2]),
                low: positive(row[3]),
                close: positive(row[4]),
                volume: number(row[6]),
              };
            })
            .filter((b) => b.time + 60000 <= Date.now())
            .sort((a, b) => a.time - b.time);
          market.restError = null;
        } catch (e) {
          market.restError = e instanceof Error ? e.message : "K 線查詢失敗";
        }
      }),
    );
  }
  frame(symbol: SymbolName, now = Date.now()): Frame {
    const m = this.markets.get(symbol)!,
      issues: string[] = [];
    const oi = number(m.ticker.openInterest),
      mark = number(m.ticker.markPrice);
    if (Number.isFinite(oi) && oi > 0 && now - m.tickerTime < 10000) {
      m.oiHistory.push({ time: now, value: oi });
      m.oiHistory = m.oiHistory.filter((v) => v.time >= now - 900000);
    }
    const base = [...m.oiHistory].reverse().find((v) => v.time <= now - 300000);
    const coverageStart = Math.max(
      this.connections.linear.since,
      this.connections.spot.since,
      this.started,
      m.perp.lastLossTime,
      m.spot.lastLossTime,
    );
    for (const category of ["linear", "spot"] as const) {
      const c = this.connections[category];
      if (!c.connected || now - c.lastMessage > 45000)
        issues.push(`${category === "linear" ? "永續" : "現貨"}串流未連線`);
    }
    if (
      !Number.isFinite(m.tickerTime) ||
      now - m.tickerTime > 10000 ||
      m.tickerTime > now + 2000
    )
      issues.push("OI／報價串流過期");
    if (!m.book.ready) issues.push("等待訂單簿快照");
    if (m.restError) issues.push(m.restError);
    const rate = number(m.ticker.fundingRate),
      next = number(m.ticker.nextFundingTime);
    if (!Number.isFinite(mark) || mark <= 0) issues.push("等待標記價格");
    return {
      id: `${this.session}:${symbol}:${now}`,
      symbol,
      time: now,
      bookTime: m.book.time,
      bids: m.book.levels("bid"),
      asks: m.book.levels("ask"),
      mark: Number.isFinite(mark) ? mark : 0,
      oi: Number.isFinite(oi) ? oi : null,
      fundingRate: Number.isFinite(rate) ? rate : null,
      nextFundingTime: Number.isFinite(next) ? next : null,
      candles: m.candles,
      perp: m.perp.closed(now, coverageStart),
      spot: m.spot.closed(now, coverageStart),
      oiChangePct:
        base && now - base.time < 330000 && Number.isFinite(oi)
          ? (oi / base.value - 1) * 100
          : null,
      coverageStart,
      session: this.session,
      healthy: issues.length === 0,
      issues,
      liquidity: m.liquidity,
      liquidityError: m.liquidityError ?? null,
    };
  }
}
