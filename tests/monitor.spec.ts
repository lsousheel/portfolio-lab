import { costBasis, valuePortfolio, summarize } from "../src/monitor.js";

// All expected numbers below were worked out by hand on paper, not copied from the code.
describe("cost basis from the execution ledger", () => {
  it("averages two buys: 10 @ 100 and 10 @ 120 -> 20 shares at 110", () => {
    const p = costBasis([
      { symbol: "AAPL", side: "BUY", quantity: 10, price: "100" },
      { symbol: "AAPL", side: "BUY", quantity: 10, price: "120" },
    ]);
    expect(p).toEqual([{ symbol: "AAPL", quantity: 20, avgCost: "110.0000" }]);
  });
  it("a sell removes shares but keeps the average cost of what is left", () => {
    const p = costBasis([
      { symbol: "AAPL", side: "BUY", quantity: 10, price: "100" },
      { symbol: "AAPL", side: "BUY", quantity: 10, price: "120" },
      { symbol: "AAPL", side: "SELL", quantity: 5, price: "150" },
    ]);
    expect(p[0].quantity).toBe(15);
    expect(p[0].avgCost).toBe("110.0000");
  });
  it("drops a position that was sold completely", () => {
    const p = costBasis([
      { symbol: "KO", side: "BUY", quantity: 4, price: "60" },
      { symbol: "KO", side: "SELL", quantity: 4, price: "65" },
    ]);
    expect(p).toEqual([]);
  });
  it("refuses a ledger that sells more than was bought", () => {
    expect(() =>
      costBasis([{ symbol: "KO", side: "SELL", quantity: 1, price: "60" }]),
    ).toThrowError(/larger than the shares held/);
  });
});

describe("valuing a portfolio at current prices", () => {
  // Hand calculation, cash 1000:
  //  AAPL 10 sh, paid 100, now 110 -> value 1100, gain +100 (+10%)
  //  MSFT  5 sh, paid 200, now 180 -> value  900, gain -100 (-10%)
  //  KO   20 sh, paid  50, now  50 -> value 1000, gain    0
  //  invested 3000, stock value 3000, gain 0, total value 4000
  const positions = [
    { symbol: "AAPL", quantity: 10, avgCost: "100.0000" },
    { symbol: "KO", quantity: 20, avgCost: "50.0000" },
    { symbol: "MSFT", quantity: 5, avgCost: "200.0000" },
  ];
  const q = (price: string) => ({ price, observedAt: "2026-11-20T21:00:00.000Z" });
  const r = valuePortfolio("1000.00", positions, { AAPL: q("110"), KO: q("50"), MSFT: q("180") });

  it("computes the totals", () => {
    expect(r.invested).toBe("3000.00");
    expect(r.stockValue).toBe("3000.00");
    expect(r.gain).toBe("0.00");
    expect(r.totalValue).toBe("4000.00");
  });
  it("computes each line and labels winners, losers and flat positions", () => {
    const by = Object.fromEntries(r.lines.map((l) => [l.symbol, l]));
    expect(by.AAPL.gain).toBe("100.00");
    expect(by.AAPL.gainPct).toBe("10.00");
    expect(by.AAPL.status).toBe("WINNER");
    expect(by.MSFT.gain).toBe("-100.00");
    expect(by.MSFT.gainPct).toBe("-10.00");
    expect(by.MSFT.status).toBe("LOSER");
    expect(by.KO.status).toBe("FLAT");
  });
  it("lists winners best-first and losers worst-first", () => {
    const big = valuePortfolio("0", positions, { AAPL: q("130"), KO: q("40"), MSFT: q("150") });
    // AAPL +300, KO -200, MSFT -250
    expect(big.winners.map((l) => l.symbol)).toEqual(["AAPL"]);
    expect(big.losers.map((l) => l.symbol)).toEqual(["MSFT", "KO"]);
  });
  it("writes a short summary naming the best and worst stock", () => {
    const big = valuePortfolio("0", positions, { AAPL: q("130"), KO: q("40"), MSFT: q("150") });
    // invested 3000, value 1300+800+750=2850, gain -150 -> -5%
    expect(big.gain).toBe("-150.00");
    expect(big.gainPct).toBe("-5.00");
    expect(big.summary).toContain("down $150.00 (-5.00%)");
    expect(big.summary).toContain("Best: AAPL +$300.00");
    expect(big.summary).toContain("Worst: MSFT -$250.00");
  });
  it("leaves out a stock with no quote instead of guessing its price", () => {
    const partial = valuePortfolio("0", positions, { AAPL: q("110"), KO: q("50") });
    expect(partial.unpriced).toEqual(["MSFT"]);
    expect(partial.invested).toBe("2000.00"); // MSFT is not counted
    expect(partial.lines.find((l) => l.symbol === "MSFT")!.gain).toBeNull();
    expect(partial.summary).toContain("No quote for MSFT");
  });
  it("says so when no quotes are available at all", () => {
    expect(valuePortfolio("500", positions, {}).summary).toContain("No live quotes");
  });
  it("handles an empty portfolio", () => {
    const e = valuePortfolio("500.00", [], {});
    expect(e.totalValue).toBe("500.00");
    expect(e.summary).toContain("No shares held");
  });
  it("uses decimal arithmetic, so 3 shares at 0.1 + 0.2 has no float noise", () => {
    const d = valuePortfolio("0", [{ symbol: "AAPL", quantity: 3, avgCost: "0.1000" }], { AAPL: q("0.2") });
    expect(d.gain).toBe("0.30");
  });
  it("summarize reports an unchanged portfolio", () => {
    const flat = valuePortfolio("0", [{ symbol: "KO", quantity: 1, avgCost: "10" }], { KO: q("10") });
    expect(summarize(flat)).toContain("unchanged");
  });
});

