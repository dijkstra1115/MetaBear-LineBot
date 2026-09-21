import { BUSINESS, STEPS, LESSONS } from "./content";
import { getRate } from "./rates";
import { json } from "./http";
import { siteSecurityHeaders } from "./site-security";

// The public-site preview has only ASSETS: no CRM database, queues or credentials.
export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
      // Avoid a second decode or backslash normalization changing the checked route.
      if (path.includes("%") || path.includes("\\"))
        return finish(new Response("Bad request", { status: 400 }));
    } catch {
      return finish(new Response("Bad request", { status: 400 }));
    }
    if (!["GET", "HEAD"].includes(request.method))
      return finish(
        new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        }),
      );
    if (
      /^\/(?:admin|desk|login|login-setup|auth|api|webhook|media)(?:[/.]|$)/.test(
        path,
      )
    )
      return finish(
        new Response("Not available in the public-site preview", {
          status: 404,
        }),
      );
    if (path === "/health")
      return finish(json({ status: "ok", service: "metabear-site-preview" }));
    if (path === "/robots.txt")
      return finish(
        new Response("User-agent: *\nDisallow: /\n", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      );
    if (path === "/content.json")
      return finish(
        json({ business: BUSINESS, steps: STEPS, lessons: LESSONS }),
      );
    if (path === "/rates/usdt-twd") return finish(await getRate());
    if (path === "/orderflow") {
      url.pathname = "/orderflow/";
      return finish(Response.redirect(url.href, 308));
    }
    if (path === "/") path = "/index.html";
    if (["/learn", "/learn/"].includes(path)) path = "/guide.html";
    if (path === "/orderflow/") path = "/orderflow/index.html";
    url.pathname = path;
    return finish(
      await env.ASSETS.fetch(new Request(url, request)),
      path,
      url.origin,
    );
  },
} satisfies ExportedHandler<Pick<Env, "ASSETS">>;

function finish(response: Response, path = "", origin = ""): Response {
  const headers = new Headers(response.headers);
  siteSecurityHeaders(path, origin).forEach((value, key) =>
    headers.set(key, value),
  );
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("X-MetaBear-Environment", "preview");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}
