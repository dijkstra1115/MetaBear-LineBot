// 全市場 (?ex=all): the exchanges' answers for one period merged into one, computed per request and
// cached at the edge like the single-exchange answers (docs/ORDERFLOW-MULTI-EXCHANGE.md).
//
// - Bars: open, high, low and close from the price exchange (Binance, else the next in PRICE_ORDER
//   that has the minute), so wicks never mix exchanges' prices; taker volume per price bin summed.
// - Prints: all of them, each tagged with its exchange as a fifth field.
// - Liquidations: every collector's own exchange only (Bybit's collector also records OKX's).
// - Metrics: OI summed in BTC and USDT over the exchanges whose readings cover the whole period, so
//   the series has no step where an exchange's history starts; ratios and funding are Binance's.
// - Heatmap: Binance's (books differ in depth, so they are not summed).

import { EXCHANGES, type Exchange } from "./exchanges";

export { EXCHANGES, type Exchange };
const PRICE_ORDER: Exchange[] = ["binance", "bybit", "okx", "bingx"];
// An exchange covers the period when its first reading is the first 5-minute slot at or after the start.
const COVER_SLACK = 5 * 60_000;

type Level = [number, number, number];
type BarRow = [number, number, number, number, number, Level[]];
type Metric = (number | null)[];
export type Part = { bars?: BarRow[]; prints?: unknown[][]; liquidations?: unknown[][]; metrics?: Metric[]; heat?: unknown[]; status?: Record<string, unknown> };

const round = (v: number) => Math.round(v * 1000) / 1000;

export function mergeBars(parts: Partial<Record<Exchange, BarRow[]>>): BarRow[] {
  const byMinute = new Map<number, Partial<Record<Exchange, BarRow>>>();
  for (const ex of EXCHANGES)
    for (const row of parts[ex] ?? []) {
      let m = byMinute.get(row[0]);
      if (!m) byMinute.set(row[0], (m = {}));
      m[ex] = row;
    }
  const out: BarRow[] = [];
  for (const [t, rows] of [...byMinute.entries()].sort((a, b) => a[0] - b[0])) {
    const price = PRICE_ORDER.map((ex) => rows[ex]).find(Boolean)!;
    const bins = new Map<number, [number, number]>();
    for (const row of Object.values(rows))
      for (const [bin, buy, sell] of row![5]) {
        const lv = bins.get(bin);
        if (lv) (lv[0] += buy), (lv[1] += sell);
        else bins.set(bin, [buy, sell]);
      }
    const levels = [...bins.entries()].sort((a, b) => a[0] - b[0]).map(([bin, [buy, sell]]) => [bin, round(buy), round(sell)] as Level);
    out.push([t, price[1], price[2], price[3], price[4], levels]);
  }
  return out;
}

export function mergeMetrics(parts: Partial<Record<Exchange, Metric[]>>, from: number): Metric[] {
  const covering = EXCHANGES.filter((ex) => {
    const rows = parts[ex];
    return rows?.length && (rows[0][0] as number) <= from + COVER_SLACK;
  });
  const times = [...new Set(covering.flatMap((ex) => parts[ex]!.map((r) => r[0] as number)))].sort((a, b) => a - b);
  const index = Object.fromEntries(covering.map((ex) => [ex, new Map(parts[ex]!.map((r) => [r[0] as number, r]))]));
  const last: Partial<Record<Exchange, Metric>> = {};
  const out: Metric[] = [];
  for (const t of times) {
    for (const ex of covering) {
      const r = index[ex].get(t);
      if (r) last[ex] = r;
    }
    if (!covering.every((ex) => last[ex]?.[1] != null)) continue;
    const sum = (i: number) => (covering.every((ex) => last[ex]![i] != null) ? covering.reduce((s, ex) => s + (last[ex]![i] as number), 0) : null);
    const ref = last.binance;
    const oi = sum(1);
    const value = sum(2);
    out.push([t, oi == null ? null : round(oi), value == null ? null : Math.round(value), ref?.[3] ?? null, ref?.[4] ?? null, ref?.[5] ?? null, null, ref?.[7] ?? null]);
  }
  return out;
}

export function mergeParts(parts: Partial<Record<Exchange, Part>>, from: number) {
  const pick = <K extends keyof Part>(key: K) => Object.fromEntries(EXCHANGES.map((ex) => [ex, parts[ex]?.[key] ?? []]));
  const prints = EXCHANGES.flatMap((ex) => (parts[ex]?.prints ?? []).map((p) => [...p.slice(0, 4), ex]));
  const liquidations = EXCHANGES.flatMap((ex) => (parts[ex]?.liquidations ?? []).filter((r) => r[4] === ex));
  const byTime = (a: unknown[], b: unknown[]) => (a[0] as number) - (b[0] as number);
  return {
    bars: mergeBars(pick("bars") as Partial<Record<Exchange, BarRow[]>>),
    prints: prints.sort(byTime),
    liquidations: liquidations.sort(byTime),
    metrics: mergeMetrics(pick("metrics") as Partial<Record<Exchange, Metric[]>>, from),
    heat: parts.binance?.heat ?? [],
  };
}
