import { pool, migrate, rows } from "../src/db.js";
import { Trading } from "../src/trading.js";
import { Analysis } from "../src/analysis.js";
import { OfflineProvider, Quote, SYMBOLS } from "../src/providers.js";
import { app } from "../src/api.js";
import request from "supertest";
import { Pool } from "mysql2/promise";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
class Fixed extends OfflineProvider {
  mode = "ok";
  override async quote(symbol: string): Promise<Quote> {
    if (this.mode === "missing") throw Error("Missing quote");
    return {
      symbol,
      price: "12.5000",
      observedAt:
        this.mode === "stale"
          ? "2000-01-01T00:00:00Z"
          : new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      provider: "synthetic-test",
      currency: "USD",
      adjustmentStatus: "raw",
    };
  }
}
let db: Pool, t: Trading, provider: Fixed;
async function account(cash = "100.00") {
  const user = await t.user("Test " + randomUUID()),
    p = await t.portfolio(user.id, 1);
  await t.fund(user.id, p.id, cash, "fund");
  return { user, p };
}
async function buy(user: string, pid: string, q = 3) {
  return t.submit(
    user,
    pid,
    { symbol: "AAPL", side: "BUY", quantity: q },
    randomUUID(),
  );
}
beforeAll(async () => {
  db = pool(true);
  await migrate(db);
});
afterAll(async () => {
  await db?.end();
});
beforeEach(() => {
  provider = new Fixed();
  t = new Trading(db, provider);
});
describe("MySQL transaction and API integration", () => {
  it("buys 3 at 12.50 from 100 => 62.50 and exactly 3 shares", async () => {
    const { user, p } = await account(),
      o = await buy(user.id, p.id);
    await t.execute(user.id, p.id, o.id, "exec");
    const result = await t.inspect(user.id, p.id);
    expect(result.cash).toBe("62.50");
    expect(result.holdings[0].quantity).toBe(3);
  });
  it("serializes concurrent orders to prevent overspend", async () => {
    const { user, p } = await account("50.00"),
      a = await buy(user.id, p.id, 3),
      b = await buy(user.id, p.id, 3);
    const result = await Promise.allSettled([
      t.execute(user.id, p.id, a.id, "a"),
      t.execute(user.id, p.id, b.id, "b"),
    ]);
    expect(result.filter((x) => x.status === "fulfilled").length).toBe(1);
    expect((await t.inspect(user.id, p.id)).cash).toBe("12.50");
  });
  it("idempotent requests execute once and conflicting reuse is rejected", async () => {
    const { user, p } = await account();
    const a = await buy(user.id, p.id);
    await Promise.all([
      t.execute(user.id, p.id, a.id, "e"),
      t.execute(user.id, p.id, a.id, "e"),
    ]);
    expect((await t.activity(user.id, p.id)).executions.length).toBe(1);
    await expectAsync(t.fund(user.id, p.id, "2.00", "fund")).toBeRejected();
  });
  it("rejects unsupported fractional quantities, invalid horizon and negative funds", async () => {
    const { user, p } = await account();
    await expectAsync(buy(user.id, p.id, 0.5)).toBeRejected();
    await expectAsync(t.portfolio(user.id, 3)).toBeRejected();
    await expectAsync(t.fund(user.id, p.id, "-1", "negative")).toBeRejected();
  });
  it("rejects stale/missing quotes and excessive sells without balance changes", async () => {
    const { user, p } = await account(),
      o = await buy(user.id, p.id);
    provider.mode = "stale";
    await expectAsync(t.execute(user.id, p.id, o.id, "e")).toBeRejected();
    provider.mode = "missing";
    await expectAsync(t.execute(user.id, p.id, o.id, "e")).toBeRejected();
    provider.mode = "ok";
    const sell = await t.submit(
      user.id,
      p.id,
      { symbol: "AAPL", side: "SELL", quantity: 1 },
      "sell",
    );
    await expectAsync(t.execute(user.id, p.id, sell.id, "s")).toBeRejected();
    expect((await t.inspect(user.id, p.id)).cash).toBe("100.00");
  });
  it("rolls back failure injected after cash update before holding update", async () => {
    const { user, p } = await account(),
      o = await buy(user.id, p.id);
    t.fault = () => {
      throw Error("injected failure");
    };
    await expectAsync(t.execute(user.id, p.id, o.id, "e")).toBeRejected();
    const result = await t.inspect(user.id, p.id);
    expect(result.cash).toBe("100.00");
    expect(result.holdings.length).toBe(0);
    expect((await t.activity(user.id, p.id)).executions.length).toBe(0);
    t.fault = undefined;
    await t.execute(user.id, p.id, o.id, "e");
    expect((await t.inspect(user.id, p.id)).cash).toBe("62.50");
  });
  it("rolls back all rebalance legs on second-leg failure", async () => {
    const { user, p } = await account("50.00");
    await expectAsync(
      t.rebalance(
        user.id,
        p.id,
        [
          { symbol: "AAPL", side: "BUY", quantity: 2 },
          { symbol: "MSFT", side: "BUY", quantity: 3 },
        ],
        "reb",
      ),
    ).toBeRejected();
    expect((await t.inspect(user.id, p.id)).cash).toBe("50.00");
    expect((await t.activity(user.id, p.id)).orders.length).toBe(0);
  });
  it("cancels pending orders and cannot execute them", async () => {
    const { user, p } = await account(),
      o = await buy(user.id, p.id);
    await t.cancel(user.id, p.id, o.id);
    await expectAsync(t.execute(user.id, p.id, o.id, "e")).toBeRejected();
  });
  it("API authenticates, isolates users, and returns monetary strings", async () => {
    const a = await account(),
      b = await account(),
      api = app(t);
    await request(api)
      .get("/portfolios/" + a.p.id)
      .expect(401);
    await request(api)
      .get("/portfolios/" + a.p.id)
      .set("Authorization", "Bearer " + b.user.token)
      .expect(404);
    const response = await request(api)
      .get("/portfolios/" + a.p.id)
      .set("Authorization", "Bearer " + a.user.token)
      .expect(200);
    expect(response.body.cash).toBe("100.00");
  });
  it("multi-user full-fill basket reconciles quantities and cents; rejects unfunded account", async () => {
    // Clear only pending test orders from earlier scenarios so this test has a controlled batch.
    await db.execute(
      "UPDATE orders SET status='CANCELLED' WHERE status='PENDING'",
    );
    const a = await account(),
      b = await account(),
      c = await account("1.00");
    await buy(a.user.id, a.p.id, 3);
    await buy(b.user.id, b.p.id, 2);
    await buy(c.user.id, c.p.id, 1);
    const cutoff = new Date(),
      key = randomUUID();
    const batch = await t.basket(key, cutoff);
    expect(batch.groups["AAPL:BUY"]).toEqual({ quantity: 5, amount: "62.50" });
    expect(batch.rejected.length).toBe(1);
    expect((await t.inspect(a.user.id, a.p.id)).cash).toBe("62.50");
    expect((await t.inspect(b.user.id, b.p.id)).cash).toBe("75.00");
    expect((await t.inspect(c.user.id, c.p.id)).cash).toBe("1.00");
    expect((await t.basket(key, cutoff)).groups).toEqual(batch.groups);
    const [s] = await rows(
      db,
      "SELECT SUM(quantity) quantity,SUM(amount) amount FROM basket_allocations WHERE batch_id=?",
      [key],
    );
    expect(Number(s.quantity)).toBe(5);
    expect(s.amount).toBe("62.50");
  });
  it("persists through a new application and database pool", async () => {
    const { user, p } = await account();
    const fresh = pool(true);
    try {
      const other = new Trading(fresh, provider);
      expect((await other.inspect(user.id, p.id)).cash).toBe("100.00");
      expect((await other.authenticate(user.token)).id).toBe(user.id);
      const persisted = JSON.parse(
        execFileSync(
          process.execPath,
          ["dist/tests/persistence-child.js", p.id],
          { encoding: "utf8" },
        ),
      );
      expect(persisted[0].cash).toBe("100.00");
    } finally {
      await fresh.end();
    }
  });
});
describe("Analysis persistence and chronology", () => {
  it("records 20-company recommendation and evaluates only subsequent dates", async () => {
    const { user, p } = await account("10000.00"),
      a = new Analysis(t);
    const r = await a.recommend(user.id, p.id, SYMBOLS, "2025-01-01", 2);
    expect(r.weights.length).toBe(20);
    expect(r.weights.reduce((s, x) => s + x)).toBeCloseTo(1, 7);
    expect(r.details.every((x) => x.coverage.to <= r.cutoff)).toBeTrue();
    await expectAsync(
      a.evaluate(user.id, p.id, r.id, "2024-12-31"),
    ).toBeRejected();
    const e = await a.evaluate(user.id, p.id, r.id, "2025-06-01");
    expect(e.executionDate > r.cutoff).toBeTrue();
    expect(e.label).toBe("historical forward-workflow replay");
    const [stored] = await rows(
      db,
      "SELECT COUNT(*) n FROM evaluations WHERE recommendation_id=?",
      [r.id],
    );
    expect(Number(stored.n)).toBe(1);
  }, 60000);
});

