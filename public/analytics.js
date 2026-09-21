// Measure the live public website; local and preview visits stay out of its stats.
if (location.origin === "https://metabear.io") {
  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.dataset.cfBeacon = JSON.stringify({
    token: "7a49b87d7e7046e29dddf277d835416a",
  });
  document.head.append(beacon);
}
