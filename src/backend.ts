import worker from "./index";
import { backendAssets } from "../scripts/deployment-layout.mjs";
import { handleArenaScores } from "./arena-scores";

// Public website traffic never needs the CRM Worker. Keep old workers.dev
// links usable after removing the public website from its asset bundle.
export default {
  ...worker,
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
      if (path.includes("%") || path.includes("\\"))
        return new Response("Bad request", { status: 400 });
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    // The FLOW ARENA leaderboard lives in its own database, apart from the CRM.
    if (path === "/arena/api/scores")
      return handleArenaScores(request, env);
    if (/^\/(?:api|auth|webhook|media|rates)(?:\/|$)/.test(path) ||
        /^\/(?:admin|desk|login)(?:[/.\-]|$)/.test(path) ||
        ["/content.json", "/health"].includes(path) ||
        backendAssets.some((name) => path === "/" + name))
      return worker.fetch(request, env, ctx);
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    const destination = new URL(env.PUBLIC_BASE_URL);
    if (url.origin === destination.origin)
      return new Response("Not found", { status: 404 });
    destination.pathname = url.pathname;
    destination.search = url.search;
    return Response.redirect(destination.href, 308);
  },
} satisfies typeof worker;
