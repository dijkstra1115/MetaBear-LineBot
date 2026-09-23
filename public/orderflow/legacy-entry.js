// Older links retain their URL and the original live-market CSP scope.
export async function mountLegacy(params) {
  const response = await fetch(new URL("./classic.html", import.meta.url));
  if (!response.ok) throw new Error("無法載入舊版學院");
  const page = new DOMParser().parseFromString(
    await response.text(),
    "text/html",
  );
  document.title = page.title;
  document.documentElement.className = "";
  document.querySelector('meta[name="theme-color"]').content = "#080e18";
  document
    .querySelectorAll('link[rel="stylesheet"]')
    .forEach((link) => link.remove());
  const styles = [...page.querySelectorAll('link[rel="stylesheet"]')].map(
    (link) => {
      const sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      sheet.href = new URL(link.getAttribute("href"), import.meta.url).href;
      return new Promise((resolve, reject) => {
        sheet.onload = resolve;
        sheet.onerror = reject;
        document.head.append(sheet);
      });
    },
  );
  document.body.replaceChildren(...page.body.childNodes);
  delete document.body.dataset.chapter;
  await Promise.all(styles);
  if (["practice", "live"].includes(params.get("workspace"))) {
    document.getElementById("academy").hidden = false;
    await import("./app.js");
  } else {
    const root = document.getElementById("foundation");
    document.documentElement.classList.add("foundation-page");
    root.hidden = false;
    const { mountFoundation } = await import("./foundation.js");
    mountFoundation(root, params.get("lesson"));
  }
}
