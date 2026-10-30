// Records the real lab (public/lab/orderflow) into assets/video/<shot>.mp4, one frame at a time.
// Needs the tape from scripts/tape.mjs. node scripts/shots.mjs [names…] [--scale 2] [--check]
// --check writes a few stills per shot at 1× instead of the full 2880×1620 footage.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CURSOR, newLab, PROJECT, replaySockets, shot, startServer, tapeApi, tapeTime } from "./lab-rig.mjs";

const argv = process.argv.slice(2);
const flag = (name, dflt) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : dflt);
const CHECK = argv.includes("--check");
const SCALE = Number(flag("scale", CHECK ? 1 : 2));
const OUT = join(PROJECT, CHECK ? ".tape/check" : "assets/video");
mkdirSync(OUT, { recursive: true });

const taipei = (s) => new Date(`${s}+08:00`).getTime();
const ALL_OFF = "";
const q = (o) => "?" + new URLSearchParams({ days: "5", ex: "all", ...o }).toString();

// Opens the lab paused and ready; the caller's shot then owns the clock.
async function open(query, { rail = false, card = false, init = [] } = {}) {
  const lab = await newLab({ scale: SCALE, init: [() => { try { localStorage.setItem("metabear-orderflow-rail", "closed"); } catch {} }, ...init] });
  const { page } = lab;
  await tapeApi(page, { frozen: true });
  const sockets = await replaySockets(page);
  const t0 = tapeTime();
  await page.clock.install({ time: t0 + 2000 });
  await page.goto(lab.url(query), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("status")?.hidden === true, null, { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  for (let i = 0; i < 16; i++) {
    await sockets.pump(await page.evaluate(() => Date.now()) - t0);
    await page.waitForTimeout(120);
  }
  await page.evaluate(CURSOR);
  await page.addStyleTag({ content: `.conn{display:none!important}${card ? "" : "#bar-card{display:none!important}"}` });
  const closeRail = page.locator("#nar-close");
  if (!rail && (await closeRail.isVisible().catch(() => false))) await closeRail.click();
  if (rail && !(await page.locator("#narration").isVisible())) await page.locator("#nar-open").click();
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 50));
  const pump = { pump: async () => sockets.pump((await page.evaluate(() => Date.now())) - t0) };
  return { ...lab, sockets: pump };
}

const wheel = (page, x, y, dy) => page.evaluate(() => 0).then(() => page.mouse.move(x, y)).then(() => page.mouse.wheel(0, dy));
const unpin = async (page) => {
  if (await page.locator("#bc-close").isVisible().catch(() => false)) await page.locator("#bc-close").click();
};

// Flips an indicator through the page's own checkbox, with its menu closed.
const toggleView = (page, label) =>
  page.evaluate((text) => {
    [...document.querySelectorAll("#ind-overlay label")].find((l) => l.textContent.includes(text)).querySelector("input").click();
  }, label);

