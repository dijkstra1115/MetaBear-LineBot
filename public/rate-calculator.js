const $ = (s) => document.querySelector(s);
let rate = null,
  timer,
  visible = false,
  busy = false,
  edited = "usdt";
const fields = { twd: $("#amount-twd"), usdt: $("#amount-usdt") };
function calculate() {
  const source = fields[edited],
    target = fields[edited === "usdt" ? "twd" : "usdt"];
  if (!rate || source.value === "" || !source.validity.valid) {
    target.value = "";
    source.setAttribute(
      "aria-invalid",
      String(source.value !== "" && !source.validity.valid),
    );
    return;
  }
  source.setAttribute("aria-invalid", "false");
  const result =
    edited === "usdt"
      ? Number(source.value) * rate
      : Number(source.value) / rate;
  target.value = Number(result.toFixed(edited === "usdt" ? 2 : 6)).toString();
}
async function refresh() {
  if (busy || !visible || document.hidden) return;
  busy = true;
  $("#rate-refresh").disabled = true;
  try {
    const response = await fetch("/rates/usdt-twd", {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error();
    const quote = await response.json();
    const age = Date.now() - Date.parse(quote.fetchedAt);
    if (
      !Number.isFinite(quote.rate) ||
      quote.rate <= 0 ||
      !Number.isFinite(age) ||
      age > 60000 ||
      age < -60000
    )
      throw Error();
    rate = quote.rate;
    Object.values(fields).forEach((f) => (f.disabled = false));
    $("#rate-threshold").disabled = false;
    $("#rate-value").textContent =
      `1 USDT ≈ ${rate.toLocaleString("zh-TW", { maximumFractionDigits: 4 })} TWD`;
    $("#rate-status").textContent =
      `行情取得時間：${new Date(quote.fetchedAt).toLocaleTimeString("zh-TW", { hour12: false })}`;
    calculate();
  } catch {
    rate = null;
    Object.values(fields).forEach((f) => (f.disabled = true));
    fields[edited === "usdt" ? "twd" : "usdt"].value = "";
    $("#rate-threshold").disabled = true;
    $("#rate-value").textContent = "目前無法取得最新匯率";
    $("#rate-status").textContent = "請點「更新匯率」重試。";
  } finally {
    busy = false;
    $("#rate-refresh").disabled = false;
  }
}
for (const [unit, field] of Object.entries(fields))
  field.addEventListener("input", () => {
    edited = unit;
    calculate();
  });
$("#rate-refresh").addEventListener("click", refresh);
$("#rate-threshold").addEventListener("click", () => {
  edited = "usdt";
  fields.usdt.value = "200";
  calculate();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
export function setCalculatorVisible(show) {
  $("#deposit-calculator").hidden = !show;
  visible = show;
  if (show && !timer) {
    void refresh();
    timer = setInterval(refresh, 30000);
  }
  if (!show && timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
