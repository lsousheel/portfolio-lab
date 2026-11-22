import { Decimal } from "decimal.js";
import { check, money } from "./domain.js";

// Portfolio monitoring. Everything in this file is pure (no database,
// no network) so it can be tested with hand-calculated numbers.

export type Fill = { symbol: string; side: "BUY" | "SELL"; quantity: number; price: string };
export type Position = { symbol: string; quantity: number; avgCost: string };
export type LiveQuote = { price: string; observedAt: string };

/**
 * Average-cost basis per symbol, built from fills in the order they happened.
 * A BUY adds shares at its price. A SELL removes shares at the current average
 * cost, so the average of what is left does not change.
 */
export function costBasis(fills: Fill[]): Position[] {
  const book = new Map<string, { qty: number; cost: Decimal }>();
  for (const f of fills) {
    const b = book.get(f.symbol) ?? { qty: 0, cost: new Decimal(0) };
    if (f.side === "BUY") {
      b.qty += f.quantity;
      b.cost = b.cost.plus(new Decimal(f.price).times(f.quantity));
    } else {
      check(f.quantity <= b.qty, "Sell is larger than the shares held in the ledger");
      const avg = b.qty ? b.cost.div(b.qty) : new Decimal(0);
      b.qty -= f.quantity;
      b.cost = b.cost.minus(avg.times(f.quantity));
    }
    book.set(f.symbol, b);
  }
  return [...book.entries()]
    .filter(([, b]) => b.qty > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, b]) => ({
      symbol,
      quantity: b.qty,
      avgCost: b.cost.div(b.qty).toFixed(4),
    }));
}

export type Line = {
  symbol: string;
  quantity: number;
  avgCost: string;
  price: string | null;
  observedAt: string | null;
  marketValue: string | null;
  invested: string;
  gain: string | null;
  gainPct: string | null;
  status: "WINNER" | "LOSER" | "FLAT" | "NO_QUOTE";
};

export function valuePortfolio(
  cash: string,
  positions: Position[],
  quotes: Record<string, LiveQuote | undefined>,
) {
  const lines: Line[] = positions.map((p) => {
    const q = quotes[p.symbol];
    const invested = new Decimal(p.avgCost).times(p.quantity);
    if (!q)
      return {
        symbol: p.symbol,
        quantity: p.quantity,
        avgCost: p.avgCost,
        price: null,
        observedAt: null,
        marketValue: null,
        invested: money(invested).toFixed(2),
        gain: null,
        gainPct: null,
        status: "NO_QUOTE" as const,
      };
    const value = new Decimal(q.price).times(p.quantity);
    const gain = value.minus(invested);
    return {
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: p.avgCost,
      price: q.price,
      observedAt: q.observedAt,
      marketValue: money(value).toFixed(2),
      invested: money(invested).toFixed(2),
      gain: money(gain).toFixed(2),
      gainPct: invested.isZero() ? "0.00" : gain.div(invested).times(100).toFixed(2),
      status: gain.gt(0.005) ? ("WINNER" as const) : gain.lt(-0.005) ? ("LOSER" as const) : ("FLAT" as const),
    };
  });

  const priced = lines.filter((l) => l.gain !== null);
  const sum = (f: (l: Line) => string | null) =>
    priced.reduce((s, l) => s.plus(f(l) ?? 0), new Decimal(0));
  const invested = sum((l) => l.invested);
  const stockValue = sum((l) => l.marketValue);
  const gain = stockValue.minus(invested);
  const byGain = [...priced].sort(
    (a, b) => new Decimal(b.gain!).comparedTo(a.gain!) || a.symbol.localeCompare(b.symbol),
  );
  const winners = byGain.filter((l) => l.status === "WINNER");
  const losers = byGain.filter((l) => l.status === "LOSER").reverse(); // biggest loss first
  const totalValue = money(new Decimal(cash).plus(stockValue));
  const unpriced = lines.filter((l) => l.status === "NO_QUOTE").map((l) => l.symbol);
  const missingCostBasis = lines
    .filter((l) => l.status === "NO_QUOTE")
    .reduce((total, l) => total.plus(l.invested), new Decimal(0));
  const result = {
    cash: new Decimal(cash).toFixed(2),
    invested: money(invested).toFixed(2),
    stockValue: money(stockValue).toFixed(2),
    // With an unavailable quote, totalValue is cash + KNOWN position values only.
    // It is NOT a complete estimate of the portfolio's market value.
    totalValue: totalValue.toFixed(2),
    valuationComplete: unpriced.length === 0,
    totalInvestedCost: money(invested.plus(missingCostBasis)).toFixed(2),
    missingCostBasis: money(missingCostBasis).toFixed(2),
    gain: money(gain).toFixed(2),
    gainPct: invested.isZero() ? "0.00" : gain.div(invested).times(100).toFixed(2),
    lines,
    winners,
    losers,
    unpriced,
    summary: "",
  };
  result.summary = summarize(result);
  return result;
}

const group = (v: string) => v.replace(/\B(?=(\d{3})+(?!\d))(?<!\.\d*)/g, ",");
const usd = (v: string) => (v.startsWith("-") ? "-$" + group(v.slice(1)) : "$" + group(v));
const signed = (v: string) => (v.startsWith("-") ? usd(v) : "+" + usd(v));

/** The short notification text shown on the dashboard and printed by `npm run watch`. */
export function summarize(r: {
  lines: Line[];
  gain: string;
  gainPct: string;
  totalValue: string;
  winners: Line[];
  losers: Line[];
  unpriced: string[];
}) {
  if (!r.lines.length) return "No shares held yet. Buy something to start tracking gains and losses.";
  let text: string;
  if (r.lines.length === r.unpriced.length) text = "No live quotes could be retrieved, so gains and losses and the full portfolio value are unavailable right now.";
  else {
    const dir = new Decimal(r.gain).gt(0) ? "up" : new Decimal(r.gain).lt(0) ? "down" : "unchanged";
    text =
      dir === "unchanged"
        ? `Your stocks are unchanged against what you paid. Portfolio value ${usd(r.totalValue)}.`
        : `Your stocks are ${dir} ${usd(new Decimal(r.gain).abs().toFixed(2))} (${r.gainPct}%) against what you paid. Portfolio value ${usd(r.totalValue)}.`;
    if (r.winners[0]) text += ` Best: ${r.winners[0].symbol} ${signed(r.winners[0].gain!)}.`;
    if (r.losers[0]) text += ` Worst: ${r.losers[0].symbol} ${signed(r.losers[0].gain!)}.`;
  }
  if (r.unpriced.length && r.unpriced.length < r.lines.length)
    text += ` Partial valuation only (cash + priced holdings). No quote for ${r.unpriced.join(", ")}; their value and gain/loss are excluded.`;
  return text;
}
