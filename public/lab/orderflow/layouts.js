// 新手／進階／專業: each layout is a set of indicators, a large-print threshold and whether the
// narration rail starts open. The tool bar no longer offers them: first visits start as beginner,
// visitors who picked one before keep it, and switching any indicator in 指標 makes it "custom".

// 全市場 sums four exchanges' prints, about six times one exchange's at the same size, so its
// thresholds sit one step higher: on 2026-10-22's 1-minute chart, Bybit at 10 BTC drew about 16
// bubbles an hour and 全市場 at 25 BTC about 18 (docs/ORDERFLOW-MULTI-EXCHANGE.md).
export const LAYOUTS = {
  beginner: { label: "新手", show: ["prints", "vwap", "lmap", "volume", "cvd"], printMin: 10, phonePrintMin: 25, allPrintMin: 25, allPhonePrintMin: 50, rail: true },
  advanced: {
    label: "進階",
    show: ["profile", "heat", "prints", "vwap", "levels", "lmap", "volume", "cvd", "oi"],
    printMin: 5,
    phonePrintMin: 10,
    allPrintMin: 10,
    allPhonePrintMin: 25,
    rail: true,
  },
  // The full terminal: every indicator that is on by default, the visitor's own threshold.
  pro: { label: "專業", show: null, printMin: null, phonePrintMin: null, allPrintMin: null, allPhonePrintMin: null, rail: false },
};
export const LAYOUT_IDS = Object.keys(LAYOUTS);

/**
 * The indicator switches and threshold a layout gives. indicators: [[id, where, label, default]].
 * Returns { show: {id: bool}, printMin } where printMin is null to keep the current one; merged is
 * 全市場, whose thresholds are higher.
 */
export function layoutPrefs(id, indicators, { narrow = false, merged = false } = {}) {
  const L = LAYOUTS[id];
  if (!L) return null;
  const shown = new Set(L.show ?? indicators.filter((x) => x[3]).map((x) => x[0]));
  return {
    show: Object.fromEntries(indicators.map(([key]) => [key, shown.has(key)])),
    printMin: merged ? (narrow ? L.allPhonePrintMin : L.allPrintMin) : narrow ? L.phonePrintMin : L.printMin,
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
