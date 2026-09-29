import { DatabaseSync } from "node:sqlite";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { initialState, step, features } from "./engine.js";
import {
  DEFAULT_CONFIG,
  type Config,
  type Frame,
  type State,
  type Decision,
  type Fill,
  type Event,
} from "./types.js";

export class QuantStore {
  db: DatabaseSync;
  config: Config;
  constructor(path: string, config: Config = DEFAULT_CONFIG) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS frames(id TEXT PRIMARY KEY,symbol TEXT NOT NULL,time INTEGER NOT NULL,body BLOB NOT NULL);
      CREATE INDEX IF NOT EXISTS frames_time ON frames(time);
      CREATE INDEX IF NOT EXISTS frames_symbol_time ON frames(symbol,time);
      CREATE TABLE IF NOT EXISTS samples(id TEXT PRIMARY KEY,symbol TEXT NOT NULL,time INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS samples_symbol_time ON samples(symbol,time);
      CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,time INTEGER NOT NULL,frame_id TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS fills(id TEXT PRIMARY KEY,time INTEGER NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,time INTEGER NOT NULL,body TEXT NOT NULL);`);
    this.db
      .prepare("INSERT OR IGNORE INTO meta VALUES (?,?)")
      .run("config", JSON.stringify(config));
    this.config = JSON.parse(
      String(
        this.db.prepare("SELECT body FROM meta WHERE key=?").get("config")!
          .body,
      ),
    );
    if (JSON.stringify(this.config) !== JSON.stringify(config)) {
      this.db.close();
      throw Error("此帳本使用不同策略設定，請改用新資料檔以保留可重播性");
    }
    this.db
      .prepare("INSERT OR IGNORE INTO meta VALUES (?,?)")
      .run("state", JSON.stringify(initialState(config)));
  }
  state(): State {
    return JSON.parse(
      String(
        this.db.prepare("SELECT body FROM meta WHERE key=?").get("state")!.body,
      ),
    );
  }
  process(f: Frame) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.state();
      if (f.time <= (previous.lastFrame[f.symbol] ?? 0)) {
        this.db.exec("COMMIT");
        return null;
      }
      const result = step(previous, f, this.config),
        x = result.decision?.features ?? features(f);
      this.db
        .prepare("INSERT INTO frames VALUES (?,?,?,?)")
        .run(f.id, f.symbol, f.time, gzipSync(JSON.stringify(f)));
      this.db
        .prepare("UPDATE meta SET body=? WHERE key=?")
        .run(JSON.stringify(result.state), "state");
      if (result.decision)
        this.db
          .prepare("INSERT INTO decisions VALUES (?,?,?,?)")
          .run(
            result.decision.id,
            f.time,
            f.id,
            JSON.stringify(result.decision),
          );
      for (const fill of result.fills)
        this.db
          .prepare("INSERT INTO fills VALUES (?,?,?)")
          .run(fill.id, f.time, JSON.stringify(fill));
      for (const e of result.events)
        this.db
          .prepare("INSERT INTO events VALUES (?,?,?)")
          .run(e.id, f.time, JSON.stringify(e));
      const sample = {
        time: f.time,
        symbol: f.symbol,
        mid:
          f.bids.length && f.asks.length
            ? (f.bids[0][0] + f.asks[0][0]) / 2
            : null,
        equity: result.equity,
        perpDelta: x.perpDelta,
        spotDelta: x.spotDelta,
        imbalance: x.imbalance,
        oi: f.oi,
        session: f.session,
        healthy: f.healthy,
        book: f.bids
          .slice(0, 30)
          .map(([p, q]) => [p, q])
          .concat(f.asks.slice(0, 30).map(([p, q]) => [p, -q])),
      };
      this.db
        .prepare("INSERT INTO samples VALUES (?,?,?,?)")
        .run(f.id, f.symbol, f.time, JSON.stringify(sample));
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  recent<T>(table: "decisions" | "fills" | "events", limit = 100): T[] {
    return this.db
      .prepare(`SELECT body FROM ${table} ORDER BY time DESC LIMIT ?`)
      .all(limit)
      .map((r) => JSON.parse(String(r.body)));
  }
  samples(symbol: string, limit = 360) {
    return this.db
      .prepare(
        "SELECT body FROM samples WHERE symbol=? ORDER BY time DESC LIMIT ?",
      )
      .all(symbol, limit)
      .reverse()
      .map((r) => JSON.parse(String(r.body)));
  }
  latest(symbol: string): Frame | null {
    const row = this.db
      .prepare(
        "SELECT body FROM frames WHERE symbol=? ORDER BY time DESC LIMIT 1",
      )
      .get(symbol);
    return row
      ? JSON.parse(gunzipSync(row.body as Uint8Array).toString())
      : null;
  }
  heatmapFrames(
    symbol: string,
    start: number,
    end: number,
    interval: number,
  ): Frame[] {
    // Select a bounded number of observations before decompressing full records.
    return this.db
      .prepare(
        `SELECT f.body FROM frames f JOIN (
      SELECT MAX(time) AS t FROM frames WHERE symbol=? AND time>=? AND time<?
      GROUP BY CAST((time-?)/? AS INTEGER)
    ) selected ON f.time=selected.t WHERE f.symbol=? ORDER BY f.time`,
      )
      .all(symbol, start, end, start, interval, symbol)
      .map((row) => JSON.parse(gunzipSync(row.body as Uint8Array).toString()));
  }
  detail(id: string) {
    const d = this.db
      .prepare("SELECT frame_id,body FROM decisions WHERE id=?")
      .get(id);
    if (!d) return null;
    const f = this.db
      .prepare("SELECT body FROM frames WHERE id=?")
      .get(d.frame_id!);
    return {
      decision: JSON.parse(String(d.body)),
      input: f ? JSON.parse(gunzipSync(f.body as Uint8Array).toString()) : null,
    };
  }
  *exportFrames() {
    for (const row of this.db
      .prepare("SELECT body FROM frames ORDER BY time,symbol")
      .iterate())
      yield JSON.parse(gunzipSync(row.body as Uint8Array).toString()) as Frame;
  }
  close() {
    this.db.close();
  }
}
