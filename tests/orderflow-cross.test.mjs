import test from "node:test";
import assert from "node:assert/strict";
import { chapterCard, chaptersOf } from "../public/lab/orderflow/chapters.js";
import { crossClusters } from "../public/lab/orderflow/cross.js";
import { cardOf, detailOf, filterGroups, groupEvents } from "../public/lab/orderflow/narrate.js";
import { choiceOf, kindNames } from "../public/lab/orderflow/notify.js";

const T0 = Date.UTC(2026, 9, 26, 6, 0);

test("same-side prints from three or more exchanges within 10 s form one cluster", () => {
  const prints = [
    [T0, "sell", 80_000, 12, "binance"],
    [T0 + 2_000, "sell", 79_990, 30, "okx"],
    [T0 + 4_000, "buy", 80_010, 50, "bybit"], // other side
    [T0 + 6_000, "sell", 79_980, 15, "bybit"],
    [T0 + 7_000, "sell", 79_980, 4, "bingx"], // under the size
    [T0 + 25_000, "sell", 79_950, 20, "binance"], // a new window, one exchange only
    [T0 + 30_000, "sell", 79_950, 20, "binance"],
  ];
  const [c, ...rest] = crossClusters(prints, { min: 10 });
  assert.equal(rest.length, 0);
  assert.deepEqual([c.t, c.end, c.side, c.qty], [T0, T0 + 6_000, "sell", 57]);
  assert.deepEqual(c.exchanges, [["okx", 1, 30], ["bybit", 1, 15], ["binance", 1, 12]], "largest first");
  assert.equal(c.price, Math.round(((80_000 * 12 + 79_990 * 30 + 79_980 * 15) / 57) * 10) / 10);
  assert.equal(c.prints.length, 3);
  assert.deepEqual(crossClusters(prints.map((p) => p.slice(0, 4)), { min: 10 }), [], "prints without an exchange (one exchange's view) never cluster");
  assert.deepEqual(crossClusters(prints.filter((p) => p[4] !== "okx"), { min: 10 }), [], "two exchanges are not enough");
  assert.equal(crossClusters(prints.filter((p) => p[4] !== "okx"), { min: 10, exchanges: 2 }).length, 1);
});

test("跨所同步大單 reads as its own story, under 大單爆倉, and is not a notification choice", () => {
  const e = {
    t: T0,
    kind: "cross",
    price: 79_990,
    side: "sell",
    level: "poc",
    dist: 15,
    text: "🔗 跨所同步大單 OKX、Bybit、Binance 10 秒內同時主動賣 57.0 BTC｜前日 POC 80,005（差 $15）",
  };
  assert.equal(choiceOf("cross"), "cross");
  assert.equal(detailOf(e), "OKX、Bybit、Binance 10 秒內同時主動賣 57.0 BTC");
  const groups = groupEvents([e, { ...e, t: T0 + 600_000 }]);
  assert.equal(groups.length, 1);
  const card = cardOf(groups[0]);
  assert.equal(card.title, "前日 POC 80,005：2 次多家交易所同時出現大單");
  assert.equal(card.badge, "跨所同步大單 ×2");
  assert.equal(filterGroups(groups, "flow").length, 1);
  assert.equal(filterGroups(groups, "book").length, 0);
  const [chapter] = chaptersOf(groupEvents([e]));
  assert.match(chapterCard(chapter).text, /OKX、Bybit、Binance 10 秒內同時主動賣 57\.0 BTC/);
  // Notifications only list the collector's kinds, so a subscriber's 「全部」 stays 全部.
  assert.doesNotMatch(kindNames(["sweep"]), /跨所/);
});
