// Open interest and long/short ratios, aligned to the moment they were read.
//
// Binance's two sources stamp the same 5-minute readings differently:
//
// - The data.binance.vision daily `metrics` archive (scripts/orderflow-data.mjs) stamps a row
//   with the open of its period [T, T+5m). The taker buy/sell ratio is that period's flow, but
//   OI and the long/short ratios are read at its close, T+5m. Checked 2026-10-13: archive row T
//   equals REST row T+5m for OI and the ratios (REST row T for the taker ratio), and |ΔOI|
//   between archive rows T and T+5m exceeds the volume traded in [T, T+5m) in 1.1 % of pairs,
//   which no reading at T could do, but the volume in [T+5m, T+10m) in 0.01 %.
// - The REST endpoints the collector polls (/futures/data/openInterestHist and the ratio
//   endpoints) stamp a row with its reading time, and appear about 2–3 minutes after it.
//
// Taking archive stamps as reading times gave every bar the OI from 5 minutes after its close,
// and put each OI change on the bar before the one it happened in. The lab works in reading
// time: a bar gets the latest reading at or before its close.
//
// Reading-time row: [t, OI (BTC), OI (USDT), top-trader position ratio, top-trader account
// ratio, all-account ratio, taker buy/sell ratio over [t − 5m, t)].

export const ARCHIVE_LAG_MS = 5 * 60_000;

/** Archive dataset rows (`raw.metrics`) → reading-time rows. */
export function fromArchive(rows) {
  return rows.map(([t, ...values]) => [t + ARCHIVE_LAG_MS, ...values]);
}

/** Archive rows plus collector rows → one sorted reading-time series; the archive wins a tie. */
export function mergeReadings(archive, live = []) {
  const byT = new Map(fromArchive(archive).map((r) => [r[0], r]));
  for (const r of live) if (!byT.has(r[0])) byT.set(r[0], r);
  return [...byT.values()].sort((x, y) => x[0] - y[0]);
}

/**
 * Walks reading-time rows (sorted) in step with ascending times: at(t) is the latest row read
 * at or before t, or null before the first reading.
 */
export function readingsAt(rows) {
  let m = -1;
  return (t) => {
    while (m + 1 < rows.length && rows[m + 1][0] <= t) m++;
    return m < 0 ? null : rows[m];
  };
}
