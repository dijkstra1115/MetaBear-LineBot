import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

export type Category = "linear" | "spot";
export interface RecordEvent {
  version: 1;
  session: string;
  ordinal: number;
  receivedAt: number;
  kind: "start" | "connection" | "wire" | "gap" | "checkpoint" | "end";
  category?: Category;
  connection?: string;
  data: unknown;
}
export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Independent gzip segments: a crash cannot corrupt already committed segments. */
export class RecordingWriter {
  readonly session = randomUUID();
  readonly directory: string;
  private ordinal = 0;
  private segment = 0;
  private previous: string | null = null;
  private rows: RecordEvent[] = [];
  private bytes = 0;
  private closed = false;
  constructor(root: string, now = Date.now()) {
    this.directory = join(
      root,
      new Date(now).toISOString().slice(0, 10),
      this.session,
    );
    mkdirSync(this.directory, { recursive: true });
  }
  append(
    kind: RecordEvent["kind"],
    data: unknown,
    context: { category?: Category; connection?: string } = {},
    receivedAt = Date.now(),
  ): RecordEvent {
    if (this.closed) throw Error("recording_closed");
    const event: RecordEvent = {
      version: 1,
      session: this.session,
      ordinal: ++this.ordinal,
      receivedAt,
      kind,
      ...context,
      data,
    };
    this.rows.push(event);
    this.bytes += Buffer.byteLength(JSON.stringify(event));
    if (this.bytes >= 1_000_000) this.flush();
    return event;
  }
  flush() {
    if (!this.rows.length) return;
    const payload = {
      version: 1,
      session: this.session,
      segment: this.segment,
      previous: this.previous,
      events: this.rows,
    };
    const hash = digest(payload);
    const target = join(
      this.directory,
      `${String(this.segment).padStart(8, "0")}.json.gz`,
    );
    const fd = openSync(target + ".tmp", "wx");
    try {
      writeFileSync(fd, gzipSync(JSON.stringify({ ...payload, hash })));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(target + ".tmp", target);
    this.previous = hash;
    this.segment++;
    this.rows = [];
    this.bytes = 0;
  }
  close() {
    this.flush();
    this.closed = true;
  }
}

/** Validate segment chain and local event order before yielding records. */
export function* readRecording(directory: string): Generator<RecordEvent> {
  const files = readdirSync(directory)
    .filter((f) => /^\d{8,}\.json\.gz$/.test(f))
    .sort();
  if (!files.length) throw Error("empty_recording");
  let previous: string | null = null,
    ordinal = 0,
    session: string | undefined;
  for (const [segment, file] of files.entries()) {
    const { hash, ...payload } = JSON.parse(
      gunzipSync(readFileSync(join(directory, file))).toString(),
    );
    session ??= payload.session;
    if (
      payload.version !== 1 ||
      payload.session !== session ||
      payload.segment !== segment ||
      payload.previous !== previous ||
      digest(payload) !== hash
    )
      throw Error(`segment_integrity_failed:${file}`);
    if (!Array.isArray(payload.events) || !payload.events.length)
      throw Error("empty_segment");
    for (const event of payload.events) {
      if (
        event.version !== 1 ||
        event.session !== session ||
        event.ordinal !== ++ordinal ||
        !Number.isFinite(event.receivedAt)
      )
        throw Error(`event_integrity_failed:${file}`);
      yield event as RecordEvent;
    }
    previous = hash;
  }
}
