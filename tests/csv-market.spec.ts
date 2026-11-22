import { readFile } from "node:fs/promises";
import {
  CsvMarket,
  CSV_HEADER,
  CSV_SYMBOLS,
  CSV_SOURCE,
  parseHistoricalCsv,
} from "../src/csv-market.js";

describe("combined historical CSV (data/historical-prices.csv)", () => {
  it("has one header and 20 stocks x 2,513 days = 50,260 rows", async () => {
    const lines = (await readFile("data/historical-prices.csv", "utf8"))
      .trim()
      .split(/\r?\n/);
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines.length - 1).toBe(20 * 2513);
  });
  it("loads all 20 stocks in date order and keeps hand-checked AAPL closes", async () => {
    const market = new CsvMarket();
    expect(CSV_SYMBOLS.length).toBe(20);
    for (const symbol of CSV_SYMBOLS) {
      const h = await market.history(symbol, "2026-10-02");
      expect(h.bars.length).toBe(2513);
      expect(h.coverage.from).toBe("2016-10-04");
      expect(h.coverage.to).toBe("2026-10-02");
      expect(h.adjustmentStatus).toBe("unverified-close");
      expect(h.provider).toBe(CSV_SOURCE);
      expect(h.bars.every((b, i) => i === 0 || b.date > h.bars[i - 1].date)).toBeTrue();
    }
    // first and last AAPL rows of the file
    const a = await market.history("AAPL", "2026-10-02");
    expect(a.bars[0].close).toBe(28.25);
    expect(a.bars.at(-1)!.close).toBe(333.69);
  });
  it("cuts history at the cutoff, rejects unknown symbols and gives no fake quotes", async () => {
    const m = new CsvMarket();
    const h = await m.history("AAPL", "2025-10-16");
    expect(h.bars.every((b) => b.date <= "2025-10-16")).toBeTrue();
    await expectAsync(m.history("META", "2026-10-02")).toBeRejected();
    await expectAsync(m.history("AAPL", "2010-01-01")).toBeRejected();
    await expectAsync(m.quote("AAPL")).toBeRejected();
  });
  it("parses a small file and sorts each stock by date", () => {
    const parsed = parseHistoricalCsv(
      CSV_HEADER +
        "\nAAPL,2025-01-02,11,1,1,1,1\nMSFT,2025-01-02,50,1,1,1,1\nAAPL,2025-01-01,10,1,1,1,1",
    );
    expect(parsed.get("AAPL")).toEqual([
      { date: "2025-01-01", close: 10 },
      { date: "2025-01-02", close: 11 },
    ]);
    expect(parsed.get("MSFT")).toEqual([{ date: "2025-01-02", close: 50 }]);
  });
  it("rejects a wrong header, bad dates, bad prices, unknown symbols and conflicting duplicates", () => {
    const row = (r: string) => CSV_HEADER + "\n" + r;
    expect(() => parseHistoricalCsv("Date,Close\nAAPL,1")).toThrow();
    expect(() => parseHistoricalCsv(row("AAPL,2025-02-30,10,1,1,1,1"))).toThrow();
    expect(() => parseHistoricalCsv(row("AAPL,2025-01-01,0,1,1,1,1"))).toThrow();
    expect(() => parseHistoricalCsv(row("AAPL,2025-01-01,abc,1,1,1,1"))).toThrow();
    expect(() => parseHistoricalCsv(row("TSLA,2025-01-01,10,1,1,1,1"))).toThrow();
    expect(() => parseHistoricalCsv(row("AAPL,2025-01-01,10,1,1,1"))).toThrow();
    expect(() =>
      parseHistoricalCsv(row("AAPL,2025-01-01,10,1,1,1,1\nAAPL,2025-01-01,11,1,1,1,1")),
    ).toThrow();
  });
});
