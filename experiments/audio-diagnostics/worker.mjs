import original from './preview.js';
export { ArenaRoom } from './preview.js';
import { instrumentPlayer } from './transform.mjs';
import { files } from './files.mjs';
import { serveDiagnosticAudio } from './range.mjs';
import { isLessonAudio, serveLessonAudio } from './lesson-audio.mjs';
import { fixedFiles, baseline } from './fixed-files.mjs';

const prefix = '/audio-test/';
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const fixed = url.pathname.startsWith('/audio-fix/');
    const routePrefix = fixed ? '/audio-fix/' : prefix;
    if (url.pathname === '/audio-test') return Response.redirect(url.origin + prefix + url.search, 302);
    if (!fixed && !url.pathname.startsWith(prefix)) return original.fetch(request, env, ctx);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    const path = url.pathname.slice(routePrefix.length);
    if (!fixed && path.startsWith('media/')) return serveDiagnosticAudio(request);
    if (fixed && isLessonAudio('/' + path)) {
      const audioRequest = new Request('https://metabear.io/' + path + url.search, {method:request.method,headers:request.headers});
      const response = await serveLessonAudio(audioRequest, {fetch: r => fetch(r.url, {method:r.method, headers:{'Accept-Encoding':'identity'},redirect:'follow'})});
      const h = new Headers(response.headers); h.set('Cache-Control','no-store'); h.set('X-Robots-Tag','noindex');
      return new Response(response.body,{status:response.status,headers:h});
    }
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'X-MetaBear-Audio-Test': 'v1', 'Referrer-Policy': 'no-referrer' });
    if (fixed && Object.hasOwn(fixedFiles, path)) {
      headers.set('Content-Type','application/javascript');
      return new Response(request.method === 'HEAD' ? null : fixedFiles[path],{headers});
    }
    if (!fixed && Object.hasOwn(files, path)) {
      headers.set('Content-Type', files[path].type);
      headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; frame-src 'self'; media-src 'self' https://metabear.io; frame-ancestors 'self'; base-uri 'none'");
      return new Response(request.method === 'HEAD' ? null : files[path].body, { headers });
    }
    // Read only public course assets from a fixed origin. No cookies or user
    // credentials are forwarded. Existing preview assets remain untouched.
    if (!/^(orderflow\/.*\.(?:html|js|css|woff2|m4a)|mb(?:-boot)?\.js|mb\.css|metabear-logo-transparent-64\.png)$/.test(path)) return new Response('Not found', { status: 404, headers });
    const upstreamHeaders = new Headers();
    if (request.headers.has('Range')) upstreamHeaders.set('Range', request.headers.get('Range'));
    let response;
    try {
      response = await fetch('https://metabear.io/' + path, { method: request.method, headers: upstreamHeaders, redirect: 'follow' });
    } catch (error) {
      return new Response(String(error), { status: 502 });
    }
    for (const name of ['Content-Type', 'Content-Range', 'Accept-Ranges']) if (response.headers.has(name)) headers.set(name, response.headers.get(name));
    headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; media-src 'self' https://metabear.io; frame-ancestors 'self'; base-uri 'none'");
    if (!response.ok || request.method === 'HEAD') return new Response(response.body, { status: response.status, headers });
    if (!fixed && path === 'orderflow/motion/player.js') return new Response(instrumentPlayer(baseline), { headers });
    if (path.endsWith('.html')) {
      const html = (await response.text()).replace(/((?:href|src)=['"])\/(?!\/)/g, '$1' + routePrefix);
      return new Response(html, { headers });
    }
    return new Response(response.body, { status: response.status, headers });
  },
};
