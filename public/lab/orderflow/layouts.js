// 新手／進階／專業: each layout is a set of indicators, a large-print threshold and whether the
// narration rail starts open. Visitors can still switch any indicator in 指標; doing so makes the
// layout "custom" (no button pressed).

export const LAYOUTS = {
  beginner: { label: "新手", show: ["prints", "vwap", "levels", "events", "cvd"], printMin: 10, phonePrintMin: 25, rail: true },
  advanced: { label: "進階", show: ["profile", "heat", "prints", "vwap", "levels", "liqmark", "events", "volume", "cvd", "oi"], printMin: 5, phonePrintMin: 10, rail: true },
  // The full terminal: every indicator that is on by default, the visitor's own threshold.
  pro: { label: "專業", show: null, printMin: null, phonePrintMin: null, rail: false },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);

/**
 * The indicator switches and threshold a layout gives. indicators: [[id, where, label, default]].
 * Returns { show: {id: bool}, printMin } where printMin is null to keep the current one.
 */
export function layoutPrefs(id, indicators, { narrow = false } = {}) {
  const L = LAYOUTS[id];
  if (!L) return null;
  const shown = new Set(L.show ?? indicators.filter((x) => x[3]).map((x) => x[0]));
  return {
    show: Object.fromEntries(indicators.map(([key]) => [key, shown.has(key)])),
    printMin: narrow ? L.phonePrintMin : L.printMin,
  };
}

/**
 * Which layout a visit starts in: a shared link shows the sender's indicators (custom); a saved
 * layout wins; a returning visitor with saved indicators but no layout keeps them (custom);
 * everyone else starts as a beginner.
 */
export function startLayout({ saved, hasSavedIndicators, shared }) {
  if (shared) return "custom";
  if (saved === "custom" || LAYOUT_IDS.includes(saved)) return saved;
  return hasSavedIndicators ? "custom" : "beginner";
}
