import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  RecordingWriter,
  readRecording,
  type RecordEvent,
} from "./recording.js";
import { RecordingState, verifyRecording } from "./recording-state.js";

const book = (
  type = "snapshot",
  u = 10,
  bids = [["100", "2"]],
  asks = [["101", "3"]],
  depth = 50,
) => ({
  topic: `orderbook.${depth}.BTCUSDT`,
  type,
  cts: 1000 + u,
  data: { s: "BTCUSDT", u, seq: u * 5, b: bids, a: asks },
});
function fixture() {
  const writer = new RecordingWriter(
    mkdtempSync(join(tmpdir(), "quant-recording-")),
  );
  const state = new RecordingState();
  const append = (
    kind: RecordEvent["kind"],
    data: unknown,
    category: "linear" | "spot" = "linear",
    connection = "one",
  ) => {
    const event = writer.append(kind, data, { category, connection });
    state.apply(event);
    return event;
  };
  append("start", {});
  append("connection", {});
  const wire = (
    message: unknown,
    category: "linear" | "spot" = "linear",
    connection = "one",
  ) => append("wire", JSON.stringify(message), category, connection);
  const checkpoint = (kind: "checkpoint" | "end") => {
    writer.append(kind, { hash: state.hash(), state: state.checkpoint() });
    writer.flush();
  };
  return { writer, state, append, wire, checkpoint };
}
test("raw replay reconstructs absolute depth, deletion, separate depth feeds and exact decimals", () => {
  const f = fixture();
  f.wire(book());
  f.wire(book("snapshot", 10, [["100", "9"]], [["101", "8"]], 1000));
  f.checkpoint("checkpoint");
  f.wire(
    book(
      "delta",
      12,
      [
        ["100", "0"],
        ["99.5", "0.123456789012345678"],
      ],
      [],
    ),
  );
  f.wire(book("delta", 11, [["100", "999"]], [])); // old update ignored, jump is legal here
  f.checkpoint("end");
  f.writer.close();
  const report = verifyRecording(readRecording(f.writer.directory));
  assert.equal(report.cleanShutdown, true);
  assert.equal(report.books, 2);
  assert.equal(report.finalHash, f.state.hash());
  assert.deepEqual(
    f.state.books.get("linear:orderbook.50.BTCUSDT")!.bids.get("99.5"),
    "0.123456789012345678",
  );
  assert.equal(
    f.state.books.get("linear:orderbook.1000.BTCUSDT")!.bids.get("100"),
    "9",
  );
});
test("disconnect invalidates book and requires a fresh snapshot; malformed event is retained with a gap", () => {
  const f = fixture();
  f.wire(book());
  f.append("gap", { reason: "disconnect" });
  assert.equal(f.state.books.size, 0);
  f.append("connection", {}, "linear", "two");
  assert.throws(
    () => f.wire(book("delta", 11), "linear", "two"),
    /delta_without_snapshot/,
  );
  f.append("gap", { reason: "delta_without_snapshot" }, "linear", "two");
  f.append("connection", {}, "linear", "three");
  f.wire(book("snapshot", 1), "linear", "three");
  f.checkpoint("end");
  const report = verifyRecording(readRecording(f.writer.directory));
  assert.equal(report.gaps, 2);
  assert.equal(report.invalidMessages, 1);
  assert.equal(report.books, 1);
});
test("same seq can contain several trades; dedup uses trade ID and keeps late raw trades", () => {
  const f = fixture();
  const trade = (i: string) => ({
    topic: "publicTrade.BTCUSDT",
    data: [
      {
        i,
        s: "BTCUSDT",
        S: "Buy",
        T: 1,
        p: "100",
        v: "1",
        seq: 20,
        RPI: false,
        BT: false,
      },
    ],
  });
  f.wire(trade("a"));
  f.wire(trade("b"));
  f.wire(trade("a"));
  f.append("connection", {}, "spot");
  f.wire(trade("a"), "spot");
  f.checkpoint("end");
  const report = verifyRecording(readRecording(f.writer.directory));
  assert.equal(report.trades["linear:publicTrade.BTCUSDT"], 2);
  assert.equal(report.trades["spot:publicTrade.BTCUSDT"], 1);
  assert.equal(report.duplicateTrades, 1);
  assert.equal(
    [...readRecording(f.writer.directory)].filter((e) => e.kind === "wire")
      .length,
    4,
  );
});
test("missing/corrupt segments and interrupted shutdown are detected", () => {
  const f = fixture();
  f.wire(book());
  f.checkpoint("checkpoint");
  assert.equal(
    verifyRecording(readRecording(f.writer.directory)).cleanShutdown,
    false,
  );
  f.checkpoint("end");
  const files = readdirSync(f.writer.directory)
    .filter((v) => v.endsWith(".json.gz"))
    .sort();
  const first = join(f.writer.directory, files[0]);
  const bytes = readFileSync(first);
  const payload = JSON.parse(gunzipSync(bytes).toString());
  payload.events[0].data = { tampered: true };
  writeFileSync(first, gzipSync(JSON.stringify(payload)));
  assert.throws(() => [...readRecording(f.writer.directory)], /integrity/);
  writeFileSync(first, bytes);
  unlinkSync(first);
  assert.throws(() => [...readRecording(f.writer.directory)], /integrity/);
});
test("checkpoint mismatch and invalid wire without gap fail verification", () => {
  const f = fixture();
  f.wire(book());
  f.writer.append("checkpoint", { hash: "incorrect", state: {} });
  f.writer.flush();
  assert.throws(
    () => verifyRecording(readRecording(f.writer.directory)),
    /checkpoint_mismatch/,
  );
  const g = fixture();
  g.writer.append("wire", "not-json", {
    category: "linear",
    connection: "one",
  });
  g.writer.flush();
  assert.throws(
    () => verifyRecording(readRecording(g.writer.directory)),
    /unmarked_invalid_event/,
  );
});
