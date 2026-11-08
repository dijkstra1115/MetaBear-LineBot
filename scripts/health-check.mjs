#!/usr/bin/env node
// Periodic health check for Cloudflare usage and the Tokyo relay VPS.
// Read-only: billing API (token in .data/cloudflare-billing-token), SSH to
// metabear-tokyo, and a few public HTTP probes. Writes a Markdown report and a
// JSON snapshot to .data/health/ and exits 1 when something needs attention.
//
// Usage: node scripts/health-check.mjs [--json] [--no-ssh]

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ACCOUNT = "d175606a5a8c985f6cfd4c0c9768e6bc";
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT_DIR = join(ROOT, ".data", "health");
const VULTR_CREDIT_EXPIRES = "2026-11-23";
const VPS_MONTHLY_TRANSFER_GB = 1000; // Vultr vc2-1c-1gb allowance; adjust if the plan changes
const MONTHLY_BUDGET_USD = 20; // target from the cost plan (≤ $20/mo total)

// Monthly included amounts on Workers Paid. Usage over these is billed.
const INCLUDED = {
  "Durable Objects Compute Requests": { included: 1e6, perUnit: 0.15 / 1e6 },
  "Durable Objects Compute Duration": { included: 400e3, perUnit: 12.5 / 1e6 },
  "Durable Objects Storage Rows Read": { included: 25e9, perUnit: 0.001 / 1e6 },
  "Durable Objects Storage Rows Written": { included: 50e6, perUnit: 1 / 1e6 },
  "Workers Standard Requests": { included: 10e6, perUnit: 0.3 / 1e6 },
  "Workers CPU ms": { included: 30e6, perUnit: 0.02 / 1e6 },
  "D1 - Rows Read": { included: 25e9, perUnit: 0.001 / 1e6 },
  "D1 - Rows Written": { included: 50e6, perUnit: 1 / 1e6 },
  "KV Read Operations": { included: 10e6, perUnit: 0.5 / 1e6 },
  "KV Write Operations": { included: 1e6, perUnit: 5 / 1e6 },
  "Queues - Standard operations": { included: 1e6, perUnit: 0.4 / 1e6 },
  "R2 Storage Class A Operations": { included: 1e6, perUnit: 4.5 / 1e6 },
  "R2 Storage Class B Operations": { included: 10e6, perUnit: 0.36 / 1e6 },
};

const args = new Set(process.argv.slice(2));
const alerts = [];
const warn = (level, text) => alerts.push({ level, text });

const ymd = (d) => d.toISOString().slice(0, 10);
const fmt = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n));

