// Every account carries one signed net position. Each fill moves the buyer up and the seller down by
// the same lots, so the sum of all positions stays zero and open interest is the sum of the longs.
export const MAINTENANCE = 0.004;

export function newAccount(id, kind, extra = {}) {
  return { id, kind, position: 0, entry: 0, realized: 0, volume: 0, ...extra };
}

// Applies a signed fill (+ buy, − sell) at price; returns the realized PnL in USDT.
export function applyFill(account, signed, price) {
  const old = account.position;
  const next = old + signed;
  const lots = Math.abs(signed);
  const closing = old && Math.sign(old) !== Math.sign(signed) ? Math.min(Math.abs(old), lots) : 0;
  const realized = closing ? Math.sign(old) * (price - account.entry) * closing / 10000 : 0;
  if (!old || Math.sign(old) === Math.sign(signed)) {
    account.entry = next ? Math.round((Math.abs(old) * account.entry + lots * price) / Math.abs(next)) : 0;
  } else if (!next) account.entry = 0;
  else if (Math.sign(next) !== Math.sign(old)) account.entry = price;
  account.position = next;
  account.realized += realized;
  account.volume += lots;
  return realized;
}

// Price cents × lots / 10000 = USDT (1 lot = 0.01 BTC).
export const notional = (price, lots) => price * lots / 10000;

export function liquidationPrice(side, entry, leverage) {
  return Math.round(side > 0 ? entry * (1 - 1 / leverage + MAINTENANCE) : entry * (1 + 1 / leverage - MAINTENANCE));
}

export function unrealized(account, price) {
  return account.position * (price - account.entry) / 10000;
}
