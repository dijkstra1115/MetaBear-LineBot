// Current narration files are under 1 MB. Bound partial-response buffering so
// a future large upload cannot exhaust Worker memory; full responses stream.
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const isLessonAudio = (path: string) =>
  /^\/orderflow\/motion\/audio\/[a-z0-9-]+\.m4a$/.test(path);

export function parseAudioRange(
  value: string | null,
  length: number,
): [number, number] | false | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if (
    (first !== null && !Number.isSafeInteger(first)) ||
    (last !== null && !Number.isSafeInteger(last))
  )
    return null;
  if (first === null)
    return !last || !length ? false : [Math.max(0, length - last), length - 1];
  if (first >= length || (last !== null && last < first)) return false;
  return [first, Math.min(last ?? length - 1, length - 1)];
}

export async function serveLessonAudio(
  request: Request,
  assets: Pick<Fetcher, "fetch">,
): Promise<Response> {
  if (!isLessonAudio(new URL(request.url).pathname))
    return new Response(null, { status: 404 });
  if (!["GET", "HEAD"].includes(request.method))
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  const upstreamRequest = new Request(request);
  upstreamRequest.headers.delete("Range");
  upstreamRequest.headers.delete("If-Range");
  upstreamRequest.headers.set("Accept-Encoding", "identity");
  let upstream = await assets.fetch(upstreamRequest);
  if (upstream.status !== 200) return upstream;
  const headers = new Headers(upstream.headers);
  // Workers Assets can omit Content-Length internally even though the edge
  // adds it to the final HTTP response. Resolve small ranged files explicitly.
  if (
    !headers.has("Content-Length") &&
    request.method === "GET" &&
    request.headers.has("Range") &&
    (!headers.has("Content-Encoding") ||
      headers.get("Content-Encoding") === "identity")
  ) {
    const reader = upstream.body?.getReader();
    if (!reader) return new Response("Audio unavailable", { status: 502 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_AUDIO_BYTES) throw new Error("Audio exceeds limit");
        chunks.push(value);
      }
    } catch {
      return new Response("Audio unavailable", { status: 502 });
    } finally {
      await reader.cancel().catch(() => {});
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    headers.set("Content-Length", String(size));
    upstream = new Response(data, { status: 200, headers });
  }
  const length = Number(headers.get("Content-Length"));
  if (
    !headers.has("Content-Length") ||
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    length > MAX_AUDIO_BYTES ||
    (headers.has("Content-Encoding") &&
      headers.get("Content-Encoding") !== "identity")
  )
    return upstream;
  headers.set("Accept-Ranges", "bytes");
  const ifRange = request.headers.get("If-Range");
  const etag = headers.get("ETag");
  const modified = headers.get("Last-Modified");
  const matches =
    !ifRange ||
    (ifRange.startsWith('"')
      ? ifRange === etag
      : !ifRange.startsWith("W/") &&
        !!modified &&
        Number.isFinite(Date.parse(ifRange)) &&
        Date.parse(modified) <= Date.parse(ifRange));
  const range =
    request.method === "GET" && matches
      ? parseAudioRange(request.headers.get("Range"), length)
      : null;
  if (range === false) {
    await upstream.body?.cancel();
    headers.set("Content-Range", `bytes */${length}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  if (!range) return new Response(upstream.body, { status: 200, headers });
  const [start, end] = range;
  const reader = upstream.body?.getReader();
  if (!reader) return new Response("Audio unavailable", { status: 502 });
  const output = new Uint8Array(end - start + 1);
  let position = 0;
  try {
    while (position <= end) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Truncated audio");
      if (position + value.byteLength > MAX_AUDIO_BYTES)
        throw new Error("Audio exceeds limit");
      const a = Math.max(0, start - position);
      const b = Math.min(value.byteLength, end + 1 - position);
      if (b > a)
        output.set(value.subarray(a, b), Math.max(0, position - start));
      position += value.byteLength;
    }
  } catch {
    return new Response("Audio unavailable", { status: 502 });
  } finally {
    await reader.cancel().catch(() => {});
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${length}`);
  headers.set("Content-Length", String(output.byteLength));
  return new Response(output, { status: 206, headers });
}
