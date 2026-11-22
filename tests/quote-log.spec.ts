import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logQuotes, HEADER } from "../src/quote-log.js";
import type { Quote } from "../src/providers.js";

const q = (symbol: string, price: string): Quote => ({
  symbol,
  price,
  observedAt: "2026-11-20T21:00:00.000Z",
  retrievedAt: "2026-11-22T10:00:00.000Z",
  provider: "finnhub",
  currency: "USD",
  adjustmentStatus: "raw",
});

describe("real-time quote CSV file", () => {
  let file: string;
  const noWait = async () => {};
  beforeEach(async () => {
    file = path.join(await mkdtemp(path.join(tmpdir(), "quotes-")), "rt.csv");
  });

  it("writes the header once and one row per quote per round", async () => {
    const res = await logQuotes({
      symbols: ["AAPL", "KO"],
      quote: async (s) => q(s, s === "AAPL" ? "250.1000" : "70.2500"),
      file,
      rounds: 2,
      intervalMs: 0,
      spacingMs: 0,
      sleep: noWait,
      log: () => {},
    });
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(res).toEqual({ written: 4, failed: 0 });
    expect(lines[0]).toBe(HEADER);
    expect(lines.length).toBe(5);
    expect(lines[1]).toBe("2026-11-22T10:00:00.000Z,AAPL,250.1000,2026-11-20T21:00:00.000Z,finnhub");
  });

  it("skips a stock whose quote fails and never invents a price", async () => {
    const msgs: string[] = [];
    const res = await logQuotes({
      symbols: ["AAPL", "KO"],
      quote: async (s) => {
        if (s === "KO") throw new Error("Finnhub unavailable");
        return q(s, "250.1000");
      },
      file,
      rounds: 1,
      intervalMs: 0,
      spacingMs: 0,
      sleep: noWait,
      log: (m) => msgs.push(m),
    });
    const text = await readFile(file, "utf8");
    expect(res).toEqual({ written: 1, failed: 1 });
    expect(text).not.toContain("KO,");
    expect(msgs.some((m) => m.includes("KO: skipped"))).toBeTrue();
  });

  it("appends to an existing file without repeating the header", async () => {
    const opts = { symbols: ["AAPL"], quote: async (s: string) => q(s, "1.0000"), file, rounds: 1, intervalMs: 0, spacingMs: 0, sleep: noWait, log: () => {} };
    await logQuotes(opts);
    await logQuotes(opts);
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    expect(lines.filter((l) => l === HEADER).length).toBe(1);
    expect(lines.length).toBe(3);
  });
});
