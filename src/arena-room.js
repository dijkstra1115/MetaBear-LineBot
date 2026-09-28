// Flow Arena room logic, independent of the transport so it can run in a Durable Object or a test.
//
// The room owns seats, the lobby and the clock. When a round starts it runs its own copy of the
// engine: every player action is checked against that copy, stamped and relayed; computer seats
// act on the room's copy and their actions are relayed the same way; once a second the room
// ticks and tells everyone to tick. Clients never apply their own orders before the room echoes
// them, so every copy sees the same stream in the same order.
import { FlowArenaRun } from "../public/orderflow/flow-arena-engine.js";
import { ARENA_BOTS, ARENA_BOT_ROSTER } from "../public/orderflow/flow-arena-bots.js";
import {
  ARENA_ACTIONS_PER_SECOND,
  ARENA_BOT_LEVELS,
  ARENA_PROTOCOL,
  ARENA_ROOM_SIZE,
  cleanName,
  normalizeAction,
  performAction,
  runChecksum,
} from "../public/orderflow/arena-protocol.js";

export const ARENA_COUNTDOWN_SECONDS = 3;
const CHECK_EVERY = 10;
// Methods a bot may call on its own account; each call becomes a relayed action.
const BOT_ACTIONS = ["submit", "close", "closePart", "cancel", "cancelAll", "setLeverage", "setProtection"];

export class ArenaRoomCore {
  // send(connection, message) delivers one message; connections are opaque to the room.
  constructor({ code, send, random = Math.random }) {
    this.code = code;
    this.send = send;
    this.random = random;
    this.seats = [];
    this.connections = new Map();
    this.status = "lobby";
    this.run = null;
    this.log = [];
    this.seq = 0;
    this.bots = [];
    this.nextSeat = 1;
    this.rates = new Map();
  }

  // Seats and status survive the Durable Object sleeping between rounds.
  snapshot() {
    return { seats: this.seats.map((seat) => ({ ...seat, connected: false })), status: this.status === "finished" ? "finished" : "lobby", nextSeat: this.nextSeat };
  }

  restore(saved) {
    if (!saved) return;
    this.seats = saved.seats ?? [];
    this.status = saved.status ?? "lobby";
    this.nextSeat = saved.nextSeat ?? this.seats.length + 1;
  }

  humans() {
    return this.seats.filter((seat) => !seat.bot);
  }

  host() {
    return this.humans().find((seat) => seat.host) ?? null;
  }

  broadcast(message) {
    for (const connection of this.connections.keys()) this.send(connection, message);
  }

  lobbyMessage() {
    return {
      type: "lobby",
      code: this.code,
      status: this.status,
      seats: this.seats.map(({ id, name, host, connected, bot, level }) => ({ id, name, host: Boolean(host), connected: bot ? true : Boolean(connected), bot: Boolean(bot), level: level ?? null })),
    };
  }

  // A returning token gets its old seat back, even mid-round; a new player needs a free seat in the lobby.
  join(connection, { name, token }) {
    if (typeof token !== "string" || token.length < 16 || token.length > 64) return this.reject(connection, "連線資料不完整，請重新整理頁面");
    let seat = this.seats.find((item) => item.token === token);
    if (!seat) {
      if (this.status !== "lobby" && this.status !== "finished") return this.reject(connection, "這局已經開始了，等下一局再加入");
      if (this.seats.length >= ARENA_ROOM_SIZE) return this.reject(connection, "房間已滿（最多 4 人）");
      seat = { id: `s${this.nextSeat++}`, name: cleanName(name), token, host: !this.host() };
      this.seats.push(seat);
    } else if (name) seat.name = cleanName(name);
    for (const [other, id] of this.connections) if (id === seat.id && other !== connection) this.connections.delete(other);
    seat.connected = true;
    this.connections.set(connection, seat.id);
    this.send(connection, { type: "welcome", protocol: ARENA_PROTOCOL, you: seat.id, code: this.code });
    this.broadcast(this.lobbyMessage());
    if (this.run) this.send(connection, this.syncMessage());
    return seat;
  }

