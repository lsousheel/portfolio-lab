import { Trading } from "./trading.js";
import { costBasis, valuePortfolio, LiveQuote } from "./monitor.js";

/** Reads the ledger, asks the market provider for a current quote per holding, and values the portfolio. */
export async function monitorPortfolio(trading: Trading, user: string, id: string) {
  const p = await trading.inspect(user, id);
  const held = new Set<string>(
    p.holdings.filter((h: any) => h.quantity > 0).map((h: any) => h.symbol),
  );
  const positions = costBasis(await trading.fills(user, id)).filter((x) => held.has(x.symbol));
  const quotes: Record<string, LiveQuote> = {};
  const errors: Record<string, string> = {};
  let provider = "";
  for (const pos of positions) {
    try {
      const q = await trading.market.quote(pos.symbol);
      quotes[pos.symbol] = { price: q.price, observedAt: q.observedAt };
      provider = q.provider;
    } catch (e: any) {
      errors[pos.symbol] = e?.message || "Quote unavailable";
    }
  }
  return {
    portfolioId: id,
    checkedAt: trading.now().toISOString(),
    provider,
    errors,
    ...valuePortfolio(String(p.cash), positions, quotes),
  };
}
