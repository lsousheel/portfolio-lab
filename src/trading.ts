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
    public executionMode: "strict" | "demo-last-quote" = "strict",
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
  /** Every execution in a portfolio, oldest first. Used to work out what each position cost. */
  async fills(user: string, id: string) {
    await this.inspect(user, id);
    return rows(
      this.db,
      "SELECT o.symbol, o.side, e.quantity, CAST(e.price AS CHAR) AS price FROM executions e JOIN orders o ON o.id=e.order_id WHERE o.portfolio_id=? ORDER BY e.executed_at, e.id",
      [id],
    ) as Promise<{ symbol: string; side: "BUY" | "SELL"; quantity: number; price: string }[]>;
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
    const demo =
      this.executionMode === "demo-last-quote" && q.provider === "finnhub";
    const maxAge = demo ? 7 * 86400000 : 300000;
    check(
      Number.isFinite(age) && age >= 0 && age <= maxAge,
      demo
        ? "Demo quote must be no older than seven days and not in the future"
        : "Stale or future quote",
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
      "INSERT INTO executions(id,order_id,quantity,price,amount,observed_at,execution_mode,quote_provider) VALUES(?,?,?,?,?,?,?,?)",
      [
        randomUUID(),
        o.id,
        o.quantity,
        q.price,
        amount.toFixed(2),
        stamp(q.observedAt),
        this.executionMode,
        q.provider,
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
