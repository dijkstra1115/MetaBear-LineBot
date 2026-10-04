        // Shared overlay kit (injected by scripts/build.mjs). Times are composition seconds; L() maps them
        // into this sub-composition's local time.
        const tl = gsap.timeline({ paused: true });
        const L = (t) => Math.max(0, +(t - T0).toFixed(4));
        const $ = (sel) => document.querySelector(sel);
        const slam = (sel, t, o = {}) =>
          tl.fromTo(
            sel,
            { opacity: 0, scale: o.from ?? 1.5, filter: `blur(${o.blur ?? 14}px)`, x: o.x ?? 0, y: o.y ?? 0 },
            { opacity: 1, scale: 1, filter: "blur(0px)", x: 0, y: 0, duration: o.d ?? 0.16, ease: o.ease ?? "power4.out" },
            L(t),
          );
        const show = (sel, t, d = 0.01) => tl.fromTo(sel, { opacity: 0 }, { opacity: 1, duration: d, ease: "none" }, L(t));
        const hide = (sel, t, d = 0.01) => tl.to(sel, { opacity: 0, duration: d, ease: "none" }, L(t));
        const wipe = (sel, t, d = 0.32, ease = "power3.out") =>
          tl.fromTo(sel, { opacity: 1, clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: d, ease }, L(t));
        const rise = (sel, t, d = 0.34, dy = 60) =>
          tl.fromTo(sel, { opacity: 0, y: dy, clipPath: "inset(0% 0% 100% 0%)" }, { opacity: 1, y: 0, clipPath: "inset(0% 0% 0% 0%)", duration: d, ease: "power3.out" }, L(t));
        const pulse = (sel, t, s = 1.12, d = 0.22) => tl.fromTo(sel, { scale: s }, { scale: 1, duration: d, ease: "power2.out", immediateRender: false }, L(t));
        const money = (v) => (v >= 0 ? "+$" : "−$") + Math.abs(Math.round(v)).toLocaleString("en-US");
        const num = (v) => Math.round(v).toLocaleString("en-US");
        const count = (sel, t, d, a, b, f = num, ease = "power2.out") => {
          const o = { v: a };
          const el = $(sel);
          el.textContent = f(a);
          tl.to(o, { v: b, duration: d, ease, onUpdate: () => (el.textContent = f(o.v)) }, L(t));
        };
        // game value at composition time t from the captured log of a shot: key 0 price (cents), 1 PnL, 2 chain
        const game = (id, key, t) => {
          const d = DATA[id];
          const f = Math.min(d.r.length - 1, Math.max(0, (t - d.s) / 0.05));
          const i = Math.floor(f);
          const a = d.r[i][key], b = (d.r[i + 1] || d.r[i])[key];
          return key === 2 ? a : a + (b - a) * (f - i);
        };
        const live = (sel, id, key, f, t0 = DATA[id].s, t1 = DATA[id].e) => {
          const el = $(sel);
          const o = { v: 0 };
          el.textContent = f(game(id, key, t0));
          tl.to(o, { v: 1, duration: t1 - t0, ease: "none", onUpdate: () => (el.textContent = f(game(id, key, t0 + o.v * (t1 - t0)))) }, L(t0));
        };
        // stable pseudo-random from an integer
        const hash = (n) => {
          const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
          return x - Math.floor(x);
        };