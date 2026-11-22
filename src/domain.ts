import { Decimal } from "decimal.js";
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}
export function check(ok: unknown, message: string, status = 422): asserts ok {
  if (!ok) throw new DomainError(message, status);
}
export const money = (v: Decimal.Value) =>
  new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const symbolOK = (s: string) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(s);
export function horizon(h: number) {
  check([1, 2, 5].includes(h), "Horizon must be 1, 2 or 5");
  return {
    fast: h === 1 ? 20 : 50,
    slow: h === 5 ? 200 : 100,
    reviewDays: h === 1 ? 21 : h === 2 ? 63 : 126,
    frequency: h === 1 ? "monthly" : h === 2 ? "quarterly" : "semiannual",
  };
}
export const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
export function sma(a: number[], n: number) {
  return a.length < n ? null : mean(a.slice(-n));
}
export function rsi(a: number[], n = 14) {
  if (a.length < n + 1) return null;
  const d = a
    .slice(-n - 1)
    .slice(1)
    .map((x, i) => x - a[a.length - n - 1 + i]);
  const up = d.reduce((s, x) => s + Math.max(x, 0), 0) / n,
    down = d.reduce((s, x) => s + Math.max(-x, 0), 0) / n;
  return up === 0 && down === 0
    ? 50
    : down === 0
      ? 100
      : 100 - 100 / (1 + up / down);
}
export function indicators(prices: number[], h: number) {
  check(
    prices.every((x) => Number.isFinite(x) && x > 0),
    "Invalid prices",
  );
  const cfg = horizon(h),
    fast = sma(prices, cfg.fast),
    slow = sma(prices, cfg.slow),
    prevFast = sma(prices.slice(0, -1), cfg.fast),
    prevSlow = sma(prices.slice(0, -1), cfg.slow);
  return {
    ...cfg,
    fast,
    slow,
    rsi: rsi(prices),
    signal:
      fast === null || slow === null
        ? "insufficient"
        : fast > slow
          ? "uptrend"
          : fast < slow
            ? "downtrend"
            : "neutral",
    crossover:
      prevFast !== null && prevSlow !== null && fast !== null && slow !== null
        ? prevFast <= prevSlow && fast > slow
          ? "up"
          : prevFast >= prevSlow && fast < slow
            ? "down"
            : "none"
        : null,
  };
}
export type Bar = { date: string; close: number };
export type Leg = { symbol: string; side: "BUY" | "SELL"; quantity: number };
