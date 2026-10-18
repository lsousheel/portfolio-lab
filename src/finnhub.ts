import { z } from "zod";
import { check, DomainError } from "./domain.js";
import { SYMBOLS } from "./providers.js";

// Informational live data only. Never mixed with synthetic portfolio pricing.
export class Finnhub {
  async quote(symbol: string) {
    check(
      [...SYMBOLS, "CSCO", "GS", "INTC"].includes(symbol),
      "Choose a configured US stock",
    );
    const parsed = z
      .object({ c: z.number().positive(), t: z.number().int().positive() })
      .safeParse(await this.request("quote", { symbol }, 60000));
    check(parsed.success, "No valid Finnhub quote returned", 502);
    return {
      symbol,
      price: parsed.data.c.toFixed(4),
      observedAt: new Date(parsed.data.t * 1000).toISOString(),
      retrievedAt: new Date(this.now()).toISOString(),
      provider: "finnhub",
      currency: "USD" as const,
      adjustmentStatus: "raw" as const,
    };
  }
  private cache = new Map<string, { until: number; value: unknown }>();
  private pending = new Map<string, Promise<any>>();
  private calls: number[] = [];
  constructor(
    private key: string,
    private fetcher: typeof fetch = fetch,
    private now: () => number = Date.now,
  ) {}
  private async request(
    endpoint: string,
    params: Record<string, string>,
    ttl: number,
  ): Promise<any> {
    check(this.key, "Set FINNHUB_API_KEY in .env and restart the server", 503);
    const cacheKey = endpoint + JSON.stringify(params);
    const hit = this.cache.get(cacheKey);
    if (hit && hit.until > this.now()) return hit.value;
    if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);
    const task = (async () => {
      this.calls = this.calls.filter((t) => t > this.now() - 60000);
      check(
        this.calls.length < 20,
        "Live-data request limit reached; wait one minute",
        429,
      );
      this.calls.push(this.now());
      const url = new URL("https://finnhub.io/api/v1/" + endpoint);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      let response: Response;
      try {
        response = await this.fetcher(url.toString(), {
          headers: { "X-Finnhub-Token": this.key },
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        throw new DomainError("Finnhub connection failed or timed out", 503);
      }
      check(
        response.status !== 429,
        "Finnhub rate limit reached; try later",
        429,
      );
      check(
        response.status !== 401 && response.status !== 403,
        "Finnhub key or endpoint access denied",
        502,
      );
      check(response.ok, "Finnhub unavailable", 502);
      let value: any;
      try {
        value = await response.json();
      } catch {
        throw new DomainError("Invalid Finnhub response", 502);
      }
      check(value && !value.error, "Finnhub could not provide this data", 502);
      this.cache.set(cacheKey, { until: this.now() + ttl, value });
      return value;
    })();
    this.pending.set(cacheKey, task);
    try {
      return await task;
    } finally {
      this.pending.delete(cacheKey);
    }
  }
  async snapshot(symbol: string) {
    check(
      [...SYMBOLS, "CSCO", "GS", "INTC"].includes(symbol),
      "Choose a configured US stock",
    );
    const to = new Date(this.now()).toISOString().slice(0, 10);
    const from = new Date(this.now() - 7 * 86400000).toISOString().slice(0, 10);
    const results = await Promise.allSettled([
      this.request("quote", { symbol }, 60000),
      this.request("company-news", { symbol, from, to }, 900000),
    ]);
    const warnings: string[] = [];
    let quote: null | { price: number; observedAt: string; stale: boolean } =
      null;
    let news: {
      title: string;
      url: string;
      published: string;
      source: string;
    }[] = [];
    if (results[0].status === "fulfilled") {
      const q = z
        .object({ c: z.number().positive(), t: z.number().int().positive() })
        .safeParse(results[0].value);
      if (q.success && q.data.t * 1000 <= this.now() + 60000)
        quote = {
          price: q.data.c,
          observedAt: new Date(q.data.t * 1000).toISOString(),
          stale: this.now() - q.data.t * 1000 > 300000,
        };
      else warnings.push("No valid quote returned for this stock");
    } else warnings.push(results[0].reason.message);
    if (results[1].status === "fulfilled") {
      const n = z
        .array(
          z.object({
            headline: z.string().max(2000),
            url: z.url(),
            datetime: z.number().int().positive(),
            source: z.string().max(200),
          }),
        )
        .safeParse(results[1].value);
      if (n.success)
        news = n.data
          .filter(
            (x) =>
              /^https?:\/\//.test(x.url) && x.datetime * 1000 <= this.now(),
          )
          .sort((a, b) => b.datetime - a.datetime)
          .slice(0, 8)
          .map((x) => ({
            title: x.headline,
            url: x.url,
            published: new Date(x.datetime * 1000).toISOString(),
            source: x.source,
          }));
      else warnings.push("Invalid news response from Finnhub");
    } else warnings.push(results[1].reason.message);
    return {
      symbol,
      provider: "Finnhub",
      retrievedAt: new Date(this.now()).toISOString(),
      quote,
      news,
      warnings,
      purpose:
        "Live information only; historical analysis and simulated trades use their separately labeled provider. Quotes cached up to 60 seconds; news up to 15 minutes.",
    };
  }
}
