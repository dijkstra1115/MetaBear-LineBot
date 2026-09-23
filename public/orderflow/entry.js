const params = new URLSearchParams(location.search);
if (["practice", "live"].includes(params.get("workspace"))) {
  document.getElementById("academy").hidden = false;
  await import("./app.js");
} else if (params.get("classic") === "1") {
  document.documentElement.classList.add("foundation-page");
  document.querySelector('meta[name="theme-color"]').content = "#080e18";
  document.getElementById("foundation").hidden = false;
  const { mountFoundation } = await import("./foundation.js");
  mountFoundation(document.getElementById("foundation"), params.get("lesson"));
} else {
  for (const name of ["absorption.css", "journey.css"]) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(name, import.meta.url).href;
    document.head.append(link);
  }
  const root = document.getElementById("foundation");
  root.hidden = false;
  const { mountJourney } = await import("./journey.js");
  mountJourney(root);
}
