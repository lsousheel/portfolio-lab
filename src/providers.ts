import { z } from "zod";
import { Bar, check } from "./domain.js";
export type Quote = {
  symbol: string;
  price: string;
  observedAt: string;
  retrievedAt: string;
  provider: string;
  currency: "USD";
  adjustmentStatus: "raw";
};
export type History = {
  symbol: string;
  bars: Bar[];
  provider: string;
  retrievedAt: string;
  currency: "USD";
  adjustmentStatus: string;
  coverage: { from: string; to: string; requestedYears: number };
  warnings: string[];
};
export interface MarketProvider {
  sourceId?: string;
  symbols?: string[];
  history(symbol: string, cutoff: string): Promise<History>;
  quote(symbol: string): Promise<Quote>;
}
export function normalize(bars: Bar[], cutoff: string) {
  const m = new Map<string, number>();
  for (const b of bars) {
    check(
      z.iso.date().safeParse(b.date).success &&
        Number.isFinite(b.close) &&
        b.close > 0,
      "Invalid history record",
    );
    if (b.date > cutoff) continue;
    check(
      !m.has(b.date) || m.get(b.date) === b.close,
      "Conflicting duplicate observation",
    );
    m.set(b.date, b.close);
  }
  return [...m]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, close]) => ({ date, close }));
}
