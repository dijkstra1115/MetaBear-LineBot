// Service worker for the order-flow lab's notifications (notify.js). Android Chrome shows page
// notifications only through a service worker. It has no fetch handler, so it never touches
// requests or caches anything; a click on a notification focuses the lab at the event.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const at = Number(e.notification.data?.at) || 0;
  e.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const lab = pages.find((c) => new URL(c.url).pathname.startsWith("/lab/orderflow/") && !c.url.includes("alerts"));
      if (lab) {
        await lab.focus();
        lab.postMessage({ type: "orderflow-event", at });
      } else await self.clients.openWindow(`/lab/orderflow/?tf=1&at=${at}`);
    })(),
  );
});
