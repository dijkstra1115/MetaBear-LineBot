import { digest, type RecordEvent } from "./recording.js";

type Book = {
  u: number;
  seq: number;
  cts: number;
  bids: Map<string, string>;
  asks: Map<string, string>;
};
const object = (v: unknown): Record<string, any> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("expected_object");
  return v as Record<string, any>;
};
const integer = (v: unknown) => {
  if (!Number.isSafeInteger(v) || Number(v) < 0) throw Error("invalid_integer");
  return Number(v);
};
const decimal = (v: unknown, zero = false): string => {
  if (
    typeof v !== "string" ||
    !/^\d+(\.\d+)?$/.test(v) ||
    !Number.isFinite(Number(v)) ||
    (zero ? Number(v) < 0 : Number(v) <= 0)
  )
    throw Error("invalid_decimal");
  return v;
};

/** Price-level reconstruction only; does not infer individual orders or cancellations. */
export class RecordingState {
  books = new Map<string, Book>();
  trades: Record<string, number> = {};
  duplicates = 0;
  ignoredUpdates = 0;
  private seen = new Map<string, Set<string>>();
  private connections = new Map<string, string>();
  apply(event: RecordEvent) {
    const category = event.category;
    if (event.kind === "connection" || event.kind === "gap") {
      for (const key of this.books.keys())
        if (key.startsWith(`${category}:`)) this.books.delete(key);
      if (event.kind === "connection")
        this.connections.set(category!, event.connection!);
      else this.connections.delete(category!);
      return;
    }
    if (event.kind !== "wire") return;
    if (!category || this.connections.get(category) !== event.connection)
      throw Error("wire_without_connection");
    const message = object(JSON.parse(String(event.data)));
    if (message.success === false)
      throw Error(`subscription_rejected:${message.ret_msg}`);
    if (typeof message.topic !== "string") return; // acknowledgments/pong are retained too
    const key = `${category}:${message.topic}`;
    if (message.topic.startsWith("orderbook.")) {
      const data = object(message.data),
        u = integer(data.u),
        seq = integer(data.seq),
        cts = integer(message.cts);
      if (
        !/^orderbook\.(50|1000)\.(BTCUSDT|ETHUSDT)$/.test(message.topic) ||
        message.topic.split(".")[2] !== data.s
      )
        throw Error("invalid_book_topic");
      if (message.type !== "snapshot" && message.type !== "delta")
        throw Error("invalid_book_type");
      const reset = message.type === "snapshot" || u === 1;
      let book = this.books.get(key);
      if (!reset && !book) throw Error("delta_without_snapshot");
      if (!reset && book && (u <= book.u || seq < book.seq)) {
        this.ignoredUpdates++;
        return;
      }
      // Regular depth channels do not document u+1 continuity; never infer loss from a jump.
      book = reset ? { u, seq, cts, bids: new Map(), asks: new Map() } : book!;
      for (const [side, rows] of [
        [book.bids, data.b],
        [book.asks, data.a],
      ] as const) {
        if (!Array.isArray(rows)) throw Error("invalid_book_rows");
        for (const row of rows) {
          if (!Array.isArray(row) || row.length !== 2)
            throw Error("invalid_book_row");
          const price = decimal(row[0]),
            qty = decimal(row[1], true);
          if (Number(qty) === 0) side.delete(price);
          else side.set(price, qty);
        }
      }
      book.u = u;
      book.seq = seq;
      book.cts = cts;
      const depth = Number(message.topic.split(".")[1]);
      for (const [side, direction] of [
        [book.bids, -1],
        [book.asks, 1],
      ] as const) {
        const prices = [...side.keys()].sort(
          (a, b) => direction * (Number(a) - Number(b)),
        );
        for (const price of prices.slice(depth)) side.delete(price);
      }
      if (
        book.bids.size &&
        book.asks.size &&
        Math.max(...[...book.bids.keys()].map(Number)) >=
          Math.min(...[...book.asks.keys()].map(Number))
      )
        throw Error("crossed_book");
      this.books.set(key, book);
    } else if (message.topic.startsWith("publicTrade.")) {
      if (!Array.isArray(message.data)) throw Error("invalid_trades");
      const ids = this.seen.get(key) ?? new Set<string>();
      for (const row of message.data) {
        const trade = object(row);
        if (
          typeof trade.i !== "string" ||
          !trade.i ||
          !["Buy", "Sell"].includes(trade.S) ||
          message.topic !== `publicTrade.${trade.s}`
        )
          throw Error("invalid_trade");
        integer(trade.T);
        decimal(trade.p);
        decimal(trade.v);
        if (ids.has(trade.i)) {
          this.duplicates++;
          continue;
        }
        ids.add(trade.i);
        this.trades[key] = (this.trades[key] ?? 0) + 1;
        // Bounded deduplication cache; all raw duplicates remain in the archive.
        if (ids.size > 100_000) ids.delete(ids.values().next().value!);
      }
      this.seen.set(key, ids);
    }
  }
  checkpoint() {
    const books = [...this.books]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({
        key,
        u: b.u,
        seq: b.seq,
        cts: b.cts,
        bids: [...b.bids].sort((a, b) => Number(b[0]) - Number(a[0])),
        asks: [...b.asks].sort((a, b) => Number(a[0]) - Number(b[0])),
      }));
    return {
      books,
      trades: { ...this.trades },
      duplicates: this.duplicates,
      ignoredUpdates: this.ignoredUpdates,
    };
  }
  hash() {
    return digest(this.checkpoint());
  }
}

export function verifyRecording(events: Iterable<RecordEvent>) {
  const state = new RecordingState();
  let count = 0,
    checkpoints = 0,
    gaps = 0,
    errors = 0,
    pendingError: RecordEvent | null = null,
    ended = false;
  for (const event of events) {
    if (ended) throw Error("events_after_end");
    if (++count === 1 && event.kind !== "start") throw Error("missing_start");
    if (pendingError) {
      if (
        event.kind !== "gap" ||
        event.category !== pendingError.category ||
        event.connection !== pendingError.connection
      )
        throw Error("unmarked_invalid_event");
      pendingError = null;
    }
    if (event.kind === "checkpoint" || event.kind === "end") {
      const data = object(event.data);
      if (data.hash !== state.hash() || digest(data.state) !== data.hash)
        throw Error(`checkpoint_mismatch:${event.ordinal}`);
      checkpoints++;
      ended = event.kind === "end";
    } else {
      try {
        state.apply(event);
      } catch (error) {
        if (event.kind !== "wire") throw error;
        errors++;
        pendingError = event;
      }
    }
    if (event.kind === "gap") gaps++;
  }
  if (pendingError) throw Error("unmarked_invalid_event");
  return {
    events: count,
    checkpoints,
    gaps,
    invalidMessages: errors,
    cleanShutdown: ended,
    replayVerified: checkpoints > 0,
    finalHash: state.hash(),
    books: state.books.size,
    trades: state.trades,
    duplicateTrades: state.duplicates,
    note: "Verification covers archived events, not completeness of exchange history. Gaps are not backfilled.",
  };
}