  reject(connection, message) {
    this.send(connection, { type: "error", message, fatal: true });
    return null;
  }

  // A dropped connection keeps its seat (a page refresh should not cost the host role); the
  // seat is freed when the player leaves on purpose, or when a round starts without them.
  leave(connection) {
    const id = this.connections.get(connection);
    this.connections.delete(connection);
    const seat = this.seats.find((item) => item.id === id);
    if (!seat || [...this.connections.values()].includes(id)) return;
    seat.connected = false;
    if (!this.humans().some((item) => item.connected) && !this.run) this.seats = [];
    this.broadcast(this.lobbyMessage());
  }

  quit(connection, seat) {
    this.connections.delete(connection);
    if (this.run) {
      seat.connected = false;
    } else {
      this.seats = this.seats.filter((item) => item !== seat);
      if (seat.host) this.promoteHost();
    }
    this.broadcast(this.lobbyMessage());
    return true;
  }

  promoteHost() {
    for (const seat of this.humans()) seat.host = false;
    const next = this.humans().find((seat) => seat.connected) ?? this.humans()[0];
    if (next) next.host = true;
  }

  // The host runs the lobby; if the host is offline, the first player still online can.
  canLead(seat) {
    if (seat.host) return true;
    const host = this.host();
    return Boolean(host && !host.connected && this.humans().find((item) => item.connected) === seat);
  }

  // Returns true when the room state changed and should be saved.
  message(connection, message) {
    const id = this.connections.get(connection);
    const seat = this.seats.find((item) => item.id === id);
    if (!seat || !message || typeof message !== "object") return false;
    switch (message.type) {
      case "addBot": return this.addBot(seat, message.level);
      case "removeSeat": return this.removeSeat(seat, message.id);
      case "start": return this.start(seat);
      case "rematch": return this.rematch(seat);
      case "leave": return this.quit(connection, seat);
      case "action": this.action(connection, seat, message.op, message.args); return false;
      default: return false;
    }
  }

  addBot(seat, level) {
    if (!this.canLead(seat) || this.status !== "lobby" && this.status !== "finished" || this.seats.length >= ARENA_ROOM_SIZE || !ARENA_BOT_LEVELS.includes(level)) return false;
    const roster = ARENA_BOT_ROSTER[level];
    const taken = new Set(this.seats.map((item) => item.botName));
    const pick = roster.find((item) => !taken.has(item.name)) ?? roster[Math.floor(this.random() * roster.length)];
    this.seats.push({ id: `s${this.nextSeat++}`, name: pick.name, bot: pick.bot, botName: pick.name, leverage: pick.leverage, level });
    this.status = "lobby";
    this.broadcast(this.lobbyMessage());
    return true;
  }

  removeSeat(seat, id) {
    const target = this.seats.find((item) => item.id === id);
    if (!this.canLead(seat) || !target || target === seat || (!target.bot && target.connected) || this.run) return false;
    this.seats = this.seats.filter((item) => item !== target);
    this.broadcast(this.lobbyMessage());
    return true;
  }

  // The host starts once at least two seats are filled. Returns true; the transport then waits
  // ARENA_COUNTDOWN_SECONDS before calling begin().
  start(seat) {
    if (!this.canLead(seat) || this.run) return false;
    // Players who dropped out of the lobby do not get a seat in the round.
    const offline = this.humans().filter((item) => !item.connected);
    if (this.seats.length - offline.length < 2) return false;
    this.seats = this.seats.filter((item) => !offline.includes(item));
    if (!this.host()) this.promoteHost();
    const seed = 1 + Math.floor(this.random() * 0xfffffffe);
    const traders = this.seats.map((item) => ({ id: item.id, name: item.name }));
    this.run = new FlowArenaRun(seed, { traders });
    this.status = "countdown";
    this.log = [];
    this.seq = 0;
    this.bots = this.seats.filter((item) => item.bot).map((item) => ({ id: item.id, bot: item.bot, state: {} }));
    this.startMessage = { type: "start", seed, traders, countdown: ARENA_COUNTDOWN_SECONDS };
    this.broadcast(this.startMessage);
    this.broadcast(this.lobbyMessage());
    for (const item of this.seats.filter((entry) => entry.bot)) this.relay(item.id, "setLeverage", [item.leverage]);
    return true;
  }

