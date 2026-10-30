      // ---------- The timeline: the screens are the real lab; this is the camera and the mood ----------
      // Each wall tile is a real mini-chart: the bars around the trade and its box, drawn once at load.
      WALL.forEach((w, i) => {
        const g = document.getElementById(`tc${i}`).getContext("2d");
        const W = 800, H = 450, x0 = 22, x1 = W - 22, y0 = 76, y1 = H - 20;
        let lo = Math.min(w.stop, w.tp), hi = Math.max(w.stop, w.tp);
        for (const b of w.bars) { lo = Math.min(lo, b[2]); hi = Math.max(hi, b[1]); }
        const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
        const X = (k) => x0 + ((k + 0.5) / w.bars.length) * (x1 - x0);
        const Y = (p) => y1 - ((p - lo) / (hi - lo)) * (y1 - y0);
        const bw = Math.max(3, ((x1 - x0) / w.bars.length) * 0.66);
        const a = X(w.i0), b = X(w.i1) + bw;
        g.fillStyle = "rgba(120,225,213,0.2)";
        g.fillRect(a, Math.min(Y(w.entry), Y(w.tp)), b - a, Math.abs(Y(w.tp) - Y(w.entry)));
        g.fillStyle = "rgba(240,154,90,0.22)";
        g.fillRect(a, Math.min(Y(w.entry), Y(w.stop)), b - a, Math.abs(Y(w.stop) - Y(w.entry)));
        g.strokeStyle = "rgba(237,242,237,0.75)";
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(a, Y(w.entry)); g.lineTo(b, Y(w.entry)); g.stroke();
        w.bars.forEach((c, k) => {
          const col = c[3] >= c[0] ? "#78e1d5" : "#f09a5a", x = X(k);
          g.strokeStyle = g.fillStyle = col;
          g.beginPath(); g.moveTo(x, Y(c[1])); g.lineTo(x, Y(c[2])); g.stroke();
          g.fillRect(x - bw / 2, Math.min(Y(c[0]), Y(c[3])), bw, Math.max(2, Math.abs(Y(c[3]) - Y(c[0]))));
        });
      });

      gsap.set(".lb", { scaleY: 0 });
      const tl = gsap.timeline({ paused: true });
      const q = (id) => document.getElementById(id);
      const set = (el, vars, at) => tl.set(el, vars, at);
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

      // ---------- I. The wall builds ----------
      const TX = 425, TY = 0; // the tile the film enters, in world units
      set("#wall", { opacity: 1 }, 0);
      const world = q("world");
      tl.fromTo(world, { x: 1912, y: 900, scale: 0.9, rotationX: 16, rotationY: -18, rotation: -3 }, { x: -60, y: 0, scale: 0.365, rotationX: 7, rotationY: -7, rotation: 0, duration: S.quiet - 0.05, ease: "power2.inOut", immediateRender: false }, 0);
      WALL.forEach((w, i) => {
        const at = 0.1 + (w.col + w.row) * 0.2 + (i % 3) * 0.03;
        tl.fromTo(`#tile${i}`, { opacity: 0, rotationY: 115, z: 200 }, { opacity: 1, rotationY: 0, z: 0, duration: 0.34, ease: "expo.out", immediateRender: false }, at);
      });
      fadeIn("#scrim-b", 1.3, 0.3);
      chars(q("wall-line"), 1.35, 0.34, 0.035);

      // ---------- II. Sudden silence: one tile comes alive and the camera creeps in ----------
      set("#wall-line", { opacity: 0 }, S.quiet);
      set("#scrim-b", { opacity: 0 }, S.quiet);
      tl.to("#wall", { filter: "saturate(0.4) brightness(0.92)", duration: 0.5, ease: "power2.out" }, S.quiet);
      fadeIn("#vig-hard", S.quiet, 0.8);
      tl.fromTo(".lb", { scaleY: 0 }, { scaleY: 0.62, duration: 0.7, ease: "power3.inOut", immediateRender: false }, S.quiet + 0.05);
      tl.to(".tile:not(#tile3)", { opacity: 0.1, filter: "blur(7px)", duration: 0.4, ease: "power2.out" }, S.quiet);
      fadeOut("#tile3 .t-at", S.quiet + 0.02, 0.2);
      fadeOut("#tile3 .t-res", S.quiet + 0.02, 0.2);
      fadeIn("#tv", S.quiet + 0.2, 0.5);
      tl.to(world, { x: -TX * 0.66, y: -TY * 0.66, scale: 0.66, rotationX: 1, rotationY: -1, duration: 1.45, ease: "sine.inOut" }, S.quiet);
      tl.to(world, { x: -TX * 2.4, y: -TY * 2.4, scale: 2.4, rotationX: 0, rotationY: 0, duration: S.full - S.quiet - 1.45, ease: "power3.in" }, S.quiet + 1.45);
      fadeOut("#tile3 .t-edge", S.full - 0.3, 0.3);
      fadeIn("#legal", S.full - 0.1, 0.4);

      // From here the tile is the screen. k is how far past full frame the camera is.
      const W_ = 2.4;
      const cam = (k, x, y, d, at, ease = "sine.inOut", extra = {}) => tl.to(world, { x: -TX * W_ * k + x, y: -TY * W_ * k + y, scale: W_ * k, duration: d, ease, ...extra }, at);
      const camSet = (k, x, y, at) => set(world, { x: -TX * W_ * k + x, y: -TY * W_ * k + y, scale: W_ * k }, at);
      const right = (k) => 960 - 960 * k;

      // The first trade opens, price sinks toward the line.
      chars(q("cap-open"), TAKE.full, 0.3, 0.05);
      cam(1.22, right(1.22), 24, TAKE.fpCut - 0.2 - S.full, S.full);
      cam(1.6, right(1.6), 60, 0.2, TAKE.fpCut - 0.2, "power3.in");

      // Into the footprint. It stops out.
      camSet(1.12, 115, 65, TAKE.fpCut);
      flash(TAKE.fpCut, 0.28, 0.25);
      fadeOut("#cap-open", TAKE.fpCut - 0.12, 0.12);
      cam(1.2, 150, 62, TAKE.entry - TAKE.fpCut, TAKE.fpCut, "none");
      tl.fromTo("#hit-stop", { opacity: 1 }, { opacity: 0, duration: 0.9, ease: "power2.out", immediateRender: false }, TAKE.stop);
      chars(q("cap-stop"), TAKE.stop, 0.22, 0.03, 1.6);
      shake(TAKE.stop, 16, 0.45);
      tl.to("#wall", { filter: "saturate(0.2) brightness(0.92)", duration: 0.35, ease: "power2.out" }, TAKE.stop);
      fadeOut("#cap-stop", TAKE.why - 0.14, 0.14);
      chars(q("cap-why"), TAKE.why, 0.3, 0.05);
      fadeOut("#cap-why", TAKE.entry - 0.1, 0.1);

      // The same line again: colour starts to come back, the frame tightens.
      chars(q("cap-again"), TAKE.entry, 0.26, 0.05, 1.5);
      flash(TAKE.entry, 0.16, 0.22);
      tl.to("#wall", { filter: "saturate(0.6) brightness(0.96)", duration: S.breath - TAKE.entry, ease: "power1.in" }, TAKE.entry);
      cam(1.5, 150, 40, 0.2, TAKE.zoomOut - 0.2, "power3.in");
      camSet(1.26, right(1.26), 34, TAKE.zoomOut);
      flash(TAKE.zoomOut, 0.14, 0.2);
      cam(1.5, right(1.5), 92, S.tp - TAKE.zoomOut, TAKE.zoomOut, "power1.in");
      tl.to(".lb", { scaleY: 0.92, duration: S.breath - TAKE.zoomOut, ease: "power2.in" }, TAKE.zoomOut);
      fadeOut("#cap-again", S.breath - 0.1, 0.1);

      // ---------- III. Target: the first explosion ----------
      flash(S.tp, 1, 0.55);
      chroma(S.tp, 26, 0.42);
      shake(S.tp, 34, 0.7);
      set("#vig-hard", { opacity: 0 }, S.tp);
      fadeOut("#legal", S.tp - 0.01, 0.01);
      tl.to(".lb", { scaleY: 0, duration: 0.22, ease: "expo.out" }, S.tp);
      tl.fromTo("#wall", { filter: "saturate(1.7) brightness(1.3)" }, { filter: "saturate(1) brightness(1)", duration: 0.7, ease: "power2.out", immediateRender: false }, S.tp);
      cam(1.05, right(1.05), 0, 0.42, S.tp, "expo.out");
      tl.fromTo("#hit-tp", { opacity: 1 }, { opacity: 0, duration: 0.8, ease: "power2.out", immediateRender: false }, S.tp);
      fadeIn("#scrim-b", S.tp, 0.12);
      chars(q("tp-big"), S.tp + 0.02, 0.3, 0.03, 2);
      fadeOut("#tp-big", S.rail - 0.16, 0.14);
      fadeOut("#scrim-b", S.rail - 0.16, 0.14);

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
          // The view switches on half a second in, on the beat: the page's own checkbox.
          chroma(f.at + 0.5, 9, 0.2);
          tl.fromTo("#stage", { scale: 1.03 }, { scale: 1, duration: 0.4, ease: "power2.out", immediateRender: false }, f.at + 0.5);
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
      // The ring turns the way it will after the drop and reaches the drop's speed exactly on it (a
      // power2.in over 2 s and the power3.out below both run at 545°/s there), so it never stops.
      tl.fromTo("#tier-top", { rotationY: -513 }, { rotationY: -150, duration: S.ring - S.black, ease: "power2.in", immediateRender: false }, S.black);
      tl.fromTo("#tier-bot", { rotationY: 513 }, { rotationY: 150, duration: S.ring - S.black, ease: "power2.in", immediateRender: false }, S.black);
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
      tl.fromTo("#tier-top", { rotationY: -150 }, { rotationY: 450, duration: S.implode - S.ring, ease: "power3.out", immediateRender: false }, S.ring);
      tl.fromTo("#tier-bot", { rotationY: 150 }, { rotationY: -450, duration: S.implode - S.ring, ease: "power3.out", immediateRender: false }, S.ring);
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
