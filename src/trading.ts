import { Pool, PoolConnection } from "mysql2/promise";
import { randomUUID, randomBytes } from "node:crypto";
import { Decimal } from "decimal.js";
import { DB, hash, rows, transaction } from "./db.js";
import { check, DomainError, horizon, Leg, money, symbolOK } from "./domain.js";
import { MarketProvider, Quote } from "./providers.js";
const stamp = (s: string) =>
  new Date(s).toISOString().slice(0, 23).replace("T", " ");
export class Trading {
  constructor(
    public db: Pool,
    public market: MarketProvider,
    public now: () => Date = () => new Date(),
    public fault?: () => void,
  ) {}
  async user(name: string) {
    check(
      typeof name === "string" && name.trim().length > 0 && name.length <= 80,
      "Invalid name",
    );
    const id = randomUUID(),
      token = randomBytes(32).toString("hex");
    await this.db.execute(
      "INSERT INTO users(id,name,token_hash) VALUES(?,?,?)",
      [id, name, hash(token)],
    );
    return { id, name, token };
  }
  async authenticate(token: string) {
    const u = await rows(
      this.db,
      "SELECT id,name FROM users WHERE token_hash=?",
      [hash(token)],
    );
    check(u.length, "Authentication required", 401);
    return u[0];
  }
  async portfolio(user: string, h: number) {
    horizon(h);
    const id = randomUUID();
    await this.db.execute(
      "INSERT INTO portfolios(id,user_id,horizon) VALUES(?,?,?)",
      [id, user, h],
    );
    return { id, user_id: user, horizon: h, cash: "0.00" };
  }
  async inspect(user: string, id: string, db: DB = this.db, lock = false) {
    const p = await rows(
      db,
      "SELECT * FROM portfolios WHERE id=? AND user_id=?" +
        (lock ? " FOR UPDATE" : ""),
      [id, user],
    );
    check(p.length, "Portfolio not found", 404);
    const holdings = await rows(
      db,
      "SELECT symbol,quantity FROM holdings WHERE portfolio_id=? ORDER BY symbol",
      [id],
    );
    return { ...p[0], holdings };
  }
  async command<T>(
    user: string,
    id: string,
    key: string,
    input: unknown,
    fn: (c: PoolConnection, p: any) => Promise<T>,
  ) {
    check(
      typeof key === "string" && key.length > 0 && key.length <= 100,
      "Idempotency-Key required",
    );
    return transaction(this.db, async (c) => {
      const p = await this.inspect(user, id, c, true),
        fingerprint = hash(JSON.stringify(input));
      const prior = await rows(
        c,
        "SELECT fingerprint,result FROM commands WHERE portfolio_id=? AND request_key=?",
        [id, key],
      );
      if (prior.length) {
        check(
          prior[0].fingerprint === fingerprint,
          "Idempotency conflict",
          409,
        );
        return prior[0].result as T;
      }
      const result = await fn(c, p);
      await c.execute(
        "INSERT INTO commands(portfolio_id,request_key,fingerprint,result) VALUES(?,?,?,?)",
        [id, key, fingerprint, JSON.stringify(result)],
      );
      return result;
    });
  }
  async fund(user: string, id: string, amount: string, key: string) {
    check(
      typeof amount === "string" &&
        /^\d{1,9}(\.\d{1,2})?$/.test(amount) &&
        new Decimal(amount).gt(0),
      "Invalid funding amount",
    );
    return this.command(
      user,
      id,
      key,
      { action: "fund", amount },
      async (c, p) => {
        const cash = money(p.cash).plus(amount);
        await c.execute("UPDATE portfolios SET cash=? WHERE id=?", [
          cash.toFixed(2),
          id,
        ]);
        return { cash: cash.toFixed(2) };
      },
    );
  }
  validateLeg(leg: Leg) {
    check(
      leg &&
        symbolOK(leg.symbol) &&
        ["BUY", "SELL"].includes(leg.side) &&
        Number.isSafeInteger(leg.quantity) &&
        leg.quantity > 0 &&
        leg.quantity <= 1000000,
      "Invalid order",
    );
  }
  async submit(user: string, id: string, leg: Leg, key: string) {
    this.validateLeg(leg);
    return this.command(
      user,
      id,
      key,
      { action: "order", ...leg },
      async (c) => {
        const orderId = randomUUID();
        await c.execute(
          "INSERT INTO orders(id,portfolio_id,symbol,side,quantity,status,created_at) VALUES(?,?,?,?,?,?,?)",
          [
            orderId,
            id,
            leg.symbol,
            leg.side,
            leg.quantity,
            "PENDING",
            stamp(this.now().toISOString()),
          ],
        );
        return { id: orderId, status: "PENDING" };
      },
    );
  }
  async cancel(user: string, id: string, orderId: string) {
    return transaction(this.db, async (c) => {
      await this.inspect(user, id, c, true);
      const order = await rows(
        c,
        "SELECT * FROM orders WHERE id=? AND portfolio_id=? FOR UPDATE",
        [orderId, id],
      );
      check(order.length, "Order not found", 404);
      if (order[0].status === "CANCELLED") return order[0];
      check(
        order[0].status === "PENDING",
        "Order is no longer cancellable",
        409,
      );
      await c.execute("UPDATE orders SET status='CANCELLED' WHERE id=?", [
        orderId,
      ]);
      return { id: orderId, status: "CANCELLED" };
    });
  }
  validateQuote(q: Quote) {
    const age = this.now().getTime() - new Date(q.observedAt).getTime();
    check(
      Number.isFinite(age) && age >= 0 && age <= 300000,
      "Stale or future quote",
    );
    check(
      q.currency === "USD" &&
        q.adjustmentStatus === "raw" &&
        new Decimal(q.price).isFinite() &&
        new Decimal(q.price).gt(0),
      "Invalid execution quote",
    );
  }
  async quote(symbol: string) {
    const q = await this.market.quote(symbol);
    check(q.symbol === symbol, "Quote symbol mismatch");
    this.validateQuote(q);
    await this.db.execute(
      "INSERT INTO quotes VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE price=VALUES(price),observed_at=VALUES(observed_at),retrieved_at=VALUES(retrieved_at),provider=VALUES(provider),currency=VALUES(currency),adjustment_status=VALUES(adjustment_status)",
      [
        q.symbol,
        q.price,
        stamp(q.observedAt),
        stamp(q.retrievedAt),
        q.provider,
        q.currency,
        q.adjustmentStatus,
      ],
    );
    return q;
  }
  async fill(
    c: PoolConnection,
    p: any,
    o: any,
    q: Quote,
    batch: string | null = null,
  ) {
    this.validateQuote(q);
    const amount = money(new Decimal(q.price).times(o.quantity)),
      hold = await rows(
        c,
        "SELECT quantity FROM holdings WHERE portfolio_id=? AND symbol=?",
        [p.id, o.symbol],
      ),
      old = hold[0]?.quantity || 0;
    const cash = money(p.cash).plus(
        o.side === "BUY" ? amount.negated() : amount,
      ),
      quantity = old + (o.side === "BUY" ? o.quantity : -o.quantity);
    check(cash.gte(0), "Insufficient funds");
    check(quantity >= 0, "Insufficient holdings");
    if (old === 0 && quantity > 0) {
      const count = await rows(
        c,
        "SELECT COUNT(*) n FROM holdings WHERE portfolio_id=? AND quantity>0",
        [p.id],
      );
      check(count[0].n < 20, "Maximum 20 held companies");
    }
    await c.execute("UPDATE portfolios SET cash=? WHERE id=?", [
      cash.toFixed(2),
      p.id,
    ]);
    this.fault?.();
    await c.execute(
      "INSERT INTO holdings VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)",
      [p.id, o.symbol, quantity],
    );
    await c.execute("UPDATE orders SET status='FILLED' WHERE id=?", [o.id]);
    await c.execute(
      "INSERT INTO executions(id,order_id,batch_id,quantity,price,amount,observed_at) VALUES(?,?,?,?,?,?,?)",
      [
        randomUUID(),
        o.id,
        batch,
        o.quantity,
        q.price,
        amount.toFixed(2),
        stamp(q.observedAt),
      ],
    );
    p.cash = cash.toFixed(2);
    return {
      orderId: o.id,
      symbol: o.symbol,
      side: o.side,
      quantity: o.quantity,
      price: q.price,
      amount: amount.toFixed(2),
      cash: p.cash,
    };
  }
  async cached(user: string, id: string, key: string, input: unknown) {
    await this.inspect(user, id);
    const [prior] = await rows(
      this.db,
      "SELECT fingerprint,result FROM commands WHERE portfolio_id=? AND request_key=?",
      [id, key],
    );
    if (prior) {
      check(
        prior.fingerprint === hash(JSON.stringify(input)),
        "Idempotency conflict",
        409,
      );
      return prior.result;
    }
    return undefined;
  }
  async execute(user: string, id: string, orderId: string, key: string) {
    const prior = await this.cached(user, id, key, {
      action: "execute",
      orderId,
    });
    if (prior !== undefined) return prior;
    const o = await rows(
      this.db,
      "SELECT symbol FROM orders WHERE id=? AND portfolio_id=?",
      [orderId, id],
    );
    check(o.length, "Order not found", 404);
    await this.inspect(user, id);
    const q = await this.quote(o[0].symbol);
    return this.command(
      user,
      id,
      key,
      { action: "execute", orderId },
      async (c, p) => {
        const [order] = await rows(
          c,
          "SELECT * FROM orders WHERE id=? AND portfolio_id=? FOR UPDATE",
          [orderId, id],
        );
        if (order.status === "FILLED") {
          const [e] = await rows(
            c,
            "SELECT * FROM executions WHERE order_id=?",
            [orderId],
          );
          return e;
        }
        check(order.status === "PENDING", "Order not pending", 409);
        return this.fill(c, p, order, q);
      },
    );
  }
  async rebalance(user: string, id: string, legs: Leg[], key: string) {
    const prior = await this.cached(user, id, key, {
      action: "rebalance",
      legs,
    });
    if (prior !== undefined) return prior;
    check(
      Array.isArray(legs) && legs.length > 0 && legs.length <= 40,
      "1-40 legs required",
    );
    legs.forEach((l) => this.validateLeg(l));
    check(
      new Set(legs.map((l) => l.symbol)).size === legs.length,
      "Duplicate symbol in rebalance",
    );
    await this.inspect(user, id);
    const quotes: Record<string, Quote> = {};
    for (const l of legs) quotes[l.symbol] = await this.quote(l.symbol);
    return this.command(
      user,
      id,
      key,
      { action: "rebalance", legs },
      async (c, p) => {
        const fills = [];
        for (const leg of [...legs].sort((a, b) =>
          a.side === b.side ? 0 : a.side === "SELL" ? -1 : 1,
        )) {
          const order = { ...leg, id: randomUUID() };
          await c.execute(
            "INSERT INTO orders(id,portfolio_id,symbol,side,quantity,status) VALUES(?,?,?,?,?,?)",
            [order.id, id, leg.symbol, leg.side, leg.quantity, "PENDING"],
          );
          fills.push(await this.fill(c, p, order, quotes[leg.symbol]));
        }
        return { fills, cash: p.cash };
      },
    );
  }
  async basket(key: string, cutoff: Date = this.now(), scope?: string[]) {
    if (scope)
      check(scope.length > 0 && scope.length <= 20, "Invalid basket scope");
    const scoped = scope ? [...new Set(scope)].sort() : null;
    check(
      typeof key === "string" && key.length > 0 && key.length <= 100,
      "Invalid batch key",
    );
    check(
      Number.isFinite(cutoff.getTime()) && cutoff <= this.now(),
      "Invalid cutoff",
    );
    return transaction(this.db, async (c) => {
      await rows(c, "SELECT id FROM simulator_lock WHERE id=1 FOR UPDATE");
      const previous = await rows(
        c,
        "SELECT cutoff,result FROM batches WHERE id=?",
        [key],
      );
      if (previous.length) {
        check(
          JSON.stringify(previous[0].result.scope ?? null) ===
            JSON.stringify(scoped),
          "Batch scope conflict",
          409,
        );
        check(
          stamp(previous[0].cutoff + "Z") === stamp(cutoff.toISOString()),
          "Batch key cutoff conflict",
          409,
        );
        return previous[0].result;
      }
      const candidates = await rows(
        c,
        "SELECT * FROM orders WHERE status='PENDING' AND created_at<=?" +
          (scoped
            ? ` AND portfolio_id IN (${scoped.map(() => "?").join(",")})`
            : "") +
          " ORDER BY created_at,id",
        [stamp(cutoff.toISOString()), ...(scoped || [])],
      );
      check(candidates.length <= 1000, "Batch exceeds 1000 orders");
      const portfolios = new Map<string, any>();
      for (const id of [
        ...new Set(candidates.map((o) => o.portfolio_id)),
      ].sort()) {
        const [p] = await rows(
          c,
          "SELECT * FROM portfolios WHERE id=? FOR UPDATE",
          [id],
        );
        portfolios.set(id, p);
      }
      const quotes = new Map<string, Quote | Error>();
      for (const symbol of [...new Set(candidates.map((o) => o.symbol))]) {
        try {
          quotes.set(symbol, await this.quote(symbol));
        } catch (e) {
          quotes.set(symbol, e as Error);
        }
      }
      await c.execute("INSERT INTO batches(id,cutoff,result) VALUES(?,?,?)", [
        key,
        stamp(cutoff.toISOString()),
        "{}",
      ]);
      const fills: any[] = [],
        rejected: any[] = [];
      for (const candidate of candidates) {
        const [o] = await rows(
          c,
          "SELECT * FROM orders WHERE id=? FOR UPDATE",
          [candidate.id],
        );
        if (o.status !== "PENDING") continue;
        await c.query("SAVEPOINT order_fill");
        const p = portfolios.get(o.portfolio_id),
          oldCash = p.cash;
        try {
          const q = quotes.get(o.symbol)!;
          if (q instanceof Error) throw q;
          const fill = await this.fill(c, p, o, q, key);
          await c.execute(
            "INSERT INTO basket_allocations VALUES(?,?,?,?,?,?)",
            [key, o.id, o.symbol, o.side, o.quantity, fill.amount],
          );
          fills.push(fill);
        } catch (e) {
          await c.query("ROLLBACK TO SAVEPOINT order_fill");
          p.cash = oldCash;
          if (!(e instanceof DomainError)) throw e;
          await c.execute(
            "UPDATE orders SET status='REJECTED',reason=? WHERE id=?",
            [e.message, o.id],
          );
          rejected.push({ orderId: o.id, reason: e.message });
        }
      }
      const groups: Record<string, { quantity: number; amount: string }> = {};
      for (const f of fills) {
        const k = f.symbol + ":" + f.side;
        const old = groups[k] || { quantity: 0, amount: "0.00" };
        groups[k] = {
          quantity: old.quantity + f.quantity,
          amount: money(old.amount).plus(f.amount).toFixed(2),
        };
      }
      const result = {
        scope: scoped,
        id: key,
        cutoff: cutoff.toISOString(),
        fills,
        rejected,
        groups,
        policy:
          "full fill, FIFO, separate symbol/side groups; zero fees; no netting",
      };
      await c.execute("UPDATE batches SET result=? WHERE id=?", [
        JSON.stringify(result),
        key,
      ]);
      return result;
    });
  }
  async activity(user: string, id: string) {
    await this.inspect(user, id);
    return {
      orders: await rows(
        this.db,
        "SELECT * FROM orders WHERE portfolio_id=? ORDER BY created_at,id",
        [id],
      ),
      executions: await rows(
        this.db,
        "SELECT e.* FROM executions e JOIN orders o ON e.order_id=o.id WHERE o.portfolio_id=? ORDER BY e.executed_at",
        [id],
      ),
    };
  }
}
