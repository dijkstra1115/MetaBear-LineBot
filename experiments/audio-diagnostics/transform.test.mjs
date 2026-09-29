import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { instrumentPlayer, diagnosticAudioUrl } from './transform.mjs';
const source = fs.readFileSync(new URL('./player-baseline.js', import.meta.url), 'utf8');
const transformed = instrumentPlayer(source);
test('transport experiment stops at 10, makes only one 20-second seek, then completes', () => {
  let now = 10000;
  const seeks = [];
  const element = () => ({style:{}, setAttribute(){}});
  const ctx = vm.createContext({transportTest:true, diagnosticParams:new URLSearchParams('transport=range'), diagnostic:{}, diagnosticBoot:0, diagnosticLastReport:0, t:10.1, playing:true,
    performance:{now:()=>now}, audio:{currentTime:0,seeking:false,readyState:4}, ranges:()=>[],
    play:element(),range:element(),sound:element(),soundHint:element(),canvas:element(),bigPlay:element(),audioPause(){},
    seek(target){seeks.push(target);ctx.t=target;}
  });
  const block = transformed.slice(transformed.indexOf('  const probe ='), transformed.indexOf('  let diagnosticLastReport'));
  vm.runInContext(block, ctx);
  ctx.runProbe(now);
  assert.equal(ctx.t,10); assert.equal(ctx.playing,false);
  assert.equal(vm.runInContext('probe.phase',ctx),'ready');
  ctx.beginProbe(); ctx.playing = true;
  now=11000; ctx.runProbe(now);
  now=15000; ctx.runProbe(now); ctx.runProbe(now+16);
  now=16000; ctx.audio.currentTime=21; ctx.runProbe(now);
  now=22000; ctx.runProbe(now); ctx.runProbe(now+16);
  assert.deepEqual(seeks,[20]); assert.equal(ctx.playing,false);
  assert.equal(vm.runInContext('probe.phase',ctx),'complete');
  assert.equal(vm.runInContext('probe.commands.length',ctx),2);
  assert.equal(vm.runInContext('probe.samples.length',ctx),5);
});
test('fresh audio URLs differ between loads while normal mode preserves the source URL', () => {
  const source = './motion/audio/btc-wall.m4a';
  const fresh = 'https://preview.metabear.io/audio-test/orderflow/btc-wall.html?cache=fresh';
  const normal = 'https://preview.metabear.io/audio-test/orderflow/btc-wall.html';
  assert.notEqual(diagnosticAudioUrl(source, fresh, 'a'), diagnosticAudioUrl(source, fresh, 'b'));
  assert.equal(new URL(diagnosticAudioUrl(source, fresh, 'a')).pathname, '/orderflow/motion/audio/btc-wall.m4a');
  assert.equal(diagnosticAudioUrl(source, normal, 'a'), diagnosticAudioUrl(source, normal, 'b'));
});
function simulate(mode) {
  let position = 0, writes = 0;
  const audio = { paused: false, get currentTime() { return position; }, set currentTime(t) { writes++; position = t; } };
  const diagnostic = { automaticSeeks: 0, maxFrameMs: 0, slowFrames: 0 };
  const ctx = vm.createContext({ t: 0, D: 54, last: 0, playing: true, muted: false, audio, diagnosticMode: mode, diagnostic, runProbe() {}, reportDiagnostic() {}, paint() {}, audioPause() {}, store: { set() {} }, lesson: { id: 'btc-wall' }, requestAnimationFrame() { return 1; }, raf: 0 });
  vm.runInContext(transformed.slice(transformed.indexOf('  function frame(now) {'), transformed.indexOf('  function start() {')), ctx);
  for (let now = 150; now <= 9900; now += 150) { position += .15; ctx.frame(now); }
  return { writes, diagnostic, visual: ctx.t };
}
test('A reproduces automatic seeks under slow rendering; B performs none with the same visual clock', () => {
  const a = simulate('A'), b = simulate('B');
  assert.ok(a.writes > 10);
  assert.equal(a.diagnostic.automaticSeeks, a.writes);
  assert.equal(b.writes, 0);
  assert.equal(a.visual, b.visual);
});
test('manual seek and startup audio logic remain unchanged', () => {
  const section = (s, start, end) => s.slice(s.indexOf(start), s.indexOf(end));
  assert.equal(section(source, '  function seek(', '  // ---------- events'), section(transformed, '  function seek(', '  // ---------- events'));
  assert.equal(section(source, '  async function audioPlay()', '  function audioPause()'), section(transformed, '  async function audioPlay()', '  function audioPause()'));
  assert.throws(() => instrumentPlayer('changed player'));
});
