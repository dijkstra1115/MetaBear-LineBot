// The one data module: every number on screen comes from here.
// Game: heads multiplies the bet part by 1.5, tails by 0.6. A player who bets fraction f of wealth
// ends a flip with (1 + 0.5 f) or (1 - 0.4 f) times their wealth. Flips come from assets/data/sim.js.
(function () {
  const SIM = window.SIM;
  const N = SIM.players;
  const R = SIM.rounds;
  const START = 100;

  function run(f) {
    const up = 1 + 0.5 * f;
    const dn = 1 - 0.4 * f;
    const w = [];
    let cur = new Float64Array(N).fill(START);
    w.push(cur);
    for (let r = 0; r < R; r++) {
      const row = SIM.flips[r];
      const next = new Float64Array(N);
      for (let i = 0; i < N; i++) next[i] = cur[i] * (row.charCodeAt(i) === 49 ? up : dn);
      w.push(next);
      cur = next;
    }
    const stats = w.map((arr) => {
      const s = Array.from(arr).sort((a, b) => a - b);
      let sum = 0;
      let max = -1;
      let arg = 0;
      let below = 0;
      for (let i = 0; i < N; i++) {
        sum += arr[i];
        if (arr[i] > max) {
          max = arr[i];
          arg = i;
        }
        if (arr[i] < START - 1e-9) below++;
      }
      return { mean: sum / N, median: (s[N / 2 - 1] + s[N / 2]) / 2, max, argmax: arg, below, sum };
    });
    return { f, up, dn, w, stats };
  }

  // Typical (median) wealth after 100 flips when betting fraction f: 100 * ((1+0.5f)(1-0.4f))^50.
  function typical(f, rounds = R) {
    return START * Math.pow((1 + 0.5 * f) * (1 - 0.4 * f), rounds / 2);
  }
  // Growth of the typical player per flip, as a fraction.
  function growth(f) {
    return Math.sqrt((1 + 0.5 * f) * (1 - 0.4 * f)) - 1;
  }

  const allIn = run(1);
  const kelly = run(0.25);
  const YOU = 0; // player 0 flips exactly 50 heads: the person in the middle
  const rich = allIn.stats[R].argmax;

  window.MODEL = { N, R, START, allIn, kelly, YOU, rich, typical, growth, kellyF: 0.25 };
})();
