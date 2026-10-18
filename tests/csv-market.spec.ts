import {
  CsvMarket,
  CSV_SYMBOLS,
  CSV_SOURCE,
  parseNasdaq,
} from "../src/csv-market.js";
import { pool, migrate } from "../src/db.js";
import { Trading } from "../src/trading.js";
import { Analysis } from "../src/analysis.js";
import { randomUUID } from "node:crypto";
describe("Supplied Nasdaq historical files", () => {
  it("loads exactly 20 files, orders observations and preserves hand-checked AAPL values", async () => {
    const market = new CsvMarket();
    expect(CSV_SYMBOLS.length).toBe(20);
    for (const symbol of CSV_SYMBOLS) {
      const h = await market.history(symbol, "2026-10-02");
      expect(h.bars.length).toBe(2513);
      expect(h.coverage.from).toBe("2016-10-04");
      expect(h.coverage.to).toBe("2026-10-02");
      expect(h.adjustmentStatus).toBe("unverified-close");
      expect(h.provider).toBe(CSV_SOURCE);
    }
    const a = await market.history("AAPL", "2026-10-02");
    expect(a.bars[0].close).toBe(28.25);
    expect(a.bars.at(-1)!.close).toBe(333.69);
  });
  it("enforces cutoffs, rejects unavailable symbols and never fabricates execution quotes", async () => {
    const m = new CsvMarket();
    const h = await m.history("AAPL", "2025-10-16");
    expect(h.bars.every((b) => b.date <= "2025-10-16")).toBeTrue();
    await expectAsync(m.history("META", "2026-10-02")).toBeRejected();
    await expectAsync(m.history("AAPL", "2010-01-01")).toBeRejected();
    await expectAsync(m.quote("AAPL")).toBeRejected();
  });
  it("rejects invalid dates, prices and conflicting duplicate days", () => {
    const header = "Date,Close/Last,Volume,Open,High,Low\n";
    expect(() => parseNasdaq(header + "02/30/2025,$10,1,1,1,1")).toThrow();
    expect(() => parseNasdaq(header + "01/01/2025,$0,1,1,1,1")).toThrow();
    expect(() =>
      parseNasdaq(header + "01/01/2025,$10,1,1,1,1\n01/01/2025,$11,1,1,1,1"),
    ).toThrow();
  });
  it("persists recommendations for all horizons and evaluates real-file subsequent observations", async () => {
    const db = pool(true);
    try {
      await migrate(db);
      const t = new Trading(db, new CsvMarket()),
        a = new Analysis(t);
      const u = await t.user("CSV audit " + randomUUID()),
        p = await t.portfolio(u.id, 2);
      await t.fund(u.id, p.id, "100000.00", "fund");
      for (const h of [1, 2, 5]) {
        const r = await a.recommend(
          u.id,
          p.id,
          CSV_SYMBOLS,
          "2025-10-16",
          h,
          20,
        );
        expect(r.details.every((d) => d.provider === CSV_SOURCE)).toBeTrue();
        expect(
          r.details.every(
            (d) => !d.intervals.find((i) => i.years === 20)!.fullCoverage,
          ),
        ).toBeTrue();
        expect(r.weights.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 7);
        const e = await a.evaluate(u.id, p.id, r.id, "2026-10-02");
        expect(e.executionDate > r.cutoff).toBeTrue();
        expect(e.end).toBe("2026-10-02");
      }
    } finally {
      await db.end();
    }
  }, 120000);
});
