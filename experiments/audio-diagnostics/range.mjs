// Single byte ranges only; unsupported/malformed ranges fall back to 200.
export function byteRange(value, length) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  if (first === null) return last === 0 || length === 0 ? false : [Math.max(0, length - last), length - 1];
  if (first >= length || (last !== null && last < first)) return false;
  return [first, Math.min(last ?? length - 1, length - 1)];
}

export async function serveDiagnosticAudio(request, fetcher = fetch) {
  const match = /^\/audio-test\/media\/(original|range)\/(btc-wall|footprint)\.m4a$/.exec(new URL(request.url).pathname);
  if (!match) return new Response('Not found', { status: 404 });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  // Both arms fetch identical bytes through the same path. Only range handling
  // differs. No cookies, client headers or query parameters reach the origin.
  let upstream;
  try {
    upstream = await fetcher(`https://metabear.io/orderflow/motion/audio/${match[2]}.m4a`, { headers: { 'Accept-Encoding': 'identity' }, redirect: 'follow' });
  } catch {
    return new Response('Audio source unavailable', { status: 502 });
  }
  if (upstream.status !== 200) return new Response('Audio source unavailable', { status: 502 });
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > 2_000_000) return new Response('Audio exceeds diagnostic limit', { status: 502 });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const headers = new Headers({ 'Content-Type': 'audio/mp4', 'Content-Length': String(bytes.byteLength), 'Cache-Control': 'no-store', 'ETag': `"${digest}"`, 'X-Audio-Transport': match[1], 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' });
  // Explicit, separate cache experiment. Existing v3 arms remain no-store.
  if (new URL(request.url).searchParams.get('cache_probe') === '1') headers.set('Cache-Control', 'private, max-age=3600');
  if (match[1] === 'range') headers.set('Accept-Ranges', 'bytes');
  const ifRange = request.headers.get('If-Range');
  const range = match[1] === 'range' && request.method === 'GET' && (!ifRange || ifRange === headers.get('ETag')) ? byteRange(request.headers.get('Range'), bytes.byteLength) : null;
  if (range === false) {
    headers.set('Content-Range', `bytes */${bytes.byteLength}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }
  if (range) {
    const [start, end] = range;
    headers.set('Content-Range', `bytes ${start}-${end}/${bytes.byteLength}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(bytes.slice(start, end + 1), { status: 206, headers });
  }
  return new Response(request.method === 'HEAD' ? null : bytes, { headers });
}
