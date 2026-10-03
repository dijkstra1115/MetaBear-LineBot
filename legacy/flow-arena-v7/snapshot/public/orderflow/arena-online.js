// Friend rooms for the challenge page: the room dialog (enter, lobby) and the connection to a
// room. Game messages go to the page's handlers; the page drives the market from them.
import { ARENA_CODE, ARENA_ROOM_SIZE, cleanName, newRoomCode } from "./arena-protocol.js";

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "metabear-arena-token";
const NAME_KEY = "metabear-flow-arena-handle";
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

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function roomFromUrl() {
  const code = (new URL(location.href).searchParams.get("room") ?? "").toUpperCase();
  return ARENA_CODE.test(code) ? code : null;
}

export function randomRoomCode() {
  return newRoomCode(() => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
}

export const savedName = () => store.get(NAME_KEY) ?? "";

// handlers: start(message, you), game(message), rejected(error), lobby(room), closed(message)
export class ArenaRoomClient {
  constructor(code, handlers) {
    this.code = code;
    this.handlers = handlers;
    this.you = null;
    this.seats = [];
    this.status = "lobby";
    this.retry = 0;
    this.closed = false;
    this.socket = null;
    const url = new URL(location.href);
    url.searchParams.delete("challenge");
    url.searchParams.set("room", code);
    history.replaceState(null, "", url);
    this.connect();
  }

  get link() {
    return `${location.origin}${location.pathname}?room=${this.code}`;
  }

  get me() {
    return this.seats.find((seat) => seat.id === this.you) ?? null;
  }

  // Mirrors the room: the host leads, or the first player online while the host is offline.
  get leads() {
    const host = this.seats.find((seat) => seat.host);
    return Boolean(this.me?.host || (host && !host.connected && this.seats.find((seat) => !seat.bot && seat.connected)?.id === this.you));
  }

  connect() {
    if (this.closed || (this.socket && this.socket.readyState <= 1)) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${location.host}/arena/ws?room=${this.code}`);
    this.socket = socket;
    this.setConnection("連線中…", false);
    socket.addEventListener("open", () => {
      this.retry = 0;
      this.setConnection("已連線", true);
      this.send({ type: "hello", name: savedName(), token: playerToken() });
    });
    socket.addEventListener("message", (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      this.receive(message);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket || this.closed) return;
      this.setConnection("連線中斷，重新連線中…", false);
      setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.retry++));
    });
  }

  send(message) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(message));
  }

  leave() {
    this.send({ type: "leave" });
    this.close();
  }

  close() {
    this.closed = true;
    this.socket?.close();
    this.setConnection("", false);
    const url = new URL(location.href);
    url.searchParams.delete("room");
    history.replaceState(null, "", url);
  }

  setConnection(text, online) {
    $("room-connection").textContent = text;
    $("room-connection").classList.toggle("online", online);
  }

  receive(message) {
    switch (message.type) {
      case "welcome":
        this.you = message.you;
        break;
      case "lobby":
        this.seats = message.seats;
        this.status = message.status;
        renderLobby(this);
        this.handlers.lobby(this);
        break;
      case "start":
      case "sync":
        this.handlers.start(message, this.you);
        break;
      case "action":
      case "tick":
      case "check":
      case "end":
        this.handlers.game(message);
        break;
      case "rejected":
        this.handlers.rejected(message.error ?? "無法下單");
        break;
      case "error":
        if (message.fatal) {
          this.close();
          this.handlers.closed(message.message);
        }
        break;
      default:
        break;
    }
  }
}

export function showRoomEntry(code = "", note = "") {
  $("room-entry").hidden = false;
  $("room-lobby").hidden = true;
  $("room-name").value = savedName();
  $("room-code-input").value = code;
  $("room-error").textContent = note;
  if (!$("room-dialog").open) $("room-dialog").showModal();
}

export function showRoomLobby(room) {
  $("room-entry").hidden = true;
  $("room-lobby").hidden = false;
  renderLobby(room);
  if (!$("room-dialog").open) $("room-dialog").showModal();
}

// Reads the entry form: stores the name and returns a valid code, or shows why not.
export function readEntry(create) {
  store.set(NAME_KEY, cleanName($("room-name").value));
  if (create) return randomRoomCode();
  const code = $("room-code-input").value.trim().toUpperCase();
  if (ARENA_CODE.test(code)) return code;
  $("room-error").textContent = "房號是 6 個英數字，請再確認一次";
  return null;
}

function renderLobby(room) {
  $("room-code").textContent = room.code;
  $("room-line").href = `https://line.me/R/msg/text/?${encodeURIComponent(`來 Flow Arena 跟我對戰！房號 ${room.code}\n${room.link}`)}`;
  const leads = room.leads;
  const list = $("room-seats");
  list.replaceChildren();
  for (let i = 0; i < ARENA_ROOM_SIZE; i++) {
    const seat = room.seats[i];
    const item = el("li", seat ? seat.id === room.you ? "you" : "" : "empty");
    if (!seat) { item.textContent = "空位"; list.append(item); continue; }
    item.append(el("i", seat.connected ? "dot" : "dot off"), el("strong", "", seat.id === room.you ? `${seat.name}（你）` : seat.name));
    if (seat.host) item.append(el("span", "tag host", "房主"));
    if (seat.bot) item.append(el("span", "tag bot", `電腦 · ${LEVEL_LABEL[seat.level] ?? ""}`));
    if (!seat.bot && !seat.connected) item.append(el("span", "tag", "離線"));
    if (leads && seat.id !== room.you && (seat.bot || !seat.connected)) {
      const remove = el("button", "remove", "×");
      remove.type = "button";
      remove.title = "移除";
      remove.dataset.removeSeat = seat.id;
      item.append(remove);
    }
    list.append(item);
  }
  const lobby = room.status === "lobby" || room.status === "finished";
  const ready = room.seats.filter((seat) => seat.bot || seat.connected).length;
  $("room-bots").hidden = !leads || !lobby;
  for (const button of document.querySelectorAll("[data-room-bot]")) button.disabled = room.seats.length >= ARENA_ROOM_SIZE;
  $("room-start").hidden = !leads || !lobby;
  $("room-start").disabled = ready < 2;
  $("room-note").textContent = !lobby ? "對戰進行中…" : leads ? ready < 2 ? "至少要 2 位玩家（可以加電腦）才能開始。" : "人到齊就按開始；離線的玩家不會加入這局。" : "等待房主開始對戰。";
}
