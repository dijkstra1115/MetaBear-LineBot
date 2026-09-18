import { admin } from "./admin";
import { getRate } from "./rates";
import { webhook, processLineEvent } from "./webhook";
import { BUSINESS, STEPS, LESSONS } from "./content";
import { HttpError, json } from "./http";
import type { LineEvent } from "./types";
import { adminIdentity, staffIdentity } from "./auth";
import { authRoute, cleanupAuth } from "./native-auth";
import { cleanupConversations } from "./conversations";
import {
  dispatchCrm,
  processSync,
  processVip,
  type CrmMessage,
} from "./automation";
import { getTeam, personalize } from "./team";
import { installRichMenu, type MenuInstallMessage } from "./line-rich-menu";
import {
  processCampaign,
  dispatchCampaigns,
  type CampaignMessage,
} from "./campaigns";
import {
  dispatchSupportNotifications,
  processSupportNotification,
  type SupportNotificationMessage,
} from "./support";
import {
  deskApi,
  dispatchSignals,
  processSignal,
  signalMedia,
  type SignalMessage,
} from "./signals";

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await dispatchCampaigns(env);
    await dispatchSignals(env);
    await dispatchCrm(env);
    await dispatchSupportNotifications(env);
    await cleanupAuth(env);
    await cleanupConversations(env);
  },
  async queue(
    batch: MessageBatch<
      | LineEvent
      | CampaignMessage
      | SignalMessage
      | CrmMessage
      | MenuInstallMessage
      | SupportNotificationMessage
    >,
    env: Env,
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        if ("kind" in message.body && message.body.kind === "line-menu-install")
          await installRichMenu(message.body, env);
        else if ("kind" in message.body && message.body.kind === "crm-sync")
          await processSync(message.body, env);
        else if ("kind" in message.body && message.body.kind === "vip-delivery")
          await processVip(message.body, env);
        else if (
          "kind" in message.body &&
          message.body.kind === "campaign-delivery"
        )
          await processCampaign(message.body, env);
        else if (
          "kind" in message.body &&
          message.body.kind === "signal-delivery"
        )
          await processSignal(message.body, env);
        else if (
          "kind" in message.body &&
          message.body.kind === "support-notification"
        )
          await processSupportNotification(message.body, env);
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
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/auth/"))
        return await authRoute(request, env);
      if (url.pathname === "/health")
        return json({ status: "ok", service: "metabear-line-crm" });
      if (url.pathname === "/webhook/line") {
        if (request.method !== "POST")
          return new Response("Method not allowed", {
            status: 405,
            headers: { Allow: "POST" },
          });
        return await webhook(request, env, ctx);
      }
      if (url.pathname === "/content.json" && request.method === "GET")
        return json(
          personalize(
            { business: BUSINESS, steps: STEPS, lessons: LESSONS },
            await getTeam(env.DB),
          ),
        );
      if (url.pathname === "/rates/usdt-twd") {
        if (request.method !== "GET")
          return new Response(null, { status: 405, headers: { Allow: "GET" } });
        return await getRate();
      }
      if (url.pathname.startsWith("/media/signals/"))
        return await signalMedia(request, env);
      if (url.pathname.startsWith("/api/desk"))
        return await deskApi(request, env);
      if (url.pathname.startsWith("/api/")) return await admin(request, env);
      if (!["GET", "HEAD"].includes(request.method))
        throw new HttpError(405, "Method not allowed");
      const target = new URL(request.url);
      const path = decodeURIComponent(target.pathname);
      const adminPage = [
        "/admin",
        "/admin/",
        "/admin.html",
        "/admin/login-setup",
      ].includes(path);
      const deskPage = ["/desk", "/desk/", "/desk.html"].includes(path);
      const privatePage = adminPage || deskPage;
      if (privatePage) {
        if (env.ENVIRONMENT !== "development" || env.AUTH_MODE === "native") {
          try {
            if (deskPage) await staffIdentity(request, env);
            else await adminIdentity(request, env);
          } catch (error) {
            if (
              env.AUTH_MODE === "native" &&
              error instanceof HttpError &&
              error.status === 401
            )
              return new Response(null, {
                status: 302,
                headers: {
                  Location: deskPage ? "/login?next=desk" : "/login",
                  "Cache-Control": "no-store",
                },
              });
            if (
              env.AUTH_MODE === "native" &&
              adminPage &&
              error instanceof HttpError &&
              error.status === 403
            )
              return new Response(null, {
                status: 302,
                headers: { Location: "/desk", "Cache-Control": "no-store" },
              });
            throw error;
          }
        }
        target.pathname =
          path === "/admin/login-setup"
            ? "/login-setup.html"
            : deskPage
              ? "/desk.html"
              : "/admin.html";
      }
      if (["/login", "/login/"].includes(target.pathname))
        target.pathname = "/login.html";
      if (target.pathname === "/") target.pathname = "/index.html";
      if (target.pathname === "/learn" || target.pathname === "/learn/")
        target.pathname = "/guide.html";
      const response = await env.ASSETS.fetch(new Request(target, request));
      const headers = new Headers(response.headers);
      if (privatePage || target.pathname === "/login.html")
        headers.set("Cache-Control", "no-store");
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
} satisfies ExportedHandler<
  Env,
  | LineEvent
  | CampaignMessage
  | SignalMessage
  | CrmMessage
  | MenuInstallMessage
  | SupportNotificationMessage
>;
