const legacyHost = "metabear-line-crm-staging.style78432.workers.dev";
const publicDocuments = new Set([
  "/",
  "/index.html",
  "/learn",
  "/learn/",
  "/guide.html",
  "/orderflow",
  "/orderflow/",
  "/orderflow/index.html",
]);

/** Move public entry points while keeping existing LINE and staff integrations reachable. */
export function siteRedirect(
  request: Request,
  publicBaseUrl: string,
): Response | null {
  if (publicBaseUrl !== "https://metabear.io") return null;
  const url = new URL(request.url);
  const legacyDocument =
    url.hostname === legacyHost &&
    ["GET", "HEAD"].includes(request.method) &&
    publicDocuments.has(url.pathname);
  const canonicalHost =
    url.hostname === "www.metabear.io" ||
    (url.hostname === "metabear.io" && url.protocol !== "https:");
  if (!legacyDocument && !canonicalHost) return null;
  url.protocol = "https:";
  url.host = "metabear.io";
  if (url.pathname === "/orderflow") url.pathname = "/orderflow/";
  return Response.redirect(url.toString(), 308);
}
