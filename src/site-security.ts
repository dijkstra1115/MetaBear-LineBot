const publicDocuments = new Set([
  "/index.html",
  "/guide.html",
  "/orderflow/index.html",
]);

export function siteSecurityHeaders(path: string, origin: string): Headers {
  const productionAnalytics =
    origin === "https://metabear.io" &&
    (publicDocuments.has(path) || /^\/orderflow\/[a-z0-9-]+\.html$/.test(path));
  // Trailing slash: the beacon loads as /beacon.min.js/v<hash>, and a CSP path
  // without one only matches that exact file.
  const scriptSources = productionAnalytics
    ? "'self' https://static.cloudflareinsights.com/beacon.min.js/"
    : "'self'";
  const connections = ["'self'"];
  if (
    path === "/orderflow/index.html" ||
    path === "/orderflow/legacy/classic.html"
  )
    connections.push("wss://stream.bybit.com");
  if (productionAnalytics) connections.push("https://cloudflareinsights.com");
  return new Headers({
    "Content-Security-Policy": `default-src 'self'; script-src ${scriptSources}; style-src 'self'; img-src 'self' data:; connect-src ${connections.join(" ")}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
}
