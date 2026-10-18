import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { check } from "./domain.js";
import { History, MarketProvider, normalize, Quote } from "./providers.js";
export const CSV_SYMBOLS = [
  "AAPL",
  "AMZN",
  "BAC",
  "CSCO",
  "CVX",
  "DIS",
  "GOOGL",
  "GS",
  "HD",
  "INTC",
  "JNJ",
  "JPM",
  "KO",
  "MSFT",
  "NVDA",
  "PFE",
  "PG",
  "UNH",
  "WMT",
  "XOM",
];
export const CSV_SOURCE = "nasdaq-user-csv-v1";
export function parseNasdaq(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  check(
    lines.shift() === "Date,Close/Last,Volume,Open,High,Low",
    "Unsupported Nasdaq CSV header",
  );
  const bars = lines
    .filter((x) => x.trim())
    .map((line) => {
      const fields = line.match(/(?:"(?:[^"]|"")*"|[^,]+)(?=,|$)/g);
      check(fields?.length === 6, "Invalid Nasdaq CSV row");
      const values = fields.map((x) =>
        x.replace(/^"|"$/g, "").replace(/""/g, '"'),
      );
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(values[0]);
      check(match, "Invalid CSV date");
      const date = `${match[3]}-${match[1]}-${match[2]}`;
      check(z.iso.date().safeParse(date).success, "Invalid CSV date");
      const close = Number(values[1].replace(/[$,]/g, ""));
      check(Number.isFinite(close) && close > 0, "Invalid CSV closing price");
      return { date, close };
    });
  check(bars.length > 0, "Empty CSV history");
  return normalize(bars, "9999-12-31");
}
export class CsvMarket implements MarketProvider {
  readonly sourceId = CSV_SOURCE;
  readonly symbols = CSV_SYMBOLS;
  private loaded = new Map<string, Promise<ReturnType<typeof parseNasdaq>>>();
  constructor(
    private quoteSource?: (symbol: string) => Promise<Quote>,
    private directory = path.resolve("data/nasdaq"),
    private now = () => new Date(),
  ) {}
  async history(symbol: string, cutoff: string): Promise<History> {
    check(CSV_SYMBOLS.includes(symbol), "Symbol not in supplied CSV dataset");
    check(
      z.iso.date().safeParse(cutoff).success &&
        cutoff <= this.now().toISOString().slice(0, 10),
      "Invalid or future cutoff",
    );
    if (!this.loaded.has(symbol))
      this.loaded.set(
        symbol,
        readFile(path.join(this.directory, symbol + ".csv"), "utf8").then(
          parseNasdaq,
        ),
      );
    const all = await this.loaded.get(symbol)!;
    const start = new Date(cutoff + "T00:00:00Z");
    start.setUTCFullYear(start.getUTCFullYear() - 20);
    const bars = all.filter(
      (b) => b.date <= cutoff && b.date >= start.toISOString().slice(0, 10),
    );
    check(bars.length > 0, "No CSV observations at or before cutoff");
    return {
      symbol,
      bars,
      provider: CSV_SOURCE,
      retrievedAt: this.now().toISOString(),
      currency: "USD",
      adjustmentStatus: "unverified-close",
      coverage: {
        from: bars[0].date,
        to: bars.at(-1)!.date,
        requestedYears: 20,
      },
      warnings: [
        "User-supplied Nasdaq Close/Last files; source not independently authenticated",
        "Available file coverage: 2016-10-04 to 2026-10-02; not 20 years",
        "Split/dividend adjustments are unverified; returns are price-series comparisons, not verified total returns",
      ],
    };
  }
  async quote(symbol: string): Promise<Quote> {
    check(CSV_SYMBOLS.includes(symbol), "Symbol not in supplied CSV dataset");
    check(
      this.quoteSource,
      "Historical CSV closes cannot serve as current execution quotes. Configure Finnhub.",
      503,
    );
    return this.quoteSource(symbol);
  }
}
