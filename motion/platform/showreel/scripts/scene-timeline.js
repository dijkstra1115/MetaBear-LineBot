      // ---------- The timeline: the screens are the real lab; this is the camera and the mood ----------
      const tl = gsap.timeline({ paused: true });
      const q = (id) => document.getElementById(id);
      // What is true from the first frame is set before the timeline exists: a tween starting at 0 can
      // read its start values before a set at 0 has rendered.
      const set = (el, vars, at) => (at <= 0 ? gsap.set(el, vars) : tl.set(el, vars, at));
      const fadeIn = (el, at, d = 0.3, from = {}) => tl.fromTo(el, { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, duration: d, ease: "power3.out", immediateRender: false }, at);
      const fadeOut = (el, at, d = 0.16) => tl.to(el, { opacity: 0, duration: d, ease: "power2.in" }, at);
      const chars = (el, at, d = 0.36, each = 0.04, scale = 1.3) => {
        set(el, { opacity: 1 }, at);
        tl.fromTo(el.querySelectorAll(".ch"), { opacity: 0, y: 30, scale }, { opacity: 1, y: 0, scale: 1, duration: d, ease: "expo.out", stagger: each, immediateRender: false }, at);
      };
      const flash = (at, a = 0.7, d = 0.4) => tl.fromTo("#flash", { opacity: a }, { opacity: 0, duration: d, ease: "power2.out", immediateRender: false }, at);
      const sweep = (at) => {
        tl.fromTo("#bar", { x: 0, opacity: 0.9 }, { x: 2800, opacity: 0.9, duration: 0.24, ease: "power2.in", immediateRender: false }, at);
        set("#bar", { opacity: 0 }, at + 0.24);
      };
      // The same seeded jolt every render.
      const jitter = (i) => { const x = Math.sin(i * 91.17 + 7.3) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
      const shake = (at, amp, dur) => {
        const STEP = 1 / 30;
        for (let k = 0; k * STEP < dur; k++) {
          const a = amp * Math.pow(1 - (k * STEP) / dur, 2);
          set("#picture", { x: jitter(k + at * 13) * a, y: jitter(k + at * 29) * a * 0.7 }, at + k * STEP);
        }
        set("#picture", { x: 0, y: 0 }, at + dur);
      };
      // Colour fringing on the big hits, on the whole picture, gone in a moment.
      const chroma = (at, amt, dur) => {
        set("#picture", { filter: "url(#rgb)" }, at);
        tl.fromTo("#cr", { attr: { dx: amt } }, { attr: { dx: 0 }, duration: dur, ease: "power2.out", immediateRender: false }, at);
        tl.fromTo("#cb", { attr: { dx: -amt } }, { attr: { dx: 0 }, duration: dur, ease: "power2.out", immediateRender: false }, at);
        set("#picture", { filter: "none" }, at + dur);
      };
      // A whip pan: the stage flies through under a sideways motion blur.
      // The blur is heaviest where the move is fastest: at the start of a landing, the end of a launch.
      const blurLand = (at, peak, dur) => {
        set("#picture", { filter: "url(#mb)" }, at);
        tl.fromTo("#mbg", { attr: { stdDeviation: `${peak} 0` } }, { attr: { stdDeviation: "0 0" }, duration: dur, ease: "power2.out", immediateRender: false }, at);
        set("#picture", { filter: "none" }, at + dur);
      };
      const blurLaunch = (at, peak, dur) => {
        set("#picture", { filter: "url(#mb)" }, at);
        tl.fromTo("#mbg", { attr: { stdDeviation: "0 0" } }, { attr: { stdDeviation: `${peak} 0` }, duration: dur, ease: "power2.in", immediateRender: false }, at);
      };
      const whipIn = (at, dir) => tl.fromTo("#stage", { x: dir * 2400 }, { x: 0, duration: 0.3, ease: "expo.out", immediateRender: false }, at);

      // ---------- I. One stretch of the market, one chart, one take: the trades come one after another ----------
      const W_ = 2.4;
      const world = q("world");
      const hero = `#tile${HERO.wall}`;
      const TX = HERO.cx, TY = HERO.cy;
      const cam = (k, x, y, d, at, ease = "sine.inOut") => tl.to(world, { x: -TX * W_ * k + x, y: -TY * W_ * k + y, scale: W_ * k, duration: d, ease }, at);
      const right = (k) => 960 - 960 * k;
      set("#wall", { opacity: 1 }, 0);
      set(".tile", { opacity: 1 }, 0);
      for (const part of [".t-at", ".t-res", ".t-edge"]) set(`${hero} ${part}`, { opacity: 0 }, 0);
      set(`#tv${HERO.wall}`, { opacity: 1 }, 0);
      set(world, { x: -TX * W_ * 1.03 + right(1.03), y: -TY * W_ * 1.03 + 8, scale: W_ * 1.03, rotationX: 0, rotationY: 0, rotation: 0 }, 0);
      set("#scrim-b", { opacity: 1 }, 0);
      set("#legal", { opacity: 1 }, 0);
      set("#day", { opacity: 1 }, 0);
      chars(q("wall-line"), 0.08, 0.3, 0.03);
      fadeOut("#wall-line", 2.86, 0.14);
      fadeOut("#scrim-b", 2.86, 0.14);
      // Each signal draws the eye with a touch of gold around the frame; the chart does the rest.
      for (const at of [TAKE.t1Sig, TAKE.t2Sig, TAKE.t3Sig, TAKE.t4Sig]) tl.fromTo("#hit-sig", { opacity: 0.8 }, { opacity: 0, duration: 0.4, ease: "power2.out", immediateRender: false }, at);
      // The log of the stretch builds up in the corner: each result stays, and nothing is totalled.
      const result = (k, at) => tl.fromTo(`#chip${k}`, { opacity: 1, scale: 2.2 }, { opacity: 1, scale: 1, duration: 0.18, ease: "back.out(2.4)", immediateRender: false }, at);
      result(0, TAKE.t1Stop);
      tl.fromTo("#hit-stop", { opacity: 0.9 }, { opacity: 0, duration: 0.45, ease: "power2.out", immediateRender: false }, TAKE.t1Stop);
      shake(TAKE.t1Stop, 16, 0.28);
      result(1, TAKE.t2Tp);
      tl.fromTo("#hit-tp", { opacity: 0.9 }, { opacity: 0, duration: 0.45, ease: "power2.out", immediateRender: false }, TAKE.t2Tp);
      shake(TAKE.t2Tp, 14, 0.28);
      result(2, TAKE.stop);
      result(3, S.tp);
      // The chart does the zooming, on its own bars; the camera only drifts, and never cuts.
      cam(1.07, right(1.07), 12, S.tp, 0, "none");

      // The third trade stops out.
      tl.fromTo("#hit-stop", { opacity: 1 }, { opacity: 0, duration: 0.7, ease: "power2.out", immediateRender: false }, TAKE.stop);
      tl.to("#scrim-b", { opacity: 0.6, duration: 0.08, ease: "none" }, TAKE.stop - 0.04);
      chars(q("cap-stop"), TAKE.stop, 0.2, 0.03, 1.6);
      shake(TAKE.stop, 16, 0.4);
      fadeOut("#cap-stop", TAKE.entry - 0.1, 0.1);

      // The same line again, and everything climbs with it.
      chars(q("cap-again"), TAKE.entry, 0.22, 0.05, 1.5);
      fadeOut("#cap-again", S.tp - 0.1, 0.1);
      tl.to("#scrim-b", { opacity: 1, duration: 0.1, ease: "none" }, S.tp - 0.1);

      // ---------- III. Target: the drop, and the camera pulls back to every trade on the wall ----------
      flash(S.tp, 1, 0.55);
      chroma(S.tp, 26, 0.42);
      shake(S.tp, 34, 0.7);
      tl.fromTo("#wall", { filter: "saturate(1.7) brightness(1.3)" }, { filter: "saturate(1) brightness(1)", duration: 0.7, ease: "power2.out", immediateRender: false }, S.tp);
      tl.fromTo("#hit-tp", { opacity: 1 }, { opacity: 0, duration: 0.8, ease: "power2.out", immediateRender: false }, S.tp);
      chars(q("tp-big"), S.tp + 0.02, 0.3, 0.03, 2);
      fadeOut("#tp-big", S.tp + 0.86, 0.14);
      fadeOut(".chip", S.tp + 0.72, 0.14);
      fadeOut("#day", S.tp + 0.72, 0.14);
      fadeOut("#scrim-b", S.tp + 0.86, 0.14);
      const BACK = 1.15;
      tl.to(world, { x: -60, y: 0, scale: 0.365, rotationX: 7, rotationY: -7, duration: BACK, ease: "expo.out" }, S.tp + 0.03);
      tl.to(world, { scale: 0.385, rotationY: -4, duration: S.rail - 0.18 - S.tp - 0.03 - BACK, ease: "none" }, S.tp + 0.03 + BACK);
      for (const part of [".t-at", ".t-res", ".t-edge"]) fadeIn(`${hero} ${part}`, S.tp + 0.35, 0.2);
      // A wave of light from the tile the camera left.
      WALL.forEach((w, i) => {
        const far = Math.hypot(w.col - HERO.col, w.row - HERO.row);
        tl.fromTo(`#tile${i}`, { filter: "brightness(2.1)" }, { filter: "brightness(1)", duration: 0.55, ease: "power2.out", immediateRender: false }, S.tp + 0.08 + far * 0.07);
      });
      fadeOut("#legal", S.rail - 0.18, 0.12);

      // ---------- IV. 盤面旁白, a whip across to the rail ----------
      tl.to("#wall", { x: -2600, duration: 0.18, ease: "power3.in" }, S.rail - 0.18);
      blurLaunch(S.rail - 0.18, 90, 0.18);
      blurLand(S.rail, 90, 0.3);
      sweep(S.rail - 0.1);
      set("#wall", { opacity: 0 }, S.rail);
      const A = q("scr-railA"), B = q("scr-railB");
      const RAIL = { scale: 1.55, x: -650, y: 120 };
      tl.fromTo(A, { opacity: 1, ...RAIL, x: RAIL.x + 700 }, { opacity: 1, ...RAIL, duration: 0.42, ease: "expo.out", immediateRender: false }, S.rail);
      // The whole 1-minute chart holds still a moment before the press, so the replay reads as this chart.
      const HOLD = 0.2;
      tl.to(A, { scale: 1.62, x: -690, y: 40, duration: 1.2 - HOLD, ease: "none" }, S.rail + 0.42);
      tl.to(A, { scale: 1, x: 0, y: 0, duration: 0.38, ease: "power3.inOut" }, S.replayBtn - 0.38 - HOLD);
      set(A, { opacity: 0 }, S.replayBtn);
      set(B, { opacity: 1, scale: 1, x: 0, y: 0 }, S.replayBtn);
      tl.to(B, { scale: 1.06, x: 52, y: -10, duration: S.feat - S.replayBtn, ease: "none" }, S.replayBtn);
      fadeIn("#scrim-l", S.rail, 0.25);
      fadeOut("#scrim-l", S.replayBtn - 0.4 - HOLD, 0.3);
      chars(q("name-rail"), S.rail + 0.06, 0.4, 0.06);
      fadeOut("#name-rail", S.replayBtn - 0.42 - HOLD, 0.18);
      chars(q("name-btn"), S.replayBtn + 0.04, 0.32, 0.05);
      fadeOut("#name-btn", S.feat - 0.1, 0.1);

      // ---------- V. The views, faster and faster ----------
      set(B, { opacity: 0 }, S.feat);
      fadeIn("#scrim-b", S.feat, 0.14);
      FEATURES.forEach((f, i) => {
        const el = q(`scr-${f.id}`);
        tl.fromTo(el, { opacity: 1, ...f.from }, { opacity: 1, ...f.to, duration: f.d, ease: "none", immediateRender: false }, f.at);
        set(el, { opacity: 0 }, f.at + f.d);
        if (i < 3) {
          whipIn(f.at, i % 2 ? -1 : 1);
          blurLand(f.at, 80, 0.26);
          // The view switches on in step with the music: the page's own checkbox.
          chroma(f.at + f.on, 9, 0.2);
          tl.fromTo("#stage", { scale: 1.03 }, { scale: 1, duration: 0.4, ease: "power2.out", immediateRender: false }, f.at + f.on);
        } else {
          flash(f.at, 0.32, 0.18);
        }
        if (f.name) {
          const n = q(`fname${i}`);
          chars(n.querySelector(".nm"), f.at + 0.03, 0.22, f.d > 0.8 ? 0.035 : 0.015);
          set(n, { opacity: 1 }, f.at);
          const sub = n.querySelector(".sub");
          if (sub) fadeIn(sub, f.at + 0.25, 0.2);
          set(n, { opacity: 0 }, f.at + f.d);
        }
      });
      for (let k = S.feat + 2.5; k < S.black - 0.01; k += 0.5) if (!FEATURES.some((f) => f.at === k)) tl.fromTo("#picture", { scale: 1.012 }, { scale: 1, duration: 0.4, ease: "power2.out", immediateRender: false }, k);
      set("#scrim-b", { opacity: 0 }, S.black);

      // ---------- VI. Second silence: black, one line, the ring winding up in the dark ----------
      set("#stage", { opacity: 0 }, S.black);
      chars(q("tagline"), S.black + 0.2, 0.7, 0.07, 1.04);
      set("#ring", { opacity: 0, scale: 0.56, rotationX: 9 }, S.black);
      // The ring turns the way it will after the drop and reaches the drop's speed exactly on it: a
      // power2.in ends at 3Δ/T and the power3.out below starts at 4Δ/T, so it never stops.
      const SPIN = 600, WIND = ((4 * SPIN) / (S.implode - S.ring)) * ((S.ring - S.black) / 3);
      tl.fromTo("#tier-top", { rotationY: -150 - WIND }, { rotationY: -150, duration: S.ring - S.black, ease: "power2.in", immediateRender: false }, S.black);
      tl.fromTo("#tier-bot", { rotationY: 150 + WIND }, { rotationY: 150, duration: S.ring - S.black, ease: "power2.in", immediateRender: false }, S.black);
      FLICKER.forEach((t, i) => {
        tl.fromTo("#ring", { opacity: 0.42 + i * 0.06 }, { opacity: 0.06, duration: Math.min(0.22, 0.05 + (FLICKER[i + 1] ?? S.ring) - t), ease: "power2.out", immediateRender: false }, t);
      });
      tl.to("#ring", { opacity: 0.7, duration: 0.1, ease: "power2.in" }, S.ring - 0.1);
      fadeOut("#tagline", S.ring - 0.3, 0.25);

      // ---------- VII. The second explosion: every view, turning ----------
      flash(S.ring, 1, 0.6);
      chroma(S.ring, 34, 0.5);
      shake(S.ring, 40, 0.8);
      set("#ring", { opacity: 1 }, S.ring);
      tl.fromTo("#ring", { scale: 0.56, rotationX: 9 }, { scale: 0.84, rotationX: 2, duration: 1.1, ease: "expo.out", immediateRender: false }, S.ring);
      tl.to("#ring", { scale: 0.9, rotationX: 4, duration: S.implode - S.ring - 1.1, ease: "none" }, S.ring + 1.1);
      tl.fromTo("#tier-top", { rotationY: -150 }, { rotationY: -150 + SPIN, duration: S.implode - S.ring, ease: "power3.out", immediateRender: false }, S.ring);
      tl.fromTo("#tier-bot", { rotationY: 150 }, { rotationY: 150 - SPIN, duration: S.implode - S.ring, ease: "power3.out", immediateRender: false }, S.ring);
      set("#ring-dim", { opacity: 1 }, S.ring);
      chars(q("ring-title"), S.ring + 0.04, 0.42, 0.07, 1.9);
      for (let k = S.ring + 1; k < S.implode - 0.01; k += 0.5) tl.fromTo("#ring-view", { scale: 1.014 }, { scale: 1, duration: 0.42, ease: "power2.out", immediateRender: false }, k);

      // Everything is sucked to the centre.
      const IMP = S.logo - 0.2 - S.implode;
      tl.to("#ring", { scale: 0, duration: IMP, ease: "power3.in" }, S.implode);
      tl.to("#tier-top", { rotationY: 840, duration: IMP, ease: "power2.in" }, S.implode);
      tl.to("#tier-bot", { rotationY: -840, duration: IMP, ease: "power2.in" }, S.implode);
      tl.to("#ring-title", { scale: 0.2, opacity: 0, duration: IMP, ease: "power3.in" }, S.implode);
      fadeOut("#ring-dim", S.logo - 0.3, 0.1);
      set("#ring", { opacity: 0 }, S.logo - 0.2);

      // ---------- End card ----------
      flash(S.logo, 1, 0.6);
      shake(S.logo, 16, 0.35);
      set("#logo-wrap", { opacity: 1 }, S.logo);
      tl.fromTo("#logo", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55, ease: "expo.out", immediateRender: false }, S.logo);
      tl.fromTo("#brand", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out", immediateRender: false }, S.logo + 0.12);
      tl.fromTo("#url", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, ease: "power3.out", immediateRender: false }, S.logo + 0.3);
      fadeIn("#legal-end", S.logo + 0.3, 0.3);
      tl.to("#black", { opacity: 1, duration: 0.28, ease: "power1.in" }, S.end - 0.28);

      // Film grain: the tile jumps 24 times a second.
      tl.to("#grain", { backgroundPosition: "7337px 4919px", duration: S.end, ease: `steps(${S.end * 24})` }, 0);
      tl.to({}, { duration: S.end }, 0);
      window.__timelines["main"] = tl;
