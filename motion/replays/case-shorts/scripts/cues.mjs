// Film timing for one case, fast → slow → fast: 5-minute bars race through the approach, the
// chart zooms into 1-minute footprint bars that come slowly up to the entry (each alert gets a
// beat), then the position runs quickly to its target.
const START = 0.4;
const FAST_TIME = 4.6; // the whole 5-minute approach
const MARK_HOLD = 0.6;
const ZOOM = 0.7; // crossfade from 5-minute to 1-minute bars
const SLOW = 0.34; // per 1-minute bar before the entry
const ALERT_HOLD = 0.55;
const ENTRY_HOLD = 1.0;
const RUN_TIME = 2.6; // the open position, spread over its bars
const EXIT_HOLD = 1.4;
const ENDCARD = 2.8;

export function cues(D) {
  const n5 = D.five.length;
  const per5 = Math.min(1 / 8, Math.max(1 / 24, FAST_TIME / (n5 - D.fiveFrom)));
  const reveal5 = new Array(n5).fill(0);
  let t = START;
  for (let i = D.fiveFrom; i < n5; i++) {
    reveal5[i] = t;
    t += per5;
    if (D.marks.some((m) => m.bar === i)) t += MARK_HOLD;
  }
  const zoom = t + 0.15;
  t = zoom + ZOOM;
  const { signal, exit } = D.trade;
  const reveal1 = new Array(D.ones.length).fill(0);
  const events = [];
  // Long positions (up to ~2 hours) run at up to one bar per 30 fps frame.
  const perRun = Math.min(1 / 4, Math.max(1 / 30, RUN_TIME / (exit - signal)));
  for (let i = D.oneFrom; i <= exit; i++) {
    reveal1[i] = t;
    D.alerts.forEach((a, k) => {
      if (a.bar !== i) return;
      events.push({ type: "alert", alert: k, t });
      t += ALERT_HOLD;
    });
    if (i === signal) {
      events.push({ type: "entry", t });
      t += ENTRY_HOLD;
    }
    if (i === exit) {
      events.push({ type: "exit", t });
      t += EXIT_HOLD;
    }
    t += i < signal ? SLOW : perRun;
  }
  // Bars after the exit stay hidden.
  for (let i = exit + 1; i < D.ones.length; i++) reveal1[i] = Infinity;
  const endcardAt = t;
  const end = endcardAt + ENDCARD;
  const ev = (type) => events.find((e) => e.type === type).t;
  const marks = { zoom: zoom + ZOOM * 0.6, entry: ev("entry"), exit: ev("exit") };
  const order = D.captions.map(([k]) => marks[k]);
  // The case title holds the caption band while the 5-minute bars run.
  const captions = [[START + 0.1, marks.zoom - 0.25, D.title]].concat(
    D.captions.map(([k, text], i) => [marks[k], i + 1 < order.length ? order[i + 1] - 0.05 : endcardAt - 0.05, text]),
  );
  const r = (x) => +x.toFixed(4);
  return {
    END: r(end),
    ENDCARD: ENDCARD,
    ENDCARD_AT: r(endcardAt),
    ZOOM_AT: r(zoom),
    ZOOM_LEN: ZOOM,
    REVEAL5: reveal5.map(r),
    REVEAL1: reveal1.map((x) => (x === Infinity ? 1e9 : r(x))),
    EVENTS: events.map((e) => ({ ...e, t: r(e.t) })),
    CAPTIONS: captions.map(([a, b, s]) => [r(a), r(b), s]),
  };
}
