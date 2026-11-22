import { appendFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Quote } from "./providers.js";

// Writes real-time quotes to a CSV file, one row per successful retrieval.
export const HEADER = "retrieved_at_utc,symbol,price_usd,quote_time_utc,provider";

export const csvRow = (q: Quote) =>
  [q.retrievedAt, q.symbol, q.price, q.observedAt, q.provider].join(",");

export async function ensureHeader(file: string) {
  await mkdir(path.dirname(file), { recursive: true });
  let existing = "";
  try {
    existing = await readFile(file, "utf8");
  } catch {}
  if (!existing.trim()) await appendFile(file, HEADER + "\n");
}

export async function logQuotes(opts: {
  symbols: string[];
  quote: (symbol: string) => Promise<Quote>;
  file: string;
  rounds: number;
  intervalMs: number;
  spacingMs: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}) {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? console.log;
  await ensureHeader(opts.file);
  let written = 0,
    failed = 0;
  for (let round = 1; round <= opts.rounds; round++) {
    const started = Date.now();
    for (const symbol of opts.symbols) {
      try {
        await appendFile(opts.file, csvRow(await opts.quote(symbol)) + "\n");
        written++;
      } catch (e: any) {
        // A failed quote is reported and skipped. We never write a made-up price.
        failed++;
        log(`${symbol}: skipped (${e?.message || "error"})`);
      }
      await sleep(opts.spacingMs);
    }
    log(`round ${round}/${opts.rounds} done, ${written} rows written, ${failed} skipped`);
    if (round < opts.rounds) await sleep(Math.max(0, opts.intervalMs - (Date.now() - started)));
  }
  return { written, failed };
}