describe("Additional transaction boundary cases", () => {
  it("returns committed idempotent result even if provider is later unavailable", async () => {
    const { user, p } = await account(),
      o = await buy(user.id, p.id);
    const first = await t.execute(user.id, p.id, o.id, "replay-key");
    provider.mode = "missing";
    expect(await t.execute(user.id, p.id, o.id, "replay-key")).toEqual(first);
  });
  it("atomic sells finance buys only inside the same portfolio", async () => {
    const { user, p } = await account("25.00"),
      o = await buy(user.id, p.id, 2);
    await t.execute(user.id, p.id, o.id, "first");
    await t.rebalance(
      user.id,
      p.id,
      [
        { symbol: "AAPL", side: "SELL", quantity: 2 },
        { symbol: "MSFT", side: "BUY", quantity: 2 },
      ],
      "swap",
    );
    const result = await t.inspect(user.id, p.id);
    expect(result.cash).toBe("0.00");
    expect(result.holdings.find((h: any) => h.symbol === "AAPL").quantity).toBe(
      0,
    );
    expect(result.holdings.find((h: any) => h.symbol === "MSFT").quantity).toBe(
      2,
    );
  });
  it("concurrent cancellation and execution have one consistent outcome", async () => {
    const { user, p } = await account(),
      o = await buy(user.id, p.id);
    await Promise.allSettled([
      t.execute(user.id, p.id, o.id, "x"),
      t.cancel(user.id, p.id, o.id),
    ]);
    const state = await t.inspect(user.id, p.id),
      activity = await t.activity(user.id, p.id);
    if (activity.orders[0].status === "FILLED") {
      expect(state.cash).toBe("62.50");
      expect(activity.executions.length).toBe(1);
    } else {
      expect(activity.orders[0].status).toBe("CANCELLED");
      expect(state.cash).toBe("100.00");
      expect(activity.executions.length).toBe(0);
    }
  });
  it("basket infrastructure failure rolls back every member", async () => {
    await db.execute(
      "UPDATE orders SET status='CANCELLED' WHERE status='PENDING'",
    );
    const { user, p } = await account();
    await buy(user.id, p.id);
    const key = randomUUID();
    t.fault = () => {
      throw Error("injected infrastructure fault");
    };
    await expectAsync(t.basket(key, new Date())).toBeRejected();
    expect((await t.inspect(user.id, p.id)).cash).toBe("100.00");
    expect(
      (await rows(db, "SELECT * FROM batches WHERE id=?", [key])).length,
    ).toBe(0);
  });
});

