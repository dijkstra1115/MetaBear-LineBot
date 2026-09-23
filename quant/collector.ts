import { randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, renameSync } from "node:fs";
import {
  RecordingWriter,
  type Category,
  type RecordEvent,
} from "./recording.js";
import { RecordingState } from "./recording-state.js";
import { SYMBOLS } from "./types.js";

if (Number(process.versions.node.split(".")[0]) < 22)
  throw Error("行情收集器需要 Node.js 22+；請先切換 Node 版本。");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const duration = Number(process.env.QUANT_COLLECT_SECONDS ?? 0);
if (!Number.isFinite(duration) || duration < 0)
  throw Error("QUANT_COLLECT_SECONDS must be non-negative");
const writer = new RecordingWriter(
  resolve(root, process.env.QUANT_RAW_DIR ?? "quant/.data/raw"),
);
const state = new RecordingState();
const timers = new Set<ReturnType<typeof setTimeout>>();
const sockets = new Set<WebSocket>();
let stopping = false,
  fatal = false,
  lastError: string | null = null;
const channels: Record<
  string,
  { connected: boolean; subscribed: boolean; lastMessage: number }
> = {};
function save(
  kind: RecordEvent["kind"],
  data: unknown,
  category?: Category,
  connection?: string,
) {
  const event = writer.append(kind, data, { category, connection });
  state.apply(event);
}
function checkpoint(kind: "checkpoint" | "end") {
  writer.append(kind, { hash: state.hash(), state: state.checkpoint() });
  writer.flush();
}
function status() {
  const target = resolve(writer.directory, "status.json");
  writeFileSync(
    target + ".tmp",
    JSON.stringify(
      {
        session: writer.session,
        updatedAt: Date.now(),
        stopping,
        lastError,
        channels,
        books: state.books.size,
        trades: state.trades,
      },
      null,
      2,
    ),
  );
  renameSync(target + ".tmp", target);
}
function fail(error: unknown) {
  if (fatal) return;
  fatal = true;
  stopping = true;
  console.error("錄製失敗；停止連線，不再宣稱資料完整：", error);
  for (const timer of timers) clearTimeout(timer);
  for (const socket of sockets) socket.close();
  // No clean end marker: replay must report an incomplete session.
  process.exit(1);
}
function guarded(work: () => void) {
  try {
    work();
  } catch (error) {
    fail(error);
  }
}
function later(work: () => void, ms: number) {
  const timer = setTimeout(() => {
    timers.delete(timer);
    if (!stopping) guarded(work);
  }, ms);
  timers.add(timer);
}
function connect(category: Category, attempt = 0) {
  if (stopping) return;
  const connection = randomUUID();
  const ws = new WebSocket(`wss://stream.bybit.com/v5/public/${category}`);
  sockets.add(ws);
  const health: {
    connected: boolean;
    subscribed: boolean;
    lastMessage: number;
  } = { connected: false, subscribed: false, lastMessage: Date.now() };
  channels[category] = health;
  let invalidated = false,
    openedAt = 0;
  const invalidate = (reason: string) => {
    if (invalidated || stopping) return;
    invalidated = true;
    health.connected = false;
    health.subscribed = false;
    lastError = `${category}:${reason}`;
    save(
      "gap",
      { reason, lastMessage: health.lastMessage, detectedAt: Date.now() },
      category,
      connection,
    );
    writer.flush();
    console.error(lastError);
  };
  ws.addEventListener("open", () =>
    guarded(() => {
      if (stopping || invalidated) {
        ws.close();
        return;
      }
      openedAt = Date.now();
      health.connected = true;
      health.lastMessage = openedAt;
      save("connection", { endpoint: ws.url }, category, connection);
      const args = SYMBOLS.flatMap((s) =>
        category === "linear"
          ? [`orderbook.50.${s}`, `orderbook.1000.${s}`, `publicTrade.${s}`]
          : [`publicTrade.${s}`],
      );
      ws.send(JSON.stringify({ op: "subscribe", req_id: connection, args }));
    }),
  );
  ws.addEventListener("message", (event) =>
    guarded(() => {
      if (stopping || invalidated) return;
      health.lastMessage = Date.now();
      if (
        typeof event.data !== "string" ||
        Buffer.byteLength(event.data) > 8_000_000
      ) {
        invalidate("invalid_or_oversized_payload");
        ws.close();
        return;
      }
      // Append before parsing so malformed messages and duplicate/late trades remain auditable.
      const record = writer.append("wire", event.data, {
        category,
        connection,
      });
      try {
        state.apply(record);
        const message = JSON.parse(event.data);
        if (message.op === "subscribe" && message.success === true)
          health.subscribed = true;
      } catch (error) {
        invalidate(error instanceof Error ? error.message : "invalid_message");
        ws.close();
      }
    }),
  );
  ws.addEventListener("error", () =>
    guarded(() => {
      invalidate("websocket_error");
      ws.close();
    }),
  );
  ws.addEventListener("close", (event) =>
    guarded(() => {
      sockets.delete(ws);
      if (stopping) return;
      invalidate(`closed:${event.code}:${event.reason}`);
      const next = openedAt && Date.now() - openedAt > 60_000 ? 0 : attempt + 1;
      later(
        () => connect(category, next),
        Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)),
      );
    }),
  );
  const heartbeat = () => {
    if (invalidated || ws.readyState === WebSocket.CLOSED) return;
    const age = Date.now() - health.lastMessage;
    if (
      (!health.subscribed &&
        Date.now() - (openedAt || health.lastMessage) > 15_000) ||
      age > 45_000
    ) {
      invalidate("subscription_or_heartbeat_timeout");
      ws.close();
      return;
    }
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ op: "ping" }));
    later(heartbeat, 10_000);
  };
  later(heartbeat, 10_000);
}
function shutdown() {
  if (stopping) return;
  stopping = true;
  guarded(() => {
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.close();
    for (const health of Object.values(channels)) {
      health.connected = false;
      health.subscribed = false;
    }
    checkpoint("end");
    writer.close();
    status();
    console.log(`錄製完成：${writer.directory}`);
    process.exit(0);
  });
}
guarded(() => {
  save("start", {
    symbols: SYMBOLS,
    depths: [50, 1000],
    categories: ["linear", "spot"],
    source: "bybit-public",
    format: "raw-recording-v1",
    limitations:
      "Price-level aggregated feeds; no individual order IDs, hidden size, or offline backfill.",
  });
  writer.flush();
  console.log(`原始行情保存：${writer.directory}`);
  connect("linear");
  connect("spot");
  const flush = () => {
    writer.flush();
    later(flush, 1000);
  };
  const snapshot = () => {
    checkpoint("checkpoint");
    status();
    later(snapshot, 10_000);
  };
  later(flush, 1000);
  later(snapshot, 10_000);
  if (duration > 0) later(shutdown, duration * 1000);
});
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
