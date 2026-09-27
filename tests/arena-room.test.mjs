import test from "node:test";
import assert from "node:assert/strict";
import { ArenaRoomCore } from "../src/arena-room.js";
import { ArenaReplica } from "../public/orderflow/arena-replica.js";
import { newRoomCode, normalizeAction, runChecksum, ARENA_CODE } from "../public/orderflow/arena-protocol.js";

// A fake transport: each connection records what the room sent it, and can keep a replica.
function setup(seed = 7) {
  let state = seed;
  const random = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const inbox = new Map();
  const room = new ArenaRoomCore({ code: "ABCDEF", random, send: (connection, message) => inbox.get(connection).push(structuredClone(message)) });
  const connect = (name, token = `${name}-token-0123456789`) => {
    const connection = { name };
    inbox.set(connection, []);
    const seat = room.join(connection, { name, token });
    return { connection, seat, messages: () => inbox.get(connection) };
  };
  return { room, connect, inbox };
}

// Feeds every message a player received into its own replica, in order.
function replay(player) {
  let replica = null;
  let you = null;
  for (const message of player.messages()) {
    if (message.type === "welcome") you = message.you;
    else if (message.type === "start" || message.type === "sync") replica = new ArenaReplica(message, you);
    else if (replica) replica.apply(message);
  }
  return replica;
}

test("room codes avoid look-alike characters and actions are normalized", () => {
  for (let i = 0; i < 50; i++) assert.match(newRoomCode(), ARENA_CODE);
  assert.equal(ARENA_CODE.test("ABC0EF"), false);
  assert.deepEqual(normalizeAction("submit", ["buy", "market", 1000, null, { reduceOnly: 1 }]), ["buy", "market", 1000, null, { reduceOnly: true }]);
  assert.equal(normalizeAction("submit", ["buy", "market", -5, null]), null);
  assert.equal(normalizeAction("submit", ["buy", "limit", 1000, null]), null);
  assert.equal(normalizeAction("closePart", [0.3]), null);
  assert.equal(normalizeAction("setLeverage", [7]), null);
  assert.equal(normalizeAction("eval", []), null);
});

test("the first player hosts, the room holds four seats, and the host role moves on", () => {
  const { room, connect } = setup();
  const alice = connect("Alice");
  const bob = connect("Bob");
  assert.equal(alice.seat.host, true);
  assert.equal(bob.seat.host, false);
  assert.equal(room.message(bob.connection, { type: "addBot", level: "rookie" }), false, "only the host adds computer seats");
  assert.equal(room.message(alice.connection, { type: "addBot", level: "rookie" }), true);
  assert.equal(room.message(alice.connection, { type: "addBot", level: "expert" }), true);
  const late = connect("Carol");
  assert.equal(late.seat, null);
  assert.equal(late.messages().at(-1).type, "error");
  room.message(alice.connection, { type: "leave" });
  assert.equal(room.host().id, bob.seat.id, "leaving on purpose hands the room over");
});

test("a dropped connection keeps its seat and host role; the next player online can still start", () => {
  const { room, connect } = setup();
  const alice = connect("Alice");
  const bob = connect("Bob");
  room.leave(alice.connection);
  assert.equal(room.seats.length, 2, "a refresh does not free the seat");
  assert.equal(room.host().id, alice.seat.id);
  const back = connect("Alice");
  assert.equal(back.seat.id, alice.seat.id);
  assert.equal(back.seat.host, true);
  room.leave(back.connection);
  room.message(bob.connection, { type: "addBot", level: "rookie" });
  assert.equal(room.message(bob.connection, { type: "start" }), true, "an offline host does not block the room");
  assert.deepEqual(room.run.traders.map((trader) => trader.name), ["Bob", room.seats[1].name], "offline players sit this round out");
});

test("every player's replica stays identical to the room through a full round with bots", () => {
  const { room, connect } = setup(11);
  const alice = connect("Alice");
  const bob = connect("Bob");
  room.message(alice.connection, { type: "addBot", level: "rookie" });
  room.message(alice.connection, { type: "addBot", level: "expert" });
  assert.equal(room.message(alice.connection, { type: "start" }), true);
  room.begin();
  for (let second = 0; second < 120; second++) {
    if (second === 5) room.message(alice.connection, { type: "action", op: "submit", args: ["buy", "market", 1000, null, {}] });
    if (second === 6) room.message(bob.connection, { type: "action", op: "setLeverage", args: [10] });
    if (second === 7) room.message(bob.connection, { type: "action", op: "submit", args: ["sell", "limit", 800, Math.round(room.run.market.last * 1.004), {}] });
    if (second === 12) room.message(alice.connection, { type: "action", op: "close", args: [] });
    room.tick();
  }
  assert.equal(room.status, "finished");
  const end = alice.messages().find((message) => message.type === "end");
  for (const player of [alice, bob]) {
    const replica = replay(player);
    assert.equal(replica.desync, null, `${player.connection.name} drifted`);
    assert.equal(replica.run.finished, true);
    assert.equal(runChecksum(replica.run), end.hash);
    assert.deepEqual(replica.run.standings.map((row) => [row.id, row.score, row.roi]), end.standings.map((row) => [row.id, row.score, row.roi]));
  }
  const botActions = alice.messages().filter((message) => message.type === "action" && message.trader !== "s1" && message.trader !== "s2");
  assert.ok(botActions.length > 2, "computer seats trade through the same relay");
});

test("a player who reconnects mid-round rebuilds the same market from the room's log", () => {
  const { room, connect } = setup(5);
  const alice = connect("Alice");
  room.message(alice.connection, { type: "addBot", level: "skilled" });
  room.message(alice.connection, { type: "start" });
  room.begin();
  for (let second = 0; second < 40; second++) {
    if (second === 10) room.message(alice.connection, { type: "action", op: "submit", args: ["sell", "market", 1000, null, {}] });
    room.tick();
  }
  room.leave(alice.connection);
  for (let second = 0; second < 10; second++) room.tick();
  const back = connect("Alice", "Alice-token-0123456789");
  assert.equal(back.seat.id, "s1", "the token gets the same seat back");
  for (let second = 0; second < 5; second++) room.tick();
  const replica = replay(back);
  assert.equal(replica.desync, null);
  assert.equal(replica.run.time, room.run.time);
  assert.equal(runChecksum(replica.run), runChecksum(room.run));
});

test("malformed, early and too-fast actions are rejected without reaching anyone", () => {
  const { room, connect } = setup(3);
  const alice = connect("Alice");
  const bob = connect("Bob");
  room.message(alice.connection, { type: "action", op: "submit", args: ["buy", "market", 1000, null, {}] });
  assert.equal(bob.messages().some((message) => message.type === "action"), false, "nothing trades before the round");
  room.message(alice.connection, { type: "start" });
  room.begin();
  room.message(alice.connection, { type: "action", op: "submit", args: ["buy", "market", "lots", null, {}] });
  assert.equal(alice.messages().at(-1).type, "rejected");
  for (let i = 0; i < 12; i++) room.message(bob.connection, { type: "action", op: "cancelAll", args: [] });
  const relayed = bob.messages().filter((message) => message.type === "action" && message.trader === "s2").length;
  assert.equal(relayed, 10, "ten actions a second at most");
  assert.equal(bob.messages().at(-1).error, "操作太快了，請稍等一下");
});
