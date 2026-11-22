import { z } from "zod";
import { check, DomainError } from "./domain.js";
import { CSV_SYMBOLS } from "./csv-market.js";

// Informational live data only. Never mixed with synthetic portfolio pricing.
export class Finnhub {
  async quote(symbol: string) {
    check(
      CSV_SYMBOLS.includes(symbol),
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
    const quote = await this.quote(symbol);
    return { symbol, provider: "Finnhub", retrievedAt: quote.retrievedAt,
      quote: { price: Number(quote.price), observedAt: quote.observedAt,
        stale: this.now() - Date.parse(quote.observedAt) > 300000 } };
  }
}