// Everything a shot needs: query, length, and its steps in milliseconds.
const SHOTS = {
  // The crash at 04:33: zoom from candles into the footprint's own numbers.
  fp: {
    q: q({ tf: "1", mode: "footprint", at: taipei("2026-10-30T04:36:00"), pm: "25", ind: "dom,stack,vwap,stats,volume,cvd,prints" }),
    ms: 6000,
    setup: unpin,
    steps: (page) => {
      const out = [[0, (m) => { m.x = 720; m.y = 300; }]];
      for (let t = 150, n = 0; n < 19; t += 100, n++) out.push([t, () => wheel(page, 720, 300, -100)]);
      return out;
    },
  },
  // Stacked-imbalance zones and the delta profile on the left of the chart.
  zones: {
    q: q({ tf: "5", mode: "candles", at: taipei("2026-10-30T03:30:00"), pm: "50", ind: "stack,dprofile,vwap,volume,cvd" }),
    ms: 6000,
    setup: async (page) => {
      await unpin(page);
      await page.mouse.move(720, 300);
    },
    steps: (page) => {
      const out = [];
      for (let t = 0; t < 5900; t += 33.4) out.push([t, () => page.mouse.wheel(1.1, 0)]);
      return out;
    },
  },
  // The order-book heatmap and live ladder, moving on the taped sockets.
  heat: {
    q: q({ tf: "1", mode: "candles", pm: "25", ind: "heat,dom,vwap,prints,volume" }),
    ms: 6000,
    steps: () => [
      [300, (m) => { m.x = 500; m.y = 300; m.move(1000, 330, 1400); }],
      [2600, (m) => m.move(1385, 300, 900)],
      [4300, (m) => m.move(1385, 420, 1400)],
    ],
    sockets: true,
  },
  // Big prints: the real threshold slider swept from every print down to the whales.
  bubbles: {
    q: q({ tf: "5", mode: "candles", pm: "2", ind: "prints,vwap,volume", at: taipei("2026-10-30T05:30:00") }),
    ms: 5000,
    setup: async (page) => {
      await unpin(page);
      await page.locator("details.ind > summary").click();
    },
    steps: (page) => [
      [0, async (m) => {
        const b = await page.locator("#print-min").boundingBox();
        m.x = b.x + 8;
        m.y = b.y + b.height / 2;
        await page.mouse.move(m.x, m.y);
        await page.mouse.down();
        m.move(b.x + b.width - 4, m.y, 3600, (u) => u * u * (3 - 2 * u));
      }],
      [3700, () => page.mouse.up()],
    ],
  },
  // Liquidation triangles, then the estimated liquidation map behind them.
  liq: {
    q: q({ tf: "15", mode: "candles", pm: "50", ind: "liqmark,vwap,liq,oi" }),
    ms: 5000,
    setup: (page) => page.locator("details.ind > summary").click(),
    steps: (page) => [
      [600, async (m) => {
        const box = await page.locator("#ind-overlay label", { hasText: "爆倉地圖" }).boundingBox();
        m.x = 900; m.y = 400;
        m.move(box.x + 30, box.y + box.height / 2, 800);
      }],
      [1500, () => page.locator("#ind-overlay label", { hasText: "爆倉地圖" }).click()],
      [2300, () => page.locator("details.ind > summary").click()],
      [2350, (m) => m.move(1060, 200, 1200)],
    ],
  },
  // Sub-panes switched on one after another.
  panes: {
    q: q({ tf: "15", mode: "candles", pm: "50", ind: "vwap,prints" }),
    ms: 5000,
    setup: (page) => page.locator("details.ind > summary").click(),
    steps: (page) => [...["CVD", "OI", "爆倉", "資金費率", "多空比", "掛單簿失衡"].entries()].map(([i, name]) => [300 + i * 620, async (m) => {
      const label = page.locator("#ind-pane label").filter({ hasText: new RegExp(`^\\s*${name}`) }).first();
      const box = await label.boundingBox();
      m.move(box.x + 24, box.y + box.height / 2, 260);
      await label.click();
    }]),
  },
  // Bar card on hover, then a drawn level.
  tools: {
    q: q({ tf: "5", mode: "candles", pm: "25", ind: "prints,vwap,volume", at: taipei("2026-10-30T09:40:00") }),
    ms: 6000,
    card: true,
    setup: unpin,
    steps: (page) => [
      [100, (m) => { m.x = 200; m.y = 350; m.move(760, 400, 1100); }],
      [2200, async () => { await page.locator('#pen-tools [data-tool="t"]').click(); }],
      [2250, (m) => { m.x = 30; m.y = 340; m.move(320, 545, 500); }],
      [2800, () => page.mouse.down()],
      [2850, (m) => m.move(1050, 240, 1500, (u) => u * u * (3 - 2 * u))],
      [4400, () => page.mouse.up()],
    ],
  },
  // One narration chapter opened and replayed in the lab's own one-click replay, sped up with its
  // own 2× button and moved to just before the first event with its own progress bar.
  rail: {
    q: q({ tf: "15", mode: "candles", pm: "25" }),
    ms: 14000,
    rail: true,
    steps: (page) => [
      [300, async (m) => {
        const c = page.locator(".nar-list > *").first();
        const b = await c.boundingBox();
        m.x = 900; m.y = 300;
        m.move(b.x + b.width / 2, b.y + b.height / 2, 700);
      }],
      [1100, () => page.locator(".nar-list > *").first().click()],
      [2500, async (m) => {
        const r = page.locator(".nar-replay").first();
        await r.scrollIntoViewIfNeeded();
        const b = await r.boundingBox();
        m.move(b.x + b.width / 2, b.y + b.height / 2, 600);
      }],
      [3200, () => page.locator(".nar-replay").first().click()],
      [3700, () => page.locator('.er-speed [data-speed="2"]').click()],
      [4200, () => page.evaluate(() => {
        const ticks = [...document.querySelectorAll("#er-ticks > *")];
        const seek = document.getElementById("er-seek");
        const first = ticks.length ? parseFloat(ticks[0].style.left) : 25;
        seek.value = String(Math.max(0, first * 10 - 45));
        seek.dispatchEvent(new Event("input", { bubbles: true }));
      })],
    ],
  },
  // Full-frame views for the feature run: a clean chart, then the view switches on half a second in.
  liq2: {
    q: q({ tf: "15", mode: "candles", pm: "50", ind: "vwap,liqmark" }),
    ms: 6500,
    steps: (page) => [[500, () => toggleView(page, "爆倉地圖")]],
  },
  heat2: {
    q: q({ tf: "1", mode: "candles", pm: "25", ind: "vwap,prints,dom" }),
    ms: 6500,
    steps: (page) => [[500, () => toggleView(page, "掛單熱力圖")]],
    sockets: true,
  },
  bubbles2: {
    q: q({ tf: "5", mode: "candles", pm: "25", ind: "vwap", at: taipei("2026-10-30T05:30:00") }),
    ms: 6500,
    setup: unpin,
    steps: (page) => [[500, () => toggleView(page, "大單泡泡")]],
  },
};

// One tick of each exchange's view at the same moment, for a fast flip between them.
for (const ex of ["all", "binance", "bybit", "okx", "bingx"])
  SHOTS[`ex-${ex}`] = {
    q: q({ ex, tf: "15", mode: "candles", pm: ex === "all" ? "25" : "10", ind: "dom,prints,vwap,volume,cvd" }),
    ms: 2000,
    sockets: true,
  };

const names = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--"));
const srv = startServer();
await srv.ready;
const want = names.length ? names : Object.keys(SHOTS);
for (const name of want) {
  const s = SHOTS[name];
  const lab = await open(s.q, { rail: s.rail, card: s.card });
  await s.setup?.(lab.page);
  await shot({
    page: lab.page,
    file: join(OUT, `${name}.mp4`),
    fps: 30,
    ms: s.ms,
    steps: s.steps?.(lab.page) ?? [],
    sockets: s.sockets ? lab.sockets : null,
    check: CHECK,
  });
  await lab.browser.close();
}
srv.stop();
