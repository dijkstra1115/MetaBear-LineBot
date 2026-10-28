// Base for exchanges Cloudflare reaches directly besides Bybit (OKX, BingX; docs/ORDERFLOW-MULTI-EXCHANGE.md):
// the exchange's messages come from the Tokyo relay like Bybit's (Collector), or, while the relay is
// away, from one outbound WebSocket kept open by the alarm; trades are summed into prints by taker
// order, with the same storage, queries and detectors as the Bybit Collector.
import { Collector, HEALTH_DOWN_MS, SILENT_MS, type Trade } from "./collector";

type Sock = { ws: WebSocket; last: number; ping: ReturnType<typeof setInterval> | null };

export abstract class DirectCollector extends Collector {
  protected abstract wsUrl: string;
  protected abstract feed: keyof typeof HEALTH_DOWN_MS;
  protected pingText: string | null = null; // sent every 20 s when the exchange wants it
  protected wsState = "idle";
  private sock: Sock | null = null;
  private inbox: Promise<void> = Promise.resolve();
  // Fills of one taker order share a time and side but may arrive in separate messages; they are
  // held until the next order so its print is summed.
  private run: Trade[] = [];

  /** Subscribes after the socket opens. */
  protected abstract subscribe(ws: WebSocket): void;
  /** One parsed exchange message, from the relay or the object's own socket. */
  protected abstract onMessage(m: any): void;
  /** A keep-alive on the object's own socket, answered here; true when the text was one. */
  protected keepAlive(_text: string): boolean {
    return false;
  }
  private onText(text: string) {
    if (!this.keepAlive(text)) this.onMessage(JSON.parse(text));
  }
  /** A message for the exchange (OKX resubscribes a broken book): through the relay or the own socket. */
  protected upstream(msg: unknown) {
    if (this.relay) this.relaySend({ upstream: msg });
    else if (this.sock) this.send(this.sock.ws, msg);
  }
  /** Frame → text; BingX gzips its frames. */
  protected decode(data: string | ArrayBuffer): string | Promise<string> {
    return typeof data === "string" ? data : new TextDecoder().decode(data);
  }
  /** Trades missed while the socket was down, from the exchange's recent-trades REST. */
  protected async backfill(): Promise<void> {}
  /** Readings the exchange does not stream (open interest, funding), read every alarm. */
  protected async pollLive(): Promise<void> {}

  protected queueTrade(tr: Trade) {
    if (this.run.length && (this.run[0].t !== tr.t || this.run[0].sell !== tr.sell)) this.flushRun();
    this.run.push(tr);
  }

  protected flushRun() {
    if (!this.run.length) return;
    this.addTrades(this.run);
    this.run = [];
  }

  protected send(ws: WebSocket, msg: unknown) {
    try {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } catch {}
  }

  private async open() {
    let res: Response;
    try {
      // No AbortSignal: it stays attached to the upgraded socket and would cut it later.
      res = await fetch(this.wsUrl.replace(/^wss:/, "https:"), { headers: { Upgrade: "websocket" } });
    } catch (err) {
      this.wsState = "error";
      this.note("errors", `${this.source} connect: ${err}`);
      return;
    }
    const ws = res.webSocket;
    if (!ws) {
      this.wsState = `rejected ${res.status}`;
      this.note("errors", `${this.source} rejected: HTTP ${res.status}`);
      return;
    }
    ws.accept();
    const sock: Sock = { ws, last: Date.now(), ping: null };
    this.sock = sock;
    this.wsState = "open";
    this.book.reset();
    this.subscribe(ws);
    const ping = this.pingText;
    if (ping) sock.ping = setInterval(() => this.send(ws, ping), 20_000);
    ws.addEventListener("message", (e) => {
      if (this.sock !== sock) return;
      sock.last = Date.now();
      // Decoding may be async (gzip); the chain keeps messages in order.
      this.inbox = this.inbox
        .then(async () => this.onText(await this.decode(e.data as string | ArrayBuffer)))
        .catch((err) => this.note("errors", `${this.source} message: ${err}`));
    });
    const dropped = (why: string) => {
      if (this.sock !== sock) return;
      if (sock.ping) clearInterval(sock.ping);
      this.sock = null;
      this.wsState = `closed ${why}`;
    };
    ws.addEventListener("close", (e) => dropped(String(e.code)));
    ws.addEventListener("error", () => dropped("error"));
    await this.backfill();
  }

  protected override onRelayItem(m: any) {
    this.onMessage(m);
  }

  protected override onRelayOpen() {
    void this.backfill();
  }

  protected override closeDirect() {
    const sock = this.sock;
    if (!sock) return;
    if (sock.ping) clearInterval(sock.ping);
    this.sock = null;
    this.wsState = "relay";
    try {
      sock.ws.close(1000, "relay");
    } catch {}
  }

  protected override async ensureStreams() {
    this.flushRun();
    if (this.relayFed()) {
      this.closeDirect();
      this.checkRelay(Date.now());
      return this.pollLive();
    }
    const sock = this.sock;
    if (sock && Date.now() - sock.last > SILENT_MS) {
      this.note("gaps", `${this.source} silent, reconnecting`);
      if (sock.ping) clearInterval(sock.ping);
      this.sock = null;
      try {
        sock.ws.close(1000, "silent");
      } catch {}
    }
    if (!this.sock) await this.open();
    await this.pollLive();
  }

  protected override healthFeeds(now: number): [keyof typeof HEALTH_DOWN_MS, boolean, number][] {
    return [[this.feed, (this.relay != null || this.sock != null) && now - this.lastTradeT < HEALTH_DOWN_MS[this.feed], this.lastTradeT]];
  }

  protected override liveStatus() {
    return { [this.source]: this.relay ? "relay" : this.wsState, lastTrade: this.lastTradeT };
  }

  override publicStatus() {
    const { bybit, okx, ...rest } = super.publicStatus();
    return { ...rest, [this.source]: this.relay ? "relay" : this.wsState, open: this.relay ? ["relay"] : this.sock ? [this.source] : [] };
  }
}
