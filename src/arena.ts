import { DurableObject } from "cloudflare:workers";
import { ArenaRoomCore, ARENA_COUNTDOWN_SECONDS } from "./arena-room.js";
import { ARENA_CODE } from "../public/orderflow/arena-protocol.js";

type Attachment = { token: string; name: string };

// One Flow Arena room per code. WebSockets use the hibernation API so an idle lobby costs
// nothing; during a round the one-second clock keeps the object awake.
export class ArenaRoom extends DurableObject<Env> {
  private core: ArenaRoomCore | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private countdown: ReturnType<typeof setTimeout> | null = null;

  private async room(code: string): Promise<ArenaRoomCore> {
    if (this.core) return this.core;
    const core = new ArenaRoomCore({
      code,
      send: (socket: WebSocket, message: unknown) => {
        try {
          socket.send(JSON.stringify(message));
        } catch {
          // A socket that just closed is cleaned up by webSocketClose.
        }
      },
    });
    core.restore(await this.ctx.storage.get("room"));
    // Sockets that stayed connected while the object slept rejoin their seats.
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (attachment) core.join(socket, attachment);
    }
    this.core = core;
    return core;
  }

  private async save(): Promise<void> {
    if (this.core) await this.ctx.storage.put("room", this.core.snapshot());
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("room") ?? "";
    if (!ARENA_CODE.test(code))
      return new Response("Invalid room code", { status: 400 });
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("Expected WebSocket", { status: 426 });
    await this.ctx.storage.put("code", code);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    await this.room(code);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > 4096) return;
    let message: { type?: string; name?: string; token?: string };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const code = ((await this.ctx.storage.get("code")) as string) ?? "";
    const core = await this.room(code);
    if (message.type === "hello") {
      const attachment = { token: String(message.token ?? ""), name: String(message.name ?? "") };
      if (core.join(socket, attachment)) socket.serializeAttachment(attachment);
      await this.save();
      return;
    }
    const changed = core.message(socket, message);
    if (message.type === "start" && changed) this.scheduleRound(core);
    if (changed) await this.save();
  }

  private scheduleRound(core: ArenaRoomCore): void {
    this.countdown = setTimeout(() => {
      core.begin();
      this.clock = setInterval(() => {
        core.tick();
        if (core.status !== "playing") this.stopClock();
      }, 1000);
    }, ARENA_COUNTDOWN_SECONDS * 1000);
  }

  private stopClock(): void {
    if (this.clock) clearInterval(this.clock);
    if (this.countdown) clearTimeout(this.countdown);
    this.clock = null;
    this.countdown = null;
    void this.save();
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const code = ((await this.ctx.storage.get("code")) as string) ?? "";
    const core = await this.room(code);
    core.leave(socket);
    await this.save();
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket);
  }
}

// Routes /arena/ws?room=CODE to that room's Durable Object.
export async function arenaSocket(request: Request, env: Pick<Env, "ARENA_ROOM">): Promise<Response> {
  const code = new URL(request.url).searchParams.get("room") ?? "";
  if (!ARENA_CODE.test(code))
    return new Response("Invalid room code", { status: 400 });
  if (request.headers.get("Upgrade") !== "websocket")
    return new Response("Expected WebSocket", { status: 426 });
  return env.ARENA_ROOM.getByName(code).fetch(request);
}