it("uses UTC sessions and excludes orders created after basket cutoff", async () => {
  const [zone] = await rows(db, "SELECT @@session.time_zone zone");
  expect(zone.zone).toBe("+00:00");
  await db.execute(
    "UPDATE orders SET status='CANCELLED' WHERE status='PENDING'",
  );
  const { user, p } = await account(),
    cutoff = new Date(Date.now() - 60000),
    o = await buy(user.id, p.id);
  const batch = await t.basket(randomUUID(), cutoff);
  expect(batch.fills.length).toBe(0);
  expect(
    (await t.activity(user.id, p.id)).orders.find((x: any) => x.id === o.id)
      .status,
  ).toBe("PENDING");
});

it("uses application-clock order times at the exact batch boundary", async () => {
  const { user, p } = await account();
  const now = new Date("2026-01-15T12:00:00.123Z");
  const clockProvider = new OfflineProvider(() => now),
    clockTrading = new Trading(db, clockProvider, () => now);
  const o = await clockTrading.submit(
    user.id,
    p.id,
    { symbol: "AAPL", side: "BUY", quantity: 1 },
    randomUUID(),
  );
  const [stored] = await rows(db, "SELECT created_at FROM orders WHERE id=?", [
    o.id,
  ]);
  expect(stored.created_at).toBe("2026-01-15 12:00:00.123");
  const result = await clockTrading.basket(randomUUID(), now, [p.id]);
  expect(result.fills.length).toBe(1);
});
it("serves the dashboard and scopes authorized browser baskets", async () => {
  const a = await account("1000.00"),
    b = await account("1000.00"),
    c = await account("1000.00");
  const api = app(t);
  await request(api).get("/").expect("Content-Type", /html/).expect(200);
  await request(api).get("/app-config").expect(200);
  await buy(a.user.id, a.p.id, 3);
  await buy(b.user.id, b.p.id, 2);
  const outside = await buy(c.user.id, c.p.id, 1);
  const members = [
    { portfolio: a.p.id, token: a.user.token },
    { portfolio: b.p.id, token: b.user.token },
  ];
  await request(api)
    .post("/baskets")
    .set("Authorization", "Bearer " + a.user.token)
    .send({
      key: randomUUID(),
      cutoff: new Date().toISOString(),
      members: [members[0], { portfolio: c.p.id, token: b.user.token }],
    })
    .expect(404);
  const result = await request(api)
    .post("/baskets")
    .set("Authorization", "Bearer " + a.user.token)
    .send({ key: randomUUID(), cutoff: new Date().toISOString(), members })
    .expect(200);
  expect(result.body.groups["AAPL:BUY"].quantity).toBe(5);
  expect(
    (await t.activity(c.user.id, c.p.id)).orders.find(
      (o: any) => o.id === outside.id,
    ).status,
  ).toBe("PENDING");
});

