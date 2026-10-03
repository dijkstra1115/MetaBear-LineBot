// Messages between a Flow Arena room and its players.
//
// The room is a relay with a clock: it stamps every trading action in arrival order and sends a
// tick once a second. Every browser (and the room itself) runs the same deterministic engine from
// the same seed, so applying the same stream in the same order gives everyone the same market.
// Nothing here trusts the client: actions are normalized before anyone applies them.
import { ARENA_LEVERAGES } from "./flow-arena-engine.js";

export const ARENA_PROTOCOL = 1;
export const ARENA_ROOM_SIZE = 4;
export const ARENA_CODE_LENGTH = 6;
// No 0/O or 1/I, so a code read out loud or typed from a screenshot comes out right.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ARENA_CODE = new RegExp(`^[${CODE_ALPHABET}]{${ARENA_CODE_LENGTH}}$`);
export const ARENA_ACTIONS_PER_SECOND = 10;
export const ARENA_BOT_LEVELS = ["rookie", "skilled", "expert"];

export function newRoomCode(random = Math.random) {
  let code = "";
  for (let i = 0; i < ARENA_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

export function cleanName(name) {
  const text = String(name ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 18);
  return text || "匿名交易者";
}

const isLots = (value) => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000;
const isPrice = (value) => Number.isSafeInteger(value) && value >= 100 && value <= 100_000_000;
const isLevel = (value) => value == null || (Number.isFinite(value) && value > 0 && value < 1_000_000);

// Returns clean arguments for a trading action, or null if the action is malformed.
export function normalizeAction(op, args) {
  if (!Array.isArray(args)) return null;
  switch (op) {
    case "submit": {
      const [side, type, lots, limit, options] = args;
      if (!["buy", "sell"].includes(side) || !["market", "limit"].includes(type) || !isLots(lots)) return null;
      if (type === "limit" ? !isPrice(limit) : limit != null) return null;
      return [side, type, lots, type === "limit" ? limit : null, { reduceOnly: Boolean(options?.reduceOnly) }];
    }
    case "close":
    case "cancelAll":
      return [];
    case "closePart":
      return [0.25, 0.5].includes(args[0]) ? [args[0]] : null;
    case "cancel":
      return Number.isSafeInteger(args[0]) && args[0] > 0 ? [args[0]] : null;
    case "setLeverage":
      return ARENA_LEVERAGES.includes(args[0]) ? [args[0]] : null;
    case "setProtection":
      return isLevel(args[0]) && isLevel(args[1]) ? [args[0] ?? null, args[1] ?? null] : null;
    default:
      return null;
  }
}

// Applies an already-normalized action for one trader. Returns the engine's result: an object
// with ok, an error string, or null for success, depending on the call.
export function performAction(run, traderId, op, args) {
  const trader = run.trader(traderId);
  if (!trader || run.finished) return { ok: false, error: "無法下單" };
  switch (op) {
    case "submit": return trader.submit(...args);
    case "close": return trader.close();
    case "closePart": return trader.closePart(args[0]);
    case "cancel": return { ok: trader.cancel(args[0]) };
    case "cancelAll": return { ok: true, count: trader.cancelAll() };
    case "setLeverage": { const error = trader.setLeverage(args[0]); return error ? { ok: false, error } : { ok: true }; }
    case "setProtection": { const error = trader.setProtection(args[0], args[1]); return error ? { ok: false, error } : { ok: true }; }
    default: return { ok: false, error: "未知的指令" };
  }
}

// A cheap fingerprint of the market so the room can tell a browser that drifted apart.
export function runChecksum(run) {
  let hash = (run.market.last ^ run.market.trades ^ (run.time << 8)) >>> 0;
  for (const trader of run.traders) {
    hash = Math.imul(hash ^ (trader.account.position | 0), 2654435761) >>> 0;
    hash = Math.imul(hash ^ Math.round(trader.account.balance), 2246822519) >>> 0;
  }
  return hash;
}

// Everyone who trades the room's market, in seat order: people first, then computer seats.
export function roomTraders(seats) {
  return seats.map((seat) => ({ id: seat.id, name: seat.name }));
}
