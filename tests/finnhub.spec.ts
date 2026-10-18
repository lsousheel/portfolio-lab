import { Finnhub } from "../src/finnhub.js";
describe("Finnhub informational integration", () => {
  const now = Date.parse("2026-10-16T15:00:00Z");
  it("authenticates with a header, caches both endpoints and preserves observation time", async () => {
    let calls = 0;
    const fake = (async (url: any, init: any) => {
      calls++;
      expect(String(url)).not.toContain("test-key");
      expect(init.headers["X-Finnhub-Token"]).toBe("test-key");
      return new Response(
        JSON.stringify(
          String(url).includes("company-news")
            ? [
                {
                  headline: "Example",
                  url: "https://example.com/news",
                  datetime: now / 1000 - 60,
                  source: "Example",
                },
              ]
            : { c: 123.45, t: now / 1000 - 600 },
        ),
        { status: 200 },
      );
    }) as typeof fetch;
    const client = new Finnhub("test-key", fake, () => now);
    const result = await client.snapshot("AAPL");
    await client.snapshot("AAPL");
    expect(calls).toBe(2);
    expect(result.quote?.price).toBe(123.45);
    expect(result.quote?.stale).toBeTrue();
    expect(result.news.length).toBe(1);
    expect(result.warnings).toEqual([]);
  });
  it("reports denied access without exposing credentials or fabricating fallback data", async () => {
    const client = new Finnhub(
      "private-test",
      (async () => new Response("denied", { status: 403 })) as typeof fetch,
      () => now,
    );
    const r = await client.snapshot("AAPL");
    expect(r.quote).toBeNull();
    expect(r.news).toEqual([]);
    expect(r.warnings.length).toBe(2);
    expect(JSON.stringify(r)).not.toContain("private-test");
  });
  it("keeps usable quotes when news is rate limited and does not retry quota failures", async () => {
    let calls = 0;
    const client = new Finnhub(
      "test",
      (async (url: any) => {
        calls++;
        return String(url).includes("company-news")
          ? new Response("quota", { status: 429 })
          : new Response(JSON.stringify({ c: 50, t: now / 1000 }));
      }) as typeof fetch,
      () => now,
    );
    const r = await client.snapshot("MSFT");
    expect(calls).toBe(2);
    expect(r.quote?.price).toBe(50);
    expect(r.warnings.length).toBe(1);
  });
  it("rejects invalid symbols before making requests and missing keys make no requests", async () => {
    let calls = 0;
    const client = new Finnhub(
      "",
      (async () => {
        calls++;
        throw Error("unexpected");
      }) as typeof fetch,
      () => now,
    );
    await expectAsync(client.snapshot("INVALID")).toBeRejected();
    const r = await client.snapshot("AAPL");
    expect(calls).toBe(0);
    expect(r.warnings.length).toBe(2);
  });
  it("filters unsafe article links and rejects invalid prices", async () => {
    const client = new Finnhub(
      "test",
      (async (url: any) =>
        new Response(
          JSON.stringify(
            String(url).includes("company-news")
              ? [
                  {
                    headline: "Unsafe",
                    url: "javascript:alert(1)",
                    datetime: now / 1000,
                    source: "Example",
                  },
                ]
              : { c: 0, t: now / 1000 },
          ),
        )) as typeof fetch,
      () => now,
    );
    const r = await client.snapshot("AAPL");
    expect(r.quote).toBeNull();
    expect(r.news).toEqual([]);
  });
});
