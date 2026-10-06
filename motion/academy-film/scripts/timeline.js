        // Inserted into index.html by scripts/build.mjs, inside document.fonts.ready (word widths are measured once).
        Object.assign(cam, { z: -100, focus: -100, ry: 3, dof: 0.006 });
        // shallow depth of field only once the camera commits to the word: the tools behind stay legible at first
        tl.to(cam, { dof: 0.016, duration: 0.8, ease: "power2.inOut", onUpdate: applyCamera }, C.fragmented - 0.2);
        const line = document.getElementById("line1");
        const gw = document.getElementById("w-8");
        const gx = gw.offsetLeft + gw.offsetWidth / 2 - line.offsetWidth / 2;
        const fade = (id, t, d, a, ease = "power2.out") => tl.fromTo(byId[id], { alpha: byId[id].alpha }, { alpha: a, duration: d, ease, immediateRender: false, onUpdate: applyCamera }, t);
        const mblur = (t, peak, up = 0.4, down = 0.5) => {
          tl.to(cam, { mblur: peak, duration: up, ease: "power2.in", onUpdate: applyCamera }, t);
          tl.to(cam, { mblur: 0, duration: down, ease: "power2.out", onUpdate: applyCamera }, t + up);
        };

        // ---- the light ----
        lit(0.05, 1.0, { inten: 0.3 });
        lit(C.fragmented - 0.5, 1.0, { inten: 0.85, lift: -0.02, warp: 0.4 });
        lit(C.l1end + 0.1, 0.9, { inten: 0.4, lift: 0.12, warp: 0.1 });
        lit(C.too2, 1.0, { inten: 0.3, lift: 0.2 });
        lit(C.so - 0.2, 1.2, { inten: 0.45, lift: -0.04, warp: 0.3 });
        lit(C.metabear - 0.35, 0.7, { inten: 1.0, lift: -0.1, warp: 0.7 });
        lit(C.pick - 0.6, 1.0, { inten: 0.35, lift: 0.22, warp: 0.1 });
        lit(C.watch, 1.0, { inten: 0.2, lift: 0.3 });
        lit(C.decisions - 0.2, 0.8, { inten: 0.42 });
        lit(C.every - 0.6, 1.2, { inten: 0.55, lift: -0.02, warp: 0.3 });
        lit(FIN - 0.2, 0.8, { inten: 0.85, lift: -0.06, warp: 0.5 });
        tl.eventCallback("onUpdate", () => drawLight(tl.time()));

        // fragmented: the word comes apart letter by letter as it is spoken
        for (let k = 0; k < NFRAG; k++) {
          const h = (n) => Math.abs((Math.sin(k * 12.9898 + n * 78.233) * 43758.5453) % 1);
          tl.to("#fl-" + k, { x: (k - NFRAG / 2) * 7 + (h(1) - 0.5) * 14, y: (h(2) - 0.5) * 30, rotation: (h(3) - 0.5) * 18, opacity: 0.65 + h(4) * 0.35, duration: 0.9, ease: "power3.out" }, C.fragmented + 0.25 + k * 0.012);
        }
        // ---- A · the line, with the noise of tools already floating behind it ----
        WORDS.forEach((w, i) => focusIn("#w-" + i, w.t - 0.05, 0.5));
        FGS.forEach((c) => tl.fromTo(byId["o-" + c.id], { alpha: 0 }, { alpha: c.a, duration: 1.0, ease: "power2.out", onUpdate: applyCamera }, 0.1));
        CARDS.forEach((c, i) => tl.fromTo(byId["o-" + c.id], { alpha: 0 }, { alpha: 0.75, duration: 1.2, ease: "power2.out", onUpdate: applyCamera }, 0.15 + i * 0.05));
        leg(0, C.fragmented, { z: 80, ry: -2, focus: 80 }, "sine.inOut");
        tl.to("#line1 span:not(#w-8)", { opacity: 0.35, filter: "blur(5px)", duration: 0.6, ease: "power2.inOut" }, C.fragmented + 0.1);
        leg(C.fragmented + 0.05, C.l1end - C.fragmented + 0.05, { x: -gx, z: 560, ry: -6, focus: 560 }, "power2.inOut");
        leg(C.l1end + 0.1, 0.85, { x: 0, y: 20, z: 1480, rx: -2, ry: 7, focus: 140 }, "power3.inOut");
        mblur(C.l1end + 0.15, 7, 0.4, 0.45);
        CARDS.forEach((c, i) => fade("o-" + c.id, C.l1end + 0.3 + i * 0.05, 0.6, c.a));
        fade("o-line", C.l1end + 0.5, 0.3, 0, "power2.in");

        // ---- B · too many indicators, too many opinions ----
        leg(C.too1 + 0.15, C.too2 - C.too1 - 0.25, { z: 1560, x: -40, ry: -3, rx: 0, focus: 200 }, "sine.inOut");
        focusIn("#h1a", C.too1, 0.5);
        focusIn("#h1b", C.indicators, 0.55);
        fade("o-h1", C.too2 - 0.35, 0.35, 0, "power2.in");
        extra("o-h1", C.too2 - 0.35, 0.35, 10, "power2.in");
        leg(C.too2 - 0.1, 1.0, { z: 1600, x: -150, ry: -9, focus: 360 }, "power3.inOut");
        focusIn("#h2a", C.too2 + 0.05, 0.5);
        focusIn("#h2b", C.opinions, 0.55);
        OPINION.forEach((id) => extra("o-" + id, C.too2, 0.8, -2.5));
        leg(C.opinions + 0.6, C.so - C.opinions - 0.85, { z: 1640, x: -190, ry: -11 }, "sine.inOut");

        // ---- C · so we built…: every tool is squeezed into one point (the sub drop carries it) ----
        fade("o-h2", C.so - 0.35, 0.35, 0, "power2.in");
        extra("o-h2", C.so - 0.35, 0.35, 10, "power2.in");
        leg(C.so - 0.25, C.l3pause - C.so + 0.2, { x: 0, y: 0, ry: 0, rx: 0, z: 1520, focus: 60 }, "power2.inOut");
        const SQ = C.so - 0.15;
        [...CARDS, ...FGS].forEach((c, i) => {
          const o = byId["o-" + c.id];
          const d = 0.85 + (i % 4) * 0.06;
          tl.to(o, { x: 0, y: 0, z: -1460, s: 0.08, extra: 6, duration: d, ease: "power3.in", onUpdate: applyCamera }, SQ + (i % 5) * 0.025);
          tl.to(o, { alpha: 0, duration: 0.25, ease: "power2.in", onUpdate: applyCamera }, SQ + d - 0.22 + (i % 5) * 0.025);
        });
        mblur(SQ + 0.35, 3.5, 0.45, 0.5);
        focusIn("#so1", C.so, 0.45);
        focusIn("#so2", C.so + 0.14, 0.45);
        focusIn("#so3", C.built, 0.5);
        focusIn("#so4", C.built + 0.25, 0.5);
        tl.to("#so", { opacity: 0, filter: "blur(16px)", duration: 0.4, ease: "power2.in" }, C.l3pause);
        // the logo arrives out of the depth
        leg(C.l3pause - 0.05, C.metabear - C.l3pause + 0.1, { z: 2470, focus: -130 }, "power3.inOut");
        mblur(C.l3pause + 0.1, 6, 0.35, 0.5);
        fade("o-logo", C.l3pause + 0.1, 0.5, 1);
        tl.fromTo("#logo-b", { rotation: -300, scale: 0.6 }, { rotation: 0, scale: 1, duration: 1.0, ease: "expo.out" }, C.metabear - 0.35);
        tl.fromTo("#logo-w", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "power3.out" }, C.metabear);
        fade("o-logosub", C.academy + 0.15, 0.6, 1);
        leg(C.metabear + 0.1, C.pick - 0.85 - C.metabear - 0.1, { z: 2560 }, "sine.out");

        // ---- D · pick a question ----
        leg(C.pick - 0.75, 0.95, { z: 3300, y: -10, focus: 0 }, "power3.inOut");
        mblur(C.pick - 0.65, 4, 0.35, 0.45);
        fade("o-logo", C.pick - 0.7, 0.4, 0, "power2.in");
        fade("o-logosub", C.pick - 0.7, 0.4, 0, "power2.in");
        fade("o-q", C.pick - 0.55, 0.5, 1);
        Q.forEach((q, i) => tl.fromTo("#q-" + i, { opacity: 0 }, { opacity: 1, duration: 0.01 }, q.t));
        tl.to("#qph", { opacity: 0, duration: 0.08 }, Q[0].t - 0.02);
        tl.fromTo("#caret", { opacity: 1 }, { opacity: 0, duration: 0.25, repeat: 7, yoyo: true, ease: "steps(1)" }, C.pick - 0.55);
        tl.fromTo("#cursor", { x: 980, y: 320, opacity: 0 }, { x: 960, y: 300, opacity: 1, duration: 0.2 }, C.question);
        tl.to("#cursor", { x: 897, y: 152, duration: 0.45, ease: "power3.inOut" }, C.question + 0.22);
        tl.to("#qsend", { scale: 0.86, duration: 0.08, ease: "power2.in" }, SEND);
        tl.to("#qsend", { scale: 1, duration: 0.25, ease: "back.out(3)" }, SEND + 0.08);
        tl.fromTo("#ripple", { opacity: 1, scale: 0.3 }, { opacity: 0, scale: 2.2, duration: 0.6, ease: "power2.out" }, SEND);
        leg(C.pick + 0.2, SEND - C.pick - 0.2, { z: 3380 }, "sine.inOut");

        // ---- E · trades → candles → levels → decisions ----
        leg(C.watch - 0.5, 0.85, { z: 4150, y: 0, focus: -150 }, "power3.inOut");
        mblur(C.watch - 0.45, 5, 0.35, 0.5);
        fade("o-q", C.watch - 0.45, 0.35, 0, "power2.in");
        fade("o-canvas", C.watch - 0.45, 0.5, 1);
        DOTS.forEach((d) => {
          tl.fromTo("#" + d.id, { x: d.x0, y: d.y, opacity: 0, scale: 0.6 }, { x: d.x1, y: d.y, opacity: 1, scale: 1, duration: 0.55, ease: "power2.out" }, d.t);
          tl.to("#" + d.id, { x: HERO.x + 15, opacity: 0, scale: 0.3, duration: 0.18, ease: "power2.in" }, d.t + 0.55);
        });
        tl.fromTo(["#hero-bd", "#hero-wk"], { scaleY: 0.02 }, { scaleY: 0.02, duration: 0.01 }, C.watch - 0.5);
        tl.to("#hero-wk", { scaleY: 1, duration: C.candles1 - C.trades, ease: "power1.inOut" }, C.trades + 0.3);
        tl.to("#hero-bd", { scaleY: 1, duration: C.candles1 - C.trades, ease: "power1.inOut" }, C.trades + 0.35);
        tl.fromTo("#hero-c", { scale: 1 }, { scale: 1.12, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" }, C.candles1 + 0.3);
        tl.to("#hero-c", { x: HERO.toX - HERO.x, duration: 0.8, ease: "power3.inOut" }, C.candles2 - 0.15);
        for (let i = 0; i < NSERIES; i++) tl.fromTo("#cdl-" + i, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, C.candles2 + 0.05 + (NSERIES - 1 - i) * 0.05);
        tl.fromTo("#band", { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "power3.out" }, C.levels1);
        for (let i = 0; i < NTOUCH; i++) tl.fromTo("#touch-" + i, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.5)" }, C.levels1 + 0.25 + i * 0.12);
        focusIn("#band-tag", C.levels1 + 0.4, 0.5);
        leg(C.watch + 0.35, C.and - C.watch - 0.45, { z: 4230, ry: 2 }, "sine.inOut");
        // the level becomes a plan: the camera turns to it and racks focus
        leg(C.and - 0.1, 0.9, { x: -230, ry: -4, focus: 150 }, "power3.inOut");
        fade("o-plan", C.and - 0.05, 0.6, 1);
        PLAN.forEach((p, i) => {
          tl.fromTo("#ck-" + i, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2.4)" }, p.t);
          tl.fromTo("#ckp-" + i, { strokeDashoffset: 40 }, { strokeDashoffset: 0, duration: 0.25, ease: "power2.out" }, p.t + 0.08);
        });
        tl.fromTo("#prow-3", { backgroundColor: "rgba(120,225,213,0)" }, { backgroundColor: "rgba(120,225,213,0.12)", duration: 0.4, ease: "power2.out" }, C.decisions);

        // ---- F · every move, explained: pull back into the wall of lessons ----
        leg(C.l5end + 0.05, 1.0, { z: 3360, x: 0, ry: 0, focus: -340 }, "power3.inOut");
        mblur(C.l5end + 0.1, 4, 0.35, 0.5);
        fade("o-canvas", C.l5end + 0.1, 0.8, 0.3, "power2.inOut");
        fade("o-plan", C.l5end + 0.05, 0.5, 0, "power2.in");
        TILES.forEach((t, i) => fade("o-" + t.id, C.l5end + 0.2 + i * 0.03, 0.8, 0.9));
        focusIn("#e-0", C.every - 0.05, 0.55);
        focusIn("#e-1", C.move - 0.05, 0.55);
        focusIn("#e-2", C.explained - 0.05, 0.6);
        leg(C.l5end + 1.1, FIN - C.l5end - 1.1, { z: 3460 }, "sine.inOut");

        // ---- lockup ----
        fade("o-l6", FIN - 0.45, 0.45, 0, "power2.in");
        tl.to("#dim", { opacity: 1, duration: 0.6, ease: "power2.inOut" }, FIN - 0.3);
        tl.fromTo("#fin-b", { opacity: 0, rotation: -220, scale: 0.5, filter: "blur(12px)" }, { opacity: 1, rotation: 0, scale: 1, filter: "blur(0px)", duration: 0.85, ease: "expo.out" }, FIN);
        tl.fromTo("#fin-w", { opacity: 1, clipPath: "inset(0% 100% 0% 0%)", x: -30 }, { opacity: 1, clipPath: "inset(0% 0% 0% 0%)", x: 0, duration: 0.8, ease: "power3.out" }, FIN + 0.15);
        focusIn("#fin-sub", FIN + 0.5, 0.6);
        focusIn("#fin-url", FIN + 0.75, 0.6);

        // hold drift: the camera never quite stops
        tl.fromTo(cam, { dx: 0, dy: 0 }, { dx: 14, dy: -8, duration: END, ease: "sine.inOut", onUpdate: applyCamera }, 0);
        tl.fromTo("#grain", { backgroundPosition: "0px 0px" }, { backgroundPosition: "-2400px -1700px", duration: END, ease: "steps(" + Math.round(END * 24) + ")" }, 0);
        tl.fromTo("#fade", { opacity: 1 }, { opacity: 0, duration: 0.5, ease: "power1.out" }, 0);
        tl.to("#fade", { opacity: 1, duration: 0.6, ease: "power1.in" }, END - 0.6);
        applyCamera();
        drawLight(0);
        window.__timelines["main"] = tl;
