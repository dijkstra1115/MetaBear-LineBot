import test from "node:test";
import assert from "node:assert/strict";
import { createAudioTransport } from "../public/orderflow/motion/audio-transport.js";
class Audio extends EventTarget {
  _time = 0;
  writes = [];
  readyState = 4;
  seeking = false;
  paused = true;
  ended = false;
  duration = 30;
  muted = false;
  allowed = true;
  playCalls = 0;
  get seekable() {
    return { length: 1, start: () => 0, end: () => (this.allowed ? 30 : 0) };
  }
  get currentTime() {
    return this._time;
  }
  set currentTime(t) {
    this.writes.push(t);
    this._time = t;
    this.seeking = true;
  }
  play() {
    this.playCalls++;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  settle() {
    this.seeking = false;
    this.dispatchEvent(new Event("seeked"));
  }
}
test("audio clock follows playback and buffering without repeated position writes", () => {
  const audio = new Audio();
  const transport = createAudioTransport(audio, () => assert.fail());
  transport.start(10);
  assert.deepEqual(audio.writes, [10]);
  assert.equal(audio.muted, true);
  assert.equal(transport.time(10, 0.1, 40), 10);
  audio.settle();
  assert.equal(audio.muted, false);
  for (let i = 0; i < 1000; i++) assert.equal(transport.time(10, 0.1, 40), 10);
  audio._time = 12.7;
  assert.equal(transport.time(10, 0.1, 40), 12.7);
  assert.deepEqual(audio.writes, [10]);
  transport.pause();
});
test("metadata and seekability gate initial seek while preserving immediate gesture play", () => {
  const audio = new Audio();
  audio.readyState = 0;
  audio.allowed = false;
  const transport = createAudioTransport(audio, () => assert.fail());
  transport.start(10);
  assert.equal(audio.playCalls, 1);
  assert.equal(audio.muted, true);
  assert.deepEqual(audio.writes, []);
  audio.readyState = 4;
  audio.dispatchEvent(new Event("canplay"));
  assert.deepEqual(audio.writes, []);
  audio.allowed = true;
  audio.dispatchEvent(new Event("progress"));
  assert.deepEqual(audio.writes, [10]);
  audio.settle();
  assert.equal(audio.muted, false);
  transport.pause();
});
test("failed seek stops sound instead of entering a correction loop", () => {
  const audio = new Audio();
  let failures = 0;
  const transport = createAudioTransport(audio, () => failures++);
  transport.start(10);
  audio._time = 0;
  audio.settle();
  for (let i = 0; i < 100; i++) audio.dispatchEvent(new Event("progress"));
  assert.equal(failures, 1);
  assert.equal(audio.paused, true);
  assert.deepEqual(audio.writes, [10]);
});
test("pause invalidates delayed play rejection; resume and rapid seek choose newest target", async () => {
  const audio = new Audio();
  let reject;
  audio.play = () =>
    new Promise((_, r) => {
      reject = r;
    });
  const transport = createAudioTransport(audio, () => assert.fail());
  transport.start(10);
  transport.pause();
  reject(new Error("aborted"));
  await Promise.resolve();
  audio.play = () => Promise.resolve();
  transport.start(15);
  transport.seek(20);
  audio.settle();
  assert.equal(transport.time(15, 0.1, 40), 20);
  assert.equal(audio.muted, false);
  transport.pause();
});
test("replay seeks to zero; visual tail completes without restarting narration", () => {
  const audio = new Audio();
  const transport = createAudioTransport(audio, () => assert.fail());
  transport.start(30);
  audio.settle();
  assert.equal(audio.playCalls, 0);
  assert.equal(transport.time(30, 0.1, 31), 30.1);
  transport.start(0);
  audio.settle();
  assert.equal(audio.playCalls, 1);
  assert.equal(transport.time(0, 0.1, 31), 0);
  transport.pause();
});