describe("Full requirement audit", () => {
  it("rejects missing/non-object bodies and malformed basket participants", async () => {
    const { user, p } = await account(),
      api = app(t);
    await request(api).post("/users").expect(422);
    await request(api).post("/users").send([]).expect(400);
    await request(api)
      .post("/baskets")
      .set("Authorization", "Bearer " + user.token)
      .send({ members: [null] })
      .expect(422);
    await request(api)
      .post("/baskets")
      .set("Authorization", "Bearer " + user.token)
      .send({
        members: [{ token: user.token, portfolio: p.id }],
        cutoff: new Date().toISOString(),
      })
      .expect(422);
    expect((await t.inspect(user.id, p.id)).cash).toBe("100.00");
  });
  for (const h of [1, 2, 5])
    it(`runs horizon ${h}: 20-company analysis, proposals, explanation, evaluation and replay over HTTP`, async () => {
      const { user, p } = await account("100000.00"),
        api = app(t);
      const auth = "Bearer " + user.token;
      {
        const r = await request(api)
          .post(`/portfolios/${p.id}/recommendations`)
          .set("Authorization", auth)
          .send({
            symbols: SYMBOLS,
            cutoff: "2025-10-16",
            horizon: h,
            riskYears: h === 5 ? 20 : h,
          })
          .expect(201);
        expect(r.body.weights.length).toBe(20);
        expect(
          r.body.weights.reduce((a: number, b: number) => a + b, 0),
        ).toBeCloseTo(1, 7);
        expect(
          r.body.weights.every((w: number) => w >= 0 && w <= 0.20000001),
        ).toBeTrue();
        expect(r.body.risk.proposed).toBeLessThanOrEqual(
          r.body.risk.equalWeight + 1e-8,
        );
        expect(r.body.horizon).toBe(h);
        const base = `/portfolios/${p.id}/recommendations/${r.body.id}`;
        await request(api).get(base).set("Authorization", auth).expect(200);
        const proposal = await request(api)
          .post(base + "/proposal")
          .set("Authorization", auth)
          .send({})
          .expect(200);
        expect(proposal.body.legs.length).toBeGreaterThan(0);
        const explanation = await request(api)
          .post(base + "/explain")
          .set("Authorization", auth)
          .send({})
          .expect(200);
        expect(explanation.body.computed.horizon).toBe(h);
        expect(explanation.body.commentary).toBeTruthy();
        const evaluation = await request(api)
          .post(base + "/evaluate")
          .set("Authorization", auth)
          .send({ end: "2026-10-16" })
          .expect(200);
        expect(evaluation.body.executionDate > r.body.cutoff).toBeTrue();
        await request(api)
          .post("/market/AAPL/replay")
          .set("Authorization", auth)
          .send({ cutoff: "2026-10-16", horizon: h })
          .expect(200);
      }
      const saved = await request(api)
        .get(`/portfolios/${p.id}/recommendations`)
        .set("Authorization", auth)
        .expect(200);
      expect(saved.body.length).toBe(1);
    }, 120000);
  it("replays committed rebalance during a quote outage without duplicate execution", async () => {
    const { user, p } = await account();
    const legs = [{ symbol: "AAPL", side: "BUY" as const, quantity: 2 }];
    const first = await t.rebalance(user.id, p.id, legs, "retry");
    provider.mode = "missing";
    expect(await t.rebalance(user.id, p.id, legs, "retry")).toEqual(first);
    expect((await t.inspect(user.id, p.id)).cash).toBe("75.00");
    expect((await t.activity(user.id, p.id)).executions.length).toBe(1);
  });
  it("enforces the 20-position cap without preventing additions to an existing position", async () => {
    const { user, p } = await account("10000.00");
    await t.rebalance(
      user.id,
      p.id,
      SYMBOLS.map((symbol) => ({ symbol, side: "BUY" as const, quantity: 1 })),
      "twenty",
    );
    const extra = await t.submit(
      user.id,
      p.id,
      { symbol: "IBM", side: "BUY", quantity: 1 },
      "extra",
    );
    await expectAsync(
      t.execute(user.id, p.id, extra.id, "extra-exec"),
    ).toBeRejected();
    const existing = await buy(user.id, p.id, 1);
    await t.execute(user.id, p.id, existing.id, "existing");
    const state = await t.inspect(user.id, p.id);
    expect(state.holdings.filter((x: any) => x.quantity > 0).length).toBe(20);
    expect(state.cash).toBe("9737.50");
  });
  it("keeps opposing basket sides separate and reconciles money on retry", async () => {
    const a = await account(),
      b = await account();
    const initial = await buy(a.user.id, a.p.id, 2);
    await t.execute(a.user.id, a.p.id, initial.id, "initial");
    await t.submit(
      a.user.id,
      a.p.id,
      { symbol: "AAPL", side: "SELL", quantity: 2 },
      "sell",
    );
    await buy(b.user.id, b.p.id, 2);
    const key = randomUUID(),
      cutoff = new Date(),
      scope = [a.p.id, b.p.id];
    const batch = await t.basket(key, cutoff, scope);
    expect(batch.groups["AAPL:BUY"]).toEqual({ quantity: 2, amount: "25.00" });
    expect(batch.groups["AAPL:SELL"]).toEqual({ quantity: 2, amount: "25.00" });
    expect(await t.basket(key, cutoff, scope)).toEqual(batch);
    expect((await t.inspect(a.user.id, a.p.id)).cash).toBe("100.00");
    expect((await t.inspect(b.user.id, b.p.id)).cash).toBe("75.00");
  });
});