describe("summary formatting", () => {
  it("puts thousands separators in dollar amounts", () => {
    const r = valuePortfolio("0", [{ symbol: "AAPL", quantity: 100, avgCost: "100.0000" }], {
      AAPL: { price: "112.50", observedAt: "2026-11-20T21:00:00.000Z" },
    });
    // paid 10,000.00, now 11,250.00, gain +1,250.00 (12.50%)
    expect(r.summary).toContain("up $1,250.00 (12.50%)");
    expect(r.summary).toContain("Portfolio value $11,250.00");
  });
});


describe("monitoring across price changes and missing quotes", () => {
  const positions = [
    { symbol: "AAPL", quantity: 2, avgCost: "100.0000" },
    { symbol: "MSFT", quantity: 1, avgCost: "200.0000" },
  ];
  const quote = (price: string) => ({ price, observedAt: "2026-11-20T21:00:00.000Z" });

  it("revalues the same holdings when new quotes arrive", () => {
    const first = valuePortfolio("500", positions, { AAPL: quote("100"), MSFT: quote("200") });
    const second = valuePortfolio("500", positions, { AAPL: quote("110"), MSFT: quote("180") });
    expect(first.totalValue).toBe("900.00");
    expect(first.gain).toBe("0.00");
    expect(second.totalValue).toBe("900.00");
    expect(second.gain).toBe("0.00");
    expect(second.winners.map(x => x.symbol)).toEqual(["AAPL"]);
    expect(second.losers.map(x => x.symbol)).toEqual(["MSFT"]);
    const third = valuePortfolio("500", positions, { AAPL: quote("120"), MSFT: quote("190") });
    expect(third.totalValue).toBe("930.00");
    expect(third.gain).toBe("30.00");
    expect(third.summary).toContain("Best: AAPL +$40.00");
    expect(third.summary).toContain("Worst: MSFT -$10.00");
  });

  it("labels missing quotes as a partial valuation, never a complete total", () => {
    const partial = valuePortfolio("500", positions, { AAPL: quote("110") });
    expect(partial.valuationComplete).toBe(false);
    expect(partial.totalValue).toBe("720.00"); // cash + priced AAPL only
    expect(partial.missingCostBasis).toBe("200.00");
    expect(partial.totalInvestedCost).toBe("400.00");
    expect(partial.summary).toContain("Partial valuation only");
    expect(partial.summary).toContain("No quote for MSFT");
    expect(partial.lines.find(x => x.symbol === "MSFT")?.status).toBe("NO_QUOTE");
  });

  it("marks an entirely unpriced portfolio as incomplete", () => {
    const none = valuePortfolio("500", positions, {});
    expect(none.valuationComplete).toBe(false);
    expect(none.missingCostBasis).toBe("400.00");
    expect(none.summary).toContain("full portfolio value are unavailable");
  });
});
