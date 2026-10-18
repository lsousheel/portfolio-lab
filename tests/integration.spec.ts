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
