import { pool, migrate } from "../src/db.js";
import { Trading } from "../src/trading.js";
import { OfflineProvider, Quote } from "../src/providers.js";
import { randomUUID } from "node:crypto";

describe("Explicit last-quote demo execution", () => {
  const now = () => new Date("2026-10-18T20:00:00Z");
  const quote: Quote = {
    symbol: "MSFT",
    price: "100.0000",
    observedAt: "2026-10-16T20:00:00Z",
    retrievedAt: now().toISOString(),
    provider: "finnhub",
    currency: "USD",
    adjustmentStatus: "raw",
  };
  const db = pool(true);
  const provider = new OfflineProvider();
  provider.quote = async () => ({ ...quote });
  beforeAll(async () => {
    await migrate(db);
  });
  afterAll(async () => {
    await db.end();
  });
  it("rejects weekend quotes in strict mode and accepts them only in explicit demo mode", () => {
    const t = new Trading(db, provider, now);
    expect(() => t.validateQuote(quote)).toThrow();
    t.executionMode = "demo-last-quote";
    expect(() => t.validateQuote(quote)).not.toThrow();
    for (const patch of [
      { observedAt: "2026-10-19T20:00:00Z" },
      { observedAt: "2026-10-10T20:00:00Z" },
      { provider: "other" },
      { price: "0" },
    ]) {
      expect(() => t.validateQuote({ ...quote, ...patch })).toThrow();
    }
  });
  it("preserves quote provenance and atomic balances across buy, retry and sell", async () => {
    const t = new Trading(db, provider, now, undefined, "demo-last-quote");
    const u = await t.user("Demo policy test " + randomUUID());
    const p = await t.portfolio(u.id, 2);
    await t.fund(u.id, p.id, "1000.00", "fund");
    const buy = await t.submit(
      u.id,
      p.id,
      { symbol: "MSFT", side: "BUY", quantity: 2 },
      "buy",
    );
    await t.execute(u.id, p.id, buy.id, "fill-buy");
    await t.execute(u.id, p.id, buy.id, "fill-buy");
    expect((await t.inspect(u.id, p.id)).cash).toBe("800.00");
    const activity = await t.activity(u.id, p.id);
    expect(activity.executions.length).toBe(1);
    expect(activity.executions[0].execution_mode).toBe("demo-last-quote");
    expect(activity.executions[0].quote_provider).toBe("finnhub");
    expect(activity.executions[0].observed_at).toContain("2026-10-16 20:00:00");
    const sell = await t.submit(
      u.id,
      p.id,
      { symbol: "MSFT", side: "SELL", quantity: 1 },
      "sell",
    );
    await t.execute(u.id, p.id, sell.id, "fill-sell");
    const result = await t.inspect(u.id, p.id);
    expect(result.cash).toBe("900.00");
    expect(result.holdings[0].quantity).toBe(1);
  });
});