function cycleStart(now) {
  // The billing cycle starts on the 30th (the last day in February).
  const on30 = (y, m) => new Date(Date.UTC(y, m, Math.min(30, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = on30(y, m);
  return d <= now ? d : on30(y, m - 1);
}

async function cloudflareUsage() {
  const token = readFileSync(join(ROOT, ".data", "cloudflare-billing-token"), "utf8").trim();
  const now = new Date();
  const start = cycleStart(now);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/billable-usage?from=${ymd(start)}&to=${ymd(now)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!body.success) throw new Error(`billable-usage ${res.status}: ${JSON.stringify(body.errors)}`);

  const services = {};
  const days = new Set();
  for (const row of body.result) {
    const day = row.ChargePeriodStart.slice(0, 10);
    const name = Object.keys(INCLUDED).find((k) => row.ServiceName.startsWith(k)) ?? row.ServiceName;
    const s = (services[name] ??= { daily: {}, billed: 0 });
    s.daily[day] = (s.daily[day] ?? 0) + row.ConsumedQuantity;
    s.billed += row.BilledCost ?? 0;
    if (row.ConsumedQuantity > 0) days.add(day);
  }
  const allDays = [...days].sort();
  // The most recent day often arrives partially; only use complete days for rates.
  const complete = allDays.slice(0, -1).length >= 3 ? allDays.slice(0, -1) : allDays;
  const lastDay = complete.at(-1);
  const remaining = Math.max(0, (end - new Date(`${lastDay}T00:00:00Z`)) / 864e5 - 1);

  const rows = [];
  let projectedCost = 0;
  for (const [name, s] of Object.entries(services)) {
    const series = complete.map((d) => s.daily[d] ?? 0);
    const used = Object.values(s.daily).reduce((a, b) => a + b, 0);
    const last = series.at(-1) ?? 0;
    const week = series.slice(-8);
    // Average daily change over the last week, used for a linear-trend projection.
    const slope = week.length > 1 ? (week.at(-1) - week[0]) / (week.length - 1) : 0;
    const flat = used + last * remaining;
    const trend = used + last * remaining + (Math.max(0, slope) * remaining * (remaining + 1)) / 2;
    const prev = series.slice(-8, -1).filter((v) => v > 0).sort((a, b) => a - b);
    const median = prev.length ? prev[Math.floor(prev.length / 2)] : 0;
    const limit = INCLUDED[name];
    const overage = limit ? Math.max(0, trend - limit.included) * limit.perUnit : 0;
    projectedCost += overage;
    rows.push({ name, used, last, slope, flat, trend, median, included: limit?.included, overage, billed: s.billed });

    if (limit && used > limit.included)
      warn(overage > 5 ? "🔴" : "🟡", `${name} 已超過內含額度（${fmt(used)} / ${fmt(limit.included)}），預估超額 $${overage.toFixed(2)}`);
    else if (limit && trend > limit.included)
      warn("🟠", `${name} 依目前成長趨勢，本週期會用到 ${fmt(trend)}（內含 ${fmt(limit.included)}），預估超額 $${overage.toFixed(2)}`);
    else if (limit && flat > 0.8 * limit.included) warn("🟡", `${name} 預估用到內含額度的 ${Math.round((flat / limit.included) * 100)}%`);
    if (median > 1000 && last > 2 * median) warn("🟠", `${name} 最近一天 ${fmt(last)}，是前 7 天中位數 ${fmt(median)} 的 ${(last / median).toFixed(1)} 倍`);
    if (week.length >= 5 && week[0] > 1e6 && week.at(-1) > 1.5 * week[0])
      warn("🟡", `${name} 一週內持續上升：${fmt(week[0])} → ${fmt(week.at(-1))}/天`);
  }
  rows.sort((a, b) => (b.included ? b.trend / b.included : 0) - (a.included ? a.trend / a.included : 0));
  const billedSoFar = rows.reduce((a, r) => a + r.billed, 0);
  if (5 + projectedCost > MONTHLY_BUDGET_USD) warn("🟠", `本週期預估 $${(5 + projectedCost).toFixed(2)}，超過 $${MONTHLY_BUDGET_USD} 目標`);
  return { cycle: { start: ymd(start), end: ymd(end), lastCompleteDay: lastDay, remainingDays: remaining }, rows, billedSoFar, projectedCost };
}

function ssh(script) {
  return execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "metabear-tokyo", script], {
    encoding: "utf8",
    timeout: 60_000,
  });
}

function vpsHealth() {
  const out = ssh(`set +e
echo "load=$(cut -d' ' -f1-3 /proc/loadavg)"
echo "uptime_s=$(cut -d. -f1 /proc/uptime)"
awk '/MemAvailable/{print "mem_avail_mb="int($2/1024)} /MemTotal/{print "mem_total_mb="int($2/1024)}' /proc/meminfo
df -P / | awk 'NR==2{gsub("%","",$5); print "disk_pct="$5}'
systemctl show metabear-relay -p ActiveState -p NRestarts -p ActiveEnterTimestamp -p MemoryCurrent | sed 's/^/relay_/'
awk 'NR>2 && $1!~/^lo/{gsub(":","",$1); print "net_rx_bytes="$2; print "net_tx_bytes="$10; exit}' /proc/net/dev
echo "reboot_required=$([ -f /var/run/reboot-required ] && echo 1 || echo 0)"
echo "upgradable=$(apt list --upgradable 2>/dev/null | grep -c upgradable)"
echo "ssh_failed_24h=$(sudo journalctl -u ssh --since '24 hours ago' -q --no-pager | grep -cE 'Invalid user|Failed password|authentication failure')"
echo "ssh_accepted_24h=$(sudo journalctl -u ssh --since '24 hours ago' -q --no-pager | grep -c Accepted)"
L=$(sudo journalctl -u metabear-relay --since '24 hours ago' -q --no-pager -o cat)
echo "relay_cf_reconnects_24h=$(printf '%s\\n' "$L" | grep -c 'cloudflare closed')"
echo "relay_errors_24h=$(printf '%s\\n' "$L" | grep -iE 'error|fail|exception' | grep -vc 'cloudflare closed 1006')"
echo "relay_last_line=$(printf '%s\\n' "$L" | tail -1)"
echo "ufw=$(sudo ufw status | head -1)"
`);
  const v = Object.fromEntries(
    out
      .trim()
      .split("\n")
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const uptimeDays = Number(v.uptime_s) / 86400;
  const txGB = Number(v.net_tx_bytes) / 1e9;
  const rxGB = Number(v.net_rx_bytes) / 1e9;
  // Counters reset at boot, so this is the average rate since the last reboot.
  const transferPerMonth = ((txGB + rxGB) / uptimeDays) * 30;
  const memPct = 100 - (Number(v.mem_avail_mb) / Number(v.mem_total_mb)) * 100;
  const load1 = Number(v.load.split(" ")[0]);

  if (v.relay_ActiveState !== "active") warn("🔴", `VPS relay 服務狀態是 ${v.relay_ActiveState}`);
  if (Number(v.relay_NRestarts) > 0) warn("🟡", `relay 自上次啟動後重啟了 ${v.relay_NRestarts} 次`);
  if (Number(v.relay_errors_24h) > 20) warn("🟠", `relay 24 小時內有 ${v.relay_errors_24h} 行錯誤記錄`);
  if (Number(v.relay_cf_reconnects_24h) > 400) warn("🟡", `relay 到 Cloudflare 的重連 ${v.relay_cf_reconnects_24h} 次/24h（平常約 130 次）`);
  if (Number(v.disk_pct) > 80) warn("🟠", `VPS 磁碟用了 ${v.disk_pct}%`);
  if (memPct > 85) warn("🟠", `VPS 記憶體用了 ${memPct.toFixed(0)}%`);
  if (load1 > 0.9) warn("🟡", `VPS 1 分鐘負載 ${load1}（1 核心）`);
  if (transferPerMonth > 0.7 * VPS_MONTHLY_TRANSFER_GB)
    warn("🟠", `VPS 流量推估每月 ${transferPerMonth.toFixed(0)} GB，接近 ${VPS_MONTHLY_TRANSFER_GB} GB 額度`);
  if (v.reboot_required === "1") warn("🟡", `VPS 有更新等待重開機（可升級套件 ${v.upgradable} 個）`);
  if (!/active/.test(v.ufw) || /inactive/.test(v.ufw)) warn("🔴", `VPS 防火牆狀態異常：${v.ufw}`);
  if (Number(v.ssh_accepted_24h) > 20) warn("🟠", `VPS 24 小時內有 ${v.ssh_accepted_24h} 次成功 SSH 登入，請確認是否都是自己`);

  const daysLeft = Math.ceil((new Date(`${VULTR_CREDIT_EXPIRES}T00:00:00Z`) - new Date()) / 864e5);
  if (daysLeft <= 21 && daysLeft >= -3) warn(daysLeft <= 7 ? "🟠" : "🟡", `Vultr 贈送額度 ${VULTR_CREDIT_EXPIRES} 到期（剩 ${daysLeft} 天），之後改扣信用卡約 $5/月`);

  return { ...v, uptimeDays, txGB, rxGB, transferPerMonth, memPct };
}

async function probes() {
  const targets = [
    "https://metabear.io/",
    "https://metabear.io/orderflow/",
    "https://metabear.io/health",
  ];
  const results = [];
  for (const url of targets) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
      const ms = Math.round(performance.now() - t0);
      results.push({ url, status: res.status, ms });
      if (res.status >= 400) warn("🔴", `${url} 回應 ${res.status}`);
      else if (ms > 3000) warn("🟡", `${url} 回應時間 ${ms} ms`);
    } catch (err) {
      results.push({ url, status: 0, error: String(err) });
      warn("🔴", `${url} 連不上：${err.message}`);
    }
  }
  return results;
}

