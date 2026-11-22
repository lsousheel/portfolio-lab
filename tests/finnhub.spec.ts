import { Finnhub } from "../src/finnhub.js";

describe("Current Finnhub quotes", () => {
  const now = Date.parse("2026-10-16T15:00:00Z");
  it("requests stock quotes with a header token and caches the results", async () => {
    let calls = 0;
    const client = new Finnhub("test-key", (async (_url:any, init:any) => {
      calls++;
      expect(init.headers["X-Finnhub-Token"]).toBe("test-key");
      return new Response(JSON.stringify({c:123.45,t:now/1000-600}));
    }) as typeof fetch, () => now);
    const first = await client.snapshot("AAPL");
    await client.snapshot("AAPL");
    expect(calls).toBe(1);
    expect(first.quote?.price).toBe(123.45);
    expect(first.quote?.stale).toBeTrue();
  });
  it("refuses missing keys and unsupported symbols", async () => {
    const client = new Finnhub("", (async () => { throw Error("should not fetch"); }) as typeof fetch, () => now);
    await expectAsync(client.quote("INVALID")).toBeRejected();
    await expectAsync(client.quote("AAPL")).toBeRejectedWithError(/Set FINNHUB_API_KEY/);
  });
  it("rejects malformed or zero-price quotes", async () => {
    const client = new Finnhub("key", (async()=>new Response(JSON.stringify({c:0,t:now/1000}))) as typeof fetch,()=>now);
    await expectAsync(client.quote("AAPL")).toBeRejectedWithError(/No valid Finnhub quote/);
  });
});