  begin() {
    if (this.status !== "countdown") return;
    this.status = "playing";
    this.broadcast(this.lobbyMessage());
  }

  syncMessage() {
    return { ...this.startMessage, type: "sync", log: this.log, status: this.status };
  }

  action(connection, seat, op, args) {
    if (this.status !== "playing" || seat.bot) return;
    const second = this.run.time;
    const rate = this.rates.get(seat.id);
    const count = rate?.second === second ? rate.count + 1 : 1;
    this.rates.set(seat.id, { second, count });
    if (count > ARENA_ACTIONS_PER_SECOND) return this.send(connection, { type: "rejected", op, error: "操作太快了，請稍等一下" });
    const clean = normalizeAction(op, args);
    if (!clean) return this.send(connection, { type: "rejected", op, error: "無效的指令" });
    const result = this.relay(seat.id, op, clean);
    if (!result.accepted) this.send(connection, { type: "rejected", op, error: result.error });
  }

  // Applies an action to the room's copy and, if the engine accepted it, sends it to everyone.
  relay(traderId, op, args) {
    const result = performAction(this.run, traderId, op, args);
    const accepted = result && result.ok !== false;
    if (!accepted) return { accepted, error: result?.error ?? "無法執行" };
    const message = { type: "action", seq: ++this.seq, trader: traderId, op, args };
    this.log.push(message);
    this.broadcast(message);
    return { accepted, result };
  }

  // Computer seats act on what they see, then the market moves one second.
  tick() {
    if (this.status !== "playing") return false;
    for (const bot of this.bots) {
      const trader = this.run.trader(bot.id);
      ARENA_BOTS[bot.bot](this.run, this.botAccount(trader), bot.state);
    }
    this.run.tick();
    const message = { type: "tick", n: this.run.time };
    this.log.push(message);
    this.broadcast(message);
    if (this.run.time % CHECK_EVERY === 0) this.broadcast({ type: "check", n: this.run.time, hash: runChecksum(this.run) });
    if (this.run.finished) this.end();
    return true;
  }

  // Reads go straight to the bot's trader; trading calls are relayed so every copy applies them.
  botAccount(trader) {
    return new Proxy(trader, {
      get: (target, key) => BOT_ACTIONS.includes(key)
        ? (...args) => {
          const clean = normalizeAction(key, args);
          if (!clean) return key === "submit" || key === "close" || key === "closePart" ? { ok: false, error: "invalid" } : "invalid";
          const outcome = this.relay(target.id, key, clean);
          if (key === "setLeverage" || key === "setProtection") return outcome.accepted ? null : outcome.error;
          if (key === "cancel") return outcome.accepted;
          if (key === "cancelAll") return outcome.accepted ? outcome.result.count : 0;
          return outcome.accepted ? outcome.result : { ok: false, error: outcome.error };
        }
        : Reflect.get(target, key),
    });
  }

  end() {
    this.status = "finished";
    this.broadcast({ type: "end", standings: this.run.standings, hash: runChecksum(this.run) });
    this.run = null;
    this.bots = [];
    this.seats = this.seats.filter((seat) => seat.bot || seat.connected);
    if (!this.host()) this.promoteHost();
    this.broadcast(this.lobbyMessage());
  }

  // Back to the lobby after a round. Accepted whenever no round is running, so a room that slept
  // and restored its seats as "lobby" still answers the host.
  rematch(seat) {
    if (!this.canLead(seat) || this.run) return false;
    this.status = "lobby";
    this.broadcast(this.lobbyMessage());
    return true;
  }
}
