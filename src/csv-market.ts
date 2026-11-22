import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Bar, check } from "./domain.js";
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
export const CSV_SOURCE = "historical-prices-csv-v1";
export const CSV_HEADER = "symbol,date,close,open,high,low,volume";

// Reads the combined historical file (one row per stock per day) and groups
// the closing prices by symbol, sorted by date.
export function parseHistoricalCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  check(lines.shift()?.trim() === CSV_HEADER, "Unsupported historical CSV header");
  const bySymbol = new Map<string, Bar[]>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split(",");
    check(fields.length === 7, "Invalid historical CSV row");
    const [symbol, date, closeText] = fields.map((x) => x.trim());
    check(CSV_SYMBOLS.includes(symbol), "Unexpected symbol in historical CSV");
    check(z.iso.date().safeParse(date).success, "Invalid CSV date");
    const close = Number(closeText);
    check(Number.isFinite(close) && close > 0, "Invalid CSV closing price");
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol)!.push({ date, close });
  }
  check(bySymbol.size > 0, "Empty CSV history");
  // normalize drops nothing here (no cutoff), rejects conflicting duplicates and sorts by date
  const result = new Map<string, Bar[]>();
  for (const [symbol, bars] of bySymbol)
    result.set(symbol, normalize(bars, "9999-12-31"));
  return result;
}

export class CsvMarket implements MarketProvider {
  readonly sourceId = CSV_SOURCE;
  readonly symbols = CSV_SYMBOLS;
  private loaded?: Promise<Map<string, Bar[]>>;
  constructor(
    private quoteSource?: (symbol: string) => Promise<Quote>,
    private file = path.resolve("data/historical-prices.csv"),
    private now = () => new Date(),
  ) {}
  async history(symbol: string, cutoff: string): Promise<History> {
    check(CSV_SYMBOLS.includes(symbol), "Symbol not in supplied CSV dataset");
    check(
      z.iso.date().safeParse(cutoff).success &&
        cutoff <= this.now().toISOString().slice(0, 10),
      "Invalid or future cutoff",
    );
    // the file is read once and kept in memory
    this.loaded ??= readFile(this.file, "utf8").then(parseHistoricalCsv);
    const all = (await this.loaded).get(symbol) ?? [];
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
        "Supplied historical closing prices; source not independently authenticated",
        "File coverage is about 10 years (2016-10-04 to 2026-10-02), not 20",
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
