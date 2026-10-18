import { services } from "./config.js";
import { migrate, rows } from "./db.js";
import { SYMBOLS, AlphaVantage } from "./providers.js";
const { db, trading, analysis } = services();
try {
  const command = process.argv[2];
  if (command === "migrate") {
    await migrate(db);
    console.log("Migrations applied");
  } else if (command === "seed") {
    for (const symbol of SYMBOLS) await analysis.history(symbol, "2026-10-16");
    console.log("Loaded 20 SYNTHETIC labeled series; no real stock history");
  } else if (command === "demo") {
    console.log("SYNTHETIC OFFLINE DEMONSTRATION; simulated money only");
    const alice = await trading.user("Demo Alice"),
      bob = await trading.user("Demo Bob");
    const a = await trading.portfolio(alice.id, 1),
      b = await trading.portfolio(bob.id, 5);
    await trading.fund(alice.id, a.id, "100000.00", "fund");
    await trading.fund(bob.id, b.id, "100000.00", "fund");
    console.log(
      "Initial portfolios",
      await trading.inspect(alice.id, a.id),
      await trading.inspect(bob.id, b.id),
    );
    let recommendation: any;
    for (const h of [1, 2, 5]) {
      const r = await analysis.recommend(
        alice.id,
        a.id,
        SYMBOLS,
        "2025-10-16",
        h,
      );
      console.log("Recommendation", {
        id: r.id,
        horizon: h,
        frequency: r.frequency,
        risk: r.risk.proposed,
        observations: r.risk.observations,
      });
      recommendation = r;
    }
    const proposal = await analysis.propose(alice.id, a.id, recommendation.id);
    console.log("Coordinated proposal", proposal);
    if (proposal.legs.length)
      console.log(
        "Atomic rebalance",
        await trading.rebalance(alice.id, a.id, proposal.legs, "rebalance"),
      );
    await trading.submit(
      alice.id,
      a.id,
      { symbol: "AAPL", side: "SELL", quantity: 1 },
      "alice-sell",
    );
    await trading.submit(
      bob.id,
      b.id,
      { symbol: "AAPL", side: "BUY", quantity: 2 },
      "bob-buy",
    );
    // A third portfolio makes the same-side multi-user aggregation explicit.
    const a2 = await trading.portfolio(alice.id, 2);
    await trading.fund(alice.id, a2.id, "10000.00", "fund");
    await trading.submit(
      alice.id,
      a2.id,
      { symbol: "AAPL", side: "BUY", quantity: 3 },
      "alice-buy",
    );
    const cutoff = new Date();
    console.log(
      "Multi-user basket",
      await trading.basket("demo-" + a.id, cutoff),
    );
    const bad = await trading.submit(
      bob.id,
      b.id,
      { symbol: "MSFT", side: "BUY", quantity: 1000000 },
      "bad",
    );
    try {
      await trading.execute(bob.id, b.id, bad.id, "bad-execute");
      throw Error("Expected rejection");
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes("Insufficient funds"))
        throw e;
      console.log("Expected rejection:", e.message);
    }
    console.log(
      "Final portfolios",
      await trading.inspect(alice.id, a.id),
      await trading.inspect(bob.id, b.id),
    );
    console.log(
      "Historical forward-workflow evaluation",
      await analysis.evaluate(alice.id, a.id, recommendation.id, "2026-10-16"),
    );
    console.log(
      "Chronological technical replay",
      await analysis.replay("AAPL", "2026-10-16", 1),
    );
    console.log("Demo completed");
  } else if (command === "evaluate") {
    const all = await rows(
      db,
      "SELECT r.id,r.portfolio_id,p.user_id FROM recommendations r JOIN portfolios p ON p.id=r.portfolio_id",
    );
    for (const r of all) {
      try {
        console.log(
          await analysis.evaluate(
            r.user_id,
            r.portfolio_id,
            r.id,
            process.argv[3] || new Date().toISOString().slice(0, 10),
          ),
        );
      } catch (e) {
        console.log({ id: r.id, pendingOrError: (e as Error).message });
      }
    }
  } else if (command === "live") {
    const provider = new AlphaVantage(process.env.ALPHA_VANTAGE_KEY || "");
    const s = process.argv[3] || "IBM";
    console.log(await provider.quote(s));
    const h = await provider.history(s, new Date().toISOString().slice(0, 10));
    console.log({
      symbol: s,
      coverage: h.coverage,
      observations: h.bars.length,
      warnings: h.warnings,
    });
  } else
    throw Error(
      "Use migrate, seed, demo, evaluate [YYYY-MM-DD], or live [SYMBOL]",
    );
} finally {
  await db.end();
}
