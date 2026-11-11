// Named moments of the film, read from the narration's word times (assets/data/timeline.js), so the
// picture and the sound effects follow the voice if a take is re-recorded. Used by the world scene
// and by scripts/events.mjs (the sound effects).
(function () {
  const TL = window.TL;
  const chunk = (id) => TL.chunks.find((c) => c.id === id);
  const clean = (s) => s.replace(/[.,:;?!“”"]/g, "");
  // Start of the nth token in chunk `id` whose text is `text` (punctuation ignored).
  function cue(id, text, nth = 0, edge = "start") {
    let k = 0;
    for (const l of chunk(id).lines)
      for (const t of l.tokens)
        if (clean(t.text) === clean(text) && k++ === nth) return t[edge];
    throw new Error(`cue ${id} "${text}" #${nth} not found`);
  }
  const end = (id, text, nth = 0) => cue(id, text, nth, "end");
  const B = {
    duration: TL.duration,
    // 1 hook
    plus5: cue(1, "+5%"),
    average: cue(1, "average"),
    bet: cue(1, "Bet"),
    lapse: cue(1, "and"),
    out: cue(1, "out"),
    // 2 split
    split: chunk(2).start,
    lying: cue(2, "lying"),
    nobody: cue(2, "Nobody"),
    aboutYou: cue(2, "you"),
    thousand: cue(2, "thousand"),
    together: cue(2, "together"),
    // 3 pair
    pair: chunk(3).start,
    heads: cue(3, "Heads"),
    tails: cue(3, "Tails"),
    win: cue(3, "Win"),
    c150: cue(3, "150"),
    lose: cue(3, "Lose"),
    c90: cue(3, "90"),
    down: cue(3, "down"),
    // 4 gap
    gap: chunk(4).start,
    drop40: cue(4, "40%"),
    need67: cue(4, "67%"),
    gives: cue(4, "gives"),
    c50: cue(4, "50"),
    avg5: cue(4, "average"),
    you5: cue(4, "You"),
    // 5 crowd
    crowd: chunk(5).start,
    flip100: cue(5, "flip"),
    past10k: cue(5, "$10,000"),
    middle: cue(5, "middle"),
    c52: cue(5, "52¢"),
    // 6 tower
    tower: chunk(6).start,
    thisOne: cue(6, "this"),
    million: cue(6, "$7.5 million"),
    p73: cue(6, "73%"),
    // 7 paths
    paths: chunk(7).start,
    ensemble: cue(7, "ensemble"),
    yourPath: cue(7, "Your"),
    ergodic: cue(7, "ergodic"),
    isnt: cue(7, "isn't"),
    oneUniverse: cue(7, "one", 2),
    // 8 kelly
    kelly: chunk(8).start,
    betLess: cue(8, "bet"),
    betAll: cue(8, "Bet", 0),
    betHalf: cue(8, "Bet", 1),
    betQuarter: cue(8, "Bet", 2),
    peaks: cue(8, "peaks"),
    kellyName: cue(8, "Kelly"),
    // 9 rerun
    rerun: chunk(9).start,
    sameFlips: cue(9, "same"),
    c186: cue(9, "$186"),
    seven: cue(9, "Seven"),
    c364: cue(9, "$364"),
    worse: cue(9, "Kelly"),
    richer: cue(9, "richer"),
    // 10 coda
    coda: chunk(10).start,
    yourself: cue(10, "yourself"),
    // 11 share
    share: chunk(11).start,
    friend: cue(11, "friend"),
    positive: cue(11, "positive"),
    allIn: cue(11, "all"),
    lastWord: end(11, "in"),
  };
  window.BEATS = B;
})();