function report({ cf, vps, http, errors }) {
  const lines = [`# MetaBear 健康檢查 ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, ""];
  lines.push("## 需要注意", "");
  if (alerts.length) for (const a of alerts) lines.push(`- ${a.level} ${a.text}`);
  else lines.push("- ✅ 沒有異常");
  for (const e of errors) lines.push(`- ⚠️ 檢查失敗：${e}`);
  if (cf) {
    lines.push("", `## Cloudflare 用量（週期 ${cf.cycle.start} → ${cf.cycle.end}，資料到 ${cf.cycle.lastCompleteDay}）`, "");
    lines.push(`已計費 $${cf.billedSoFar.toFixed(2)}；依趨勢預估本週期超額 $${cf.projectedCost.toFixed(2)} + 方案 $5`, "");
    lines.push("| 項目 | 已用 | 最近一天 | 每日變化 | 趨勢預估 | 內含 | 預估超額 |", "| --- | --: | --: | --: | --: | --: | --: |");
    for (const r of cf.rows.filter((r) => r.used > 0))
      lines.push(
        `| ${r.name} | ${fmt(r.used)} | ${fmt(r.last)} | ${r.slope >= 0 ? "+" : "-"}${fmt(Math.abs(r.slope))} | ${fmt(r.trend)} | ${r.included ? fmt(r.included) : "—"} | ${r.overage ? `$${r.overage.toFixed(2)}` : "—"} |`,
      );
  }
  if (vps) {
    lines.push("", "## VPS metabear-tokyo", "");
    lines.push(`- 開機 ${vps.uptimeDays.toFixed(1)} 天，負載 ${vps.load}，記憶體 ${vps.memPct.toFixed(0)}%，磁碟 ${vps.disk_pct}%`);
    lines.push(`- relay：${vps.relay_ActiveState}，自 ${vps.relay_ActiveEnterTimestamp} 起，重啟 ${vps.relay_NRestarts} 次，記憶體 ${(Number(vps.relay_MemoryCurrent) / 1048576).toFixed(0)} MB`);
    lines.push(`- relay 24h：Cloudflare 重連 ${vps.relay_cf_reconnects_24h} 次，錯誤 ${vps.relay_errors_24h} 行`);
    lines.push(`- 流量（開機以來）：送出 ${vps.txGB.toFixed(1)} GB、接收 ${vps.rxGB.toFixed(1)} GB，推估每月 ${vps.transferPerMonth.toFixed(0)} GB / ${VPS_MONTHLY_TRANSFER_GB} GB`);
    lines.push(`- 安全：${vps.ufw}；SSH 24h 成功 ${vps.ssh_accepted_24h} 次、失敗嘗試 ${vps.ssh_failed_24h} 次（密碼登入已關閉）`);
    lines.push(`- 系統：可升級套件 ${vps.upgradable} 個${vps.reboot_required === "1" ? "，需要重開機" : ""}`);
  }
  if (http) {
    lines.push("", "## 網站探測", "");
    for (const p of http) lines.push(`- ${p.status || "ERR"} ${p.ms ?? "—"} ms ${p.url}`);
  }
  return lines.join("\n") + "\n";
}

const errors = [];
const [cf, http] = await Promise.all([
  cloudflareUsage().catch((e) => (errors.push(`Cloudflare 用量：${e.message}`), null)),
  probes(),
]);
let vps = null;
if (!args.has("--no-ssh")) {
  try {
    vps = vpsHealth();
  } catch (e) {
    errors.push(`VPS SSH：${e.message.split("\n")[0]}`);
    warn("🔴", "VPS 無法透過 SSH 連線");
  }
}

const snapshot = { at: new Date().toISOString(), alerts, errors, cf, vps, http };
mkdirSync(OUT_DIR, { recursive: true });
const stamp = snapshot.at.slice(0, 10);
const md = report(snapshot);
writeFileSync(join(OUT_DIR, `${stamp}.json`), JSON.stringify(snapshot, null, 2));
writeFileSync(join(OUT_DIR, `${stamp}.md`), md);
writeFileSync(join(OUT_DIR, "latest.md"), md);
process.stdout.write(args.has("--json") ? JSON.stringify(snapshot, null, 2) + "\n" : md);
process.exitCode = alerts.some((a) => a.level !== "🟡") || errors.length ? 1 : 0;
