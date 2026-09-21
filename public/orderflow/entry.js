const params = new URLSearchParams(location.search);
if (["practice", "live"].includes(params.get("workspace"))) {
  document.getElementById("academy").hidden = false;
  await import("./app.js");
} else {
  document.documentElement.classList.add("foundation-page");
  document.querySelector('meta[name="theme-color"]').content = "#080e18";
  document.getElementById("foundation").hidden = false;
  const { mountFoundation } = await import("./foundation.js");
  mountFoundation(document.getElementById("foundation"), params.get("lesson"));
}
