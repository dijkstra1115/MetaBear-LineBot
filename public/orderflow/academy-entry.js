const params = new URLSearchParams(location.search);
const lesson = params.get("lesson");
const stories = {
  matching: "matching.html",
  candles: "matching.html",
  cvd: "courses.html",
  delta: "courses.html",
  absorption: "wick.html",
  liquidity: "wick.html",
  footprint: "footprint.html",
  profile: "volume-profile.html",
  heatmap: "heatmap.html",
  "order-types": "order-types.html",
  slippage: "slippage.html",
  leverage: "leverage.html",
  liquidation: "liquidation.html",
  volume: "volume.html",
  "absorption-story": "absorption-story.html",
  "delta-concept": "delta-concept.html",
  "mark-price": "courses.html",
  "stop-orders": "stop-orders.html",
  breakout: "breakout.html",
  "breakout-volume": "breakout-volume.html",
  withdrawal: "withdrawal.html",
  "open-interest": "open-interest.html",
  funding: "funding.html",
  "volume-profile": "volume-profile.html",
  imbalance: "imbalance.html",
};
if (
  params.has("workspace") ||
  params.get("classic") === "1" ||
  (lesson && !stories[lesson])
) {
  const target = new URL("./legacy/classic.html", location.href);
  target.search = params.toString();
  if (!params.has("workspace")) target.searchParams.set("classic", "1");
  target.hash = location.hash;
  location.replace(target.href);
} else if (["delta", "cvd", "mark-price"].includes(lesson)) {
  location.replace("./courses.html");
} else if (lesson) {
  location.replace(`./${stories[lesson]}${location.hash}`);
} else if (/^#scene-\d+$/.test(location.hash)) {
  location.replace(`./matching.html${location.hash}`);
} else {
  await import("./academy-map.js");
}
