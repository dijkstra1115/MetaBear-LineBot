// The single-trade shorts: one per trade of every case-wall stretch (motion/replays/segments), stops
// included, numbered as in the stretch film. Built from the stretches' extracted data, so every
// number matches the stretch film and the case wall; only the wording of the captions is here.
import { readFileSync } from "node:fs";
import { RULES, SEGMENTS } from "../../segments/scripts/segments.mjs";

export const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";

export function trades() {
  const out = [];
  for (const [seg, G] of Object.entries(SEGMENTS)) {
    const D = JSON.parse(readFileSync(new URL(`../../segments/assets/data/${seg}.json`, import.meta.url), "utf8"));
    D.trades.forEach((t, k) => {
      // Alerts at the minute they happened: the touch and the pierce have theirs; what was read on
      // the entry bar is at the entry minute; the rest (strategy C's push) at its 5-minute bar.
      const alerts = t.alerts.map((a) => {
        let at = D.bars[a.bar][0];
        if (a.tone === "level" && t.touchT) at = t.touchT;
        else if (a.text.includes("又收回") && t.extT) at = t.extT;
        else if (a.bar === t.signal) at = t.entryT;
        return { at, tone: a.tone, text: a.text };
      });
      out.push({
        id: `${seg}-${k + 1}`,
        seg,
        k,
        range: G.range,
        ...t,
        rule: D.rules ? RULES[t.rule] : D.ruleName, // the name, over the trade's rule key
        alerts,
      });
    });
  }
  return out;
}
