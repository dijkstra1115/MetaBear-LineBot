import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byteRange, serveDiagnosticAudio } from './range.mjs';
const bytes = Uint8Array.from({length: 100}, (_, i) => i);
const upstream = async () => new Response(bytes, {headers:{'Content-Type':'audio/mp4'}});
const request = (arm, headers = {}, method = 'GET') => new Request(`https://preview.metabear.io/audio-test/media/${arm}/btc-wall.m4a?audio_test=fresh`, {headers, method});
test('byte ranges handle suffix, open end, clipping, malformed and unsatisfiable requests', () => {
  assert.deepEqual(byteRange('bytes=10-19', 100), [10,19]);
  assert.deepEqual(byteRange('bytes=90-', 100), [90,99]);
  assert.deepEqual(byteRange('bytes=-5', 100), [95,99]);
  assert.deepEqual(byteRange('bytes=90-1000', 100), [90,99]);
  assert.equal(byteRange('bytes=100-', 100), false);
  assert.equal(byteRange('bytes=20-10', 100), false);
  assert.equal(byteRange('bytes=-0', 100), false);
  assert.equal(byteRange('bytes=0-1,4-5', 100), null);
  assert.equal(byteRange('bytes=x-y', 100), null);
});
test('both arms serve identical full bytes; only range arm returns requested bytes with 206', async () => {
  const a = await serveDiagnosticAudio(request('original', {Range:'bytes=10-19'}), upstream);
  const b = await serveDiagnosticAudio(request('range', {Range:'bytes=10-19'}), upstream);
  const full = await serveDiagnosticAudio(request('range'), upstream);
  assert.equal(a.status, 200); assert.equal(b.status, 206);
  assert.equal(a.headers.get('ETag'), b.headers.get('ETag'));
  assert.equal(b.headers.get('Content-Range'), 'bytes 10-19/100');
  assert.equal(b.headers.get('Content-Length'), '10');
  assert.deepEqual(new Uint8Array(await b.arrayBuffer()), bytes.slice(10,20));
  assert.deepEqual(new Uint8Array(await a.arrayBuffer()), new Uint8Array(await full.arrayBuffer()));
});
test('HEAD, 416 and If-Range behave correctly', async () => {
  const head = await serveDiagnosticAudio(request('range', {Range:'bytes=10-19'}, 'HEAD'), upstream);
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal(head.headers.get('Content-Length'), '100');
  const bad = await serveDiagnosticAudio(request('range', {Range:'bytes=100-'}), upstream);
  assert.equal(bad.status, 416); assert.equal(bad.headers.get('Content-Range'), 'bytes */100');
  const changed = await serveDiagnosticAudio(request('range', {Range:'bytes=10-19', 'If-Range':'"other"'}), upstream);
  assert.equal(changed.status, 200);
});
test('diagnostic endpoint cannot fetch arbitrary resources or forward credentials', async () => {
  let fetched = false;
  const rejected = await serveDiagnosticAudio(new Request('https://preview.metabear.io/audio-test/media/range/secret.m4a'), () => {fetched = true;});
  assert.equal(rejected.status,404); assert.equal(fetched,false);
  await serveDiagnosticAudio(request('range', {Cookie:'private',Authorization:'private'}), async (url, options) => {
    assert.equal(url,'https://metabear.io/orderflow/motion/audio/btc-wall.m4a');
    assert.deepEqual(options.headers, {'Accept-Encoding':'identity'});
    return upstream();
  });
});

test('cache experiment permits only browser caching and still ignores Range in original arm', async () => {
  const normal = await serveDiagnosticAudio(request('original'), upstream);
  assert.equal(normal.headers.get('Cache-Control'), 'no-store');
  const cached = await serveDiagnosticAudio(new Request(request('original', {Range:'bytes=10-19'}).url + '&cache_probe=1', {headers:{Range:'bytes=10-19'}}), upstream);
  assert.equal(cached.status, 200);
  assert.equal(cached.headers.get('Accept-Ranges'), null);
  assert.equal(cached.headers.get('Content-Range'), null);
  assert.equal(cached.headers.get('Cache-Control'), 'private, max-age=3600');
  assert.deepEqual(new Uint8Array(await cached.arrayBuffer()), bytes);
});
