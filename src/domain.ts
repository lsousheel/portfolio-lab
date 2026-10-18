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
export function returns(p: number[]) {
  return p.slice(1).map((x, i) => x / p[i] - 1);
}
export function variance(a: number[]) {
  if (a.length < 2) return null;
  const average = mean(a);
  return a.reduce((s, x) => s + (x - average) ** 2, 0) / (a.length - 1);
}
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
export function metrics(values: number[], turnover = 0) {
  check(
    values.length >= 2 && values.every((x) => Number.isFinite(x) && x > 0),
    "Insufficient positive values",
  );
  const r = returns(values),
    v = variance(r);
  let peak = values[0],
    dd = 0;
  for (const x of values) {
    peak = Math.max(peak, x);
    dd = Math.min(dd, x / peak - 1);
  }
  return {
    totalReturn: values.at(-1)! / values[0] - 1,
    maxDrawdown: dd,
    annualVolatility: v === null ? null : Math.sqrt(v * 252),
    sharpe: v && v > 1e-20 ? (mean(r) / Math.sqrt(v)) * Math.sqrt(252) : null,
    turnover,
  };
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
export function align(series: Bar[][]) {
  check(series.length >= 2, "At least two assets");
  const maps = series.map((s) => new Map(s.map((p) => [p.date, p.close])));
  const dates = [...maps[0].keys()]
    .filter((d) => maps.every((m) => m.has(d)))
    .sort();
  check(
    dates.length >= 61,
    "Insufficient shared history (61 observations required)",
  );
  return { dates, prices: maps.map((m) => dates.map((d) => m.get(d)!)) };
}
export function covariance(prices: number[][]) {
  const rr = prices.map(returns),
    n = rr[0].length,
    means = rr.map(mean);
  return rr.map((a, ai) =>
    rr.map(
      (b, bi) =>
        a.reduce((s, x, i) => s + (x - means[ai]) * (b[i] - means[bi]), 0) /
        (n - 1),
    ),
  );
}
export function risk(w: number[], c: number[][]) {
  return Math.sqrt(
    Math.max(
      0,
      w.reduce(
        (s, x, i) => s + x * w.reduce((v, y, j) => v + y * c[i][j], 0),
        0,
      ) * 252,
    ),
  );
}
function project(v: number[], cap: number) {
  let lo = Math.min(...v) - 1,
    hi = Math.max(...v);
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2,
      sum = v.reduce((s, x) => s + Math.max(0, Math.min(cap, x - mid)), 0);
    if (sum > 1) lo = mid;
    else hi = mid;
  }
  return v.map((x) => Math.max(0, Math.min(cap, x - hi)));
}
export function optimize(c: number[][], cap = 0.2) {
  const n = c.length;
  check(
    n >= 2 && n * cap >= 1 - 1e-12 && cap > 0 && cap <= 1,
    "Infeasible concentration cap",
  );
  check(
    c.every((r) => r.length === n && r.every(Number.isFinite)),
    "Invalid covariance",
  );
  const ridge = 1e-8,
    reg = c.map((r, i) => r.map((x, j) => x + (i === j ? ridge : 0)));
  const lipschitz =
    2 * Math.max(...reg.map((r) => r.reduce((s, x) => s + Math.abs(x), 0)));
  let w = Array(n).fill(1 / n),
    converged = false,
    iteration = 0;
  for (; iteration < 20000; iteration++) {
    const grad = reg.map((r) => 2 * r.reduce((s, x, j) => s + x * w[j], 0));
    const next = project(
      w.map((x, i) => x - grad[i] / lipschitz),
      cap,
    );
    if (Math.max(...w.map((x, i) => Math.abs(x - next[i]))) < 1e-9) {
      w = next;
      converged = true;
      break;
    }
    w = next;
  }
  check(converged, "Optimizer failed to converge");
  check(
    Math.abs(w.reduce((a, b) => a + b) - 1) < 1e-7 &&
      w.every((x) => x >= 0 && x <= cap + 1e-9),
    "Infeasible optimizer result",
  );
  return { weights: w, ridge, iterations: iteration + 1, converged };
}
export type Leg = { symbol: string; side: "BUY" | "SELL"; quantity: number };
export function proposal(
  symbols: string[],
  weights: number[],
  quotes: Record<string, string>,
  holdings: Record<string, number>,
  cash: string,
) {
  check(symbols.length === weights.length, "Weight count");
  check(
    Object.keys(holdings).every(
      (s) => symbols.includes(s) || holdings[s] === 0,
    ),
    "Universe must include every holding",
  );
  let equity = money(cash);
  for (const s of symbols) {
    check(quotes[s] && new Decimal(quotes[s]).gt(0), "Missing price");
    equity = equity.plus(money(new Decimal(quotes[s]).times(holdings[s] || 0)));
  }
  const legs: Leg[] = [];
  let residual = money(cash);
  for (let i = 0; i < symbols.length; i++) {
    const s = symbols[i],
      q = new Decimal(quotes[s]),
      target = equity.times(weights[i]).div(q).floor().toNumber(),
      delta = target - (holdings[s] || 0);
    if (delta) {
      legs.push({
        symbol: s,
        side: delta > 0 ? "BUY" : "SELL",
        quantity: Math.abs(delta),
      });
      residual = residual.minus(money(q.times(delta)));
    }
  }
  check(residual.gte(0), "Rounded proposal unaffordable");
  return {
    legs: legs.sort((a, b) =>
      a.side === b.side
        ? a.symbol.localeCompare(b.symbol)
        : a.side === "SELL"
          ? -1
          : 1,
    ),
    residualCash: residual.toFixed(2),
    equity: equity.toFixed(2),
  };
}
// Close-t decision -> next-close execution -> following interval return. No same-close fills.
export function replay(bars: Bar[], h = 1, costBps = 10) {
  const cfg = horizon(h);
  check(bars.length > cfg.slow + 3, "Insufficient replay history");
  let position = 0,
    equity = 1,
    turnover = 0;
  const values = [1],
    audit: { signal: string; execution: string; position: number }[] = [];
  for (let t = cfg.slow + 1; t < bars.length - 1; t++) {
    const signal = indicators(
        bars.slice(0, t).map((b) => b.close),
        h,
      ),
      desired = signal.signal === "uptrend" ? 1 : 0;
    if ((t - cfg.slow - 1) % cfg.reviewDays === 0) {
      const change = Math.abs(desired - position);
      equity *= 1 - (change * costBps) / 10000;
      turnover += change;
      position = desired;
      audit.push({
        signal: bars[t - 1].date,
        execution: bars[t].date,
        position,
      });
    }
    equity *= 1 + position * (bars[t + 1].close / bars[t].close - 1);
    values.push(equity);
  }
  const baselinePrices = bars.slice(cfg.slow + 1).map((b) => b.close);
  const baseline = [
    1,
    ...baselinePrices
      .slice(1)
      .map((p) => (p / baselinePrices[0]) * (1 - costBps / 10000)),
  ];
  return {
    strategy: metrics(values, turnover),
    buyHold: metrics(baseline, 1),
    audit,
    costBps,
    slippage: "Included in combined costBps",
    label:
      "historical replay; adjusted series, not point-in-time corporate-action data",
  };
}
