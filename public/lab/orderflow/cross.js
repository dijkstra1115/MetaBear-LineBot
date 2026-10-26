// 跨所同步大單: large prints on the same side from three or more exchanges within a few seconds, found
// in 全市場's merged prints ([t, side, price, qty, exchange]). Pure, so the lab, the narration and the
// tests share it (docs/ORDERFLOW-MULTI-EXCHANGE.md).

export const EXCHANGE_NAMES = { binance: "Binance", bybit: "Bybit", okx: "OKX", bingx: "BingX" };
export const CROSS_WINDOW_MS = 10_000;
// Two exchanges together are common (about 11 an hour at 10 BTC on 2026-10-26); three or more about
// 2 an hour, rare enough to stand out.
export const CROSS_EXCHANGES = 3;

/**
 * Clusters of same-side prints of at least `min` BTC, each starting at its first print and taking
 * every later one within `windowMs` of it. Only clusters with `exchanges` or more exchanges are kept.
 * Returns [{ t, end, side, qty, price, exchanges: [[ex, count, qty], …] (largest first), prints }].
 */
export function crossClusters(prints, { min = 0, windowMs = CROSS_WINDOW_MS, exchanges: need = CROSS_EXCHANGES } = {}) {
  const out = [];
  for (const side of ["buy", "sell"]) {
    let cur = null;
    const close = () => {
      if (cur && cur.by.size >= need) {
        const exchanges = [...cur.by.entries()].map(([ex, [n, q]]) => [ex, n, Math.round(q * 1000) / 1000]).sort((a, b) => b[2] - a[2]);
        out.push({ t: cur.t, end: cur.end, side, qty: Math.round(cur.qty * 1000) / 1000, price: Math.round((cur.pq / cur.qty) * 10) / 10, exchanges, prints: cur.prints });
      }
      cur = null;
    };
    for (const p of prints) {
      const [t, s, price, qty, ex] = p;
      if (s !== side || qty < min || !ex) continue;
      if (cur && t - cur.t > windowMs) close();
      if (!cur) cur = { t, end: t, qty: 0, pq: 0, by: new Map(), prints: [] };
      cur.end = t;
      cur.qty += qty;
      cur.pq += price * qty;
      cur.prints.push(p);
      const e = cur.by.get(ex) ?? [0, 0];
      cur.by.set(ex, [e[0] + 1, e[1] + qty]);
    }
    close();
  }
  return out.sort((a, b) => a.t - b.t);
}
