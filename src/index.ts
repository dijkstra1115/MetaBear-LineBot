import { admin } from "./admin";
import { webhook, processLineEvent } from "./webhook";
import { BUSINESS, STEPS, LESSONS } from "./content";
import { HttpError, json } from "./http";
import type { LineEvent } from "./types";
import { adminIdentity } from "./auth";
import {
  processCampaign,
  dispatchCampaigns,
  type CampaignMessage,
} from "./campaigns";

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await dispatchCampaigns(env);
  },
  async queue(
    batch: MessageBatch<LineEvent | CampaignMessage>,
    env: Env,
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        if ("kind" in message.body && message.body.kind === "campaign-delivery")
          await processCampaign(message.body, env);
        else await processLineEvent(message.body as LineEvent, env);
        message.ack();
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "webhook.retry",
            eventId:
              "webhookEventId" in message.body
                ? message.body.webhookEventId
                : message.body.id,
            attempt: message.attempts,
            errorType: error instanceof Error ? error.name : "Unknown",
          }),
        );
        message.retry({ delaySeconds: Math.min(60, 2 ** message.attempts) });
      }
    }
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health")
        return json({ status: "ok", service: "metabear-line-crm" });
      if (url.pathname === "/webhook/line") {
        if (request.method !== "POST")
          return new Response("Method not allowed", {
            status: 405,
            headers: { Allow: "POST" },
          });
        return await webhook(request, env);
      }
      if (url.pathname === "/content.json" && request.method === "GET")
        return json({ business: BUSINESS, steps: STEPS, lessons: LESSONS });
      if (url.pathname.startsWith("/api/")) return await admin(request, env);
      if (!["GET", "HEAD"].includes(request.method))
        throw new HttpError(405, "Method not allowed");
      const target = new URL(request.url);
      const privatePage = ["/admin", "/admin/", "/admin.html"].includes(
        decodeURIComponent(target.pathname),
      );
      if (privatePage) {
        if (env.ENVIRONMENT !== "development")
          await adminIdentity(request, env);
        target.pathname = "/admin.html";
      }
      if (target.pathname === "/") target.pathname = "/index.html";
      if (target.pathname === "/learn" || target.pathname === "/learn/")
        target.pathname = "/guide.html";
      const response = await env.ASSETS.fetch(new Request(target, request));
      const headers = new Headers(response.headers);
      if (privatePage) headers.set("Cache-Control", "no-store");
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "no-referrer");
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      console.error(
        JSON.stringify({
          event: "request.failed",
          path: url.pathname,
          errorType: error instanceof Error ? error.name : "Unknown",
        }),
      );
      return json({ error: "服務暫時無法完成操作，請稍後重試" }, 500);
    }
  },
} satisfies ExportedHandler<Env, LineEvent | CampaignMessage>;
