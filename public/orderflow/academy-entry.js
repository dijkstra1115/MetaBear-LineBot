const params = new URLSearchParams(location.search);
const lesson = params.get("lesson");
const stories = {
  matching: "matching.html",
  candles: "matching.html",
  cvd: "delta.html",
  delta: "delta.html",
  absorption: "wick.html",
  liquidity: "wick.html",
  footprint: "revisit.html",
  profile: "revisit.html",
  heatmap: "revisit.html",
};
if (
  params.has("workspace") ||
  params.get("classic") === "1" ||
  (lesson && !stories[lesson])
) {
  const { mountLegacy } = await import("./legacy-entry.js");
  await mountLegacy(params);
} else if (lesson && stories[lesson] !== "matching.html") {
  location.replace(`./${stories[lesson]}`);
} else {
  await import("./primer.js");
}
