import express, { Request, Response, NextFunction } from "express";
import { Trading } from "./trading.js";
import { rows } from "./db.js";
import { Analysis } from "./analysis.js";
import { DomainError, check } from "./domain.js";
import { CSV_SYMBOLS } from "./csv-market.js";
import path from "node:path";
import { Finnhub } from "./finnhub.js";
import { monitorPortfolio } from "./monitoring.js";
export function app(
  trading: Trading,
  analysis = new Analysis(trading),
  finnhub = new Finnhub(process.env.FINNHUB_API_KEY || ""),
) {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  app.use((req, _res, next) => {
    req.body ??= {};
    if (
      req.method === "POST" &&
      (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
    ) {
      return next(new DomainError("JSON object body required", 400));
    }
    next();
  });
  app.use(express.static(path.resolve("public")));
  app.get("/app-config", (_req, res) =>
    res.json({
      symbols: trading.market.symbols || CSV_SYMBOLS,
      sourceId: trading.market.sourceId,
      executionMode: trading.executionMode,
      executionNotice:
        trading.executionMode === "demo-last-quote"
          ? "DEMO EXECUTION: virtual trades use the last available Finnhub quote (up to 7 days old). These are hypothetical fills, not live-market executions. Original quote timestamps are preserved."
          : "STRICT EXECUTION: simulated trades require a quote no more than five minutes old.",
      historicalEnd: trading.market.sourceId ? "2026-10-02" : null,
      historyNotice: trading.market.sourceId
        ? "Historical CSV: 2016-10-04 to 2026-10-02. Adjustment method unverified; no 20-year coverage."
        : null,
      provider: "Historical CSV",
    }),
  );
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", mode: "simulated" }),
  );
  app.post("/users", async (req, res) => {
    res.status(201).json(await trading.user(req.body.name));
  });
  app.use(async (req, res, next) => {
    try {
      res.locals.user = (
        await trading.authenticate(
          (req.headers.authorization || "").replace(/^Bearer /, ""),
        )
      ).id;
      next();
    } catch (e) {
      next(e);
    }
  });
  const uid = (res: Response) => res.locals.user as string;
  const pid = (req: Request) => String(req.params.id);
  const key = (req: Request) => req.get("Idempotency-Key") || "";
  app.get("/live/:symbol", async (req, res) => {
    res.json(await finnhub.snapshot(String(req.params.symbol)));
  });
  app.get("/portfolios/:id/recommendations", async (req, res) => {
    await trading.inspect(uid(res), pid(req));
    res.json(
      await rows(
        trading.db,
        "SELECT id,cutoff,payload FROM recommendations WHERE portfolio_id=? ORDER BY created_at DESC",
        [pid(req)],
      ),
    );
  });
  // Current gains and losses for the stocks in a portfolio.
  app.get("/portfolios/:id/monitor", async (req, res) => {
    res.json(await monitorPortfolio(trading, uid(res), pid(req)));
  });
  app.get("/me", async (req, res) => {
    res.json(
      await trading.authenticate(
        (req.headers.authorization || "").replace(/^Bearer /, ""),
      ),
    );
  });
  app.get("/portfolios", async (_req, res) => {
    res.json(
      await rows(trading.db, "SELECT * FROM portfolios WHERE user_id=?", [
        uid(res),
      ]),
    );
  });
  app.post("/portfolios", async (req, res) => {
    res.status(201).json(await trading.portfolio(uid(res), req.body.horizon));
  });
  app.get("/portfolios/:id", async (req, res) => {
    res.json(await trading.inspect(uid(res), pid(req)));
  });
  app.post("/portfolios/:id/funds", async (req, res) => {
    res.json(await trading.fund(uid(res), pid(req), req.body.amount, key(req)));
  });
  app.get("/portfolios/:id/activity", async (req, res) => {
    res.json(await trading.activity(uid(res), pid(req)));
  });
  app.post("/portfolios/:id/orders", async (req, res) => {
    res
      .status(201)
      .json(await trading.submit(uid(res), pid(req), req.body, key(req)));
  });
  app.post("/portfolios/:id/orders/:order/cancel", async (req, res) => {
    res.json(
      await trading.cancel(uid(res), pid(req), String(req.params.order)),
    );
  });
  app.post("/portfolios/:id/orders/:order/execute", async (req, res) => {
    res.json(
      await trading.execute(
        uid(res),
        pid(req),
        String(req.params.order),
        key(req),
      ),
    );
  });
  app.post("/portfolios/:id/recommendations", async (req, res) => {
    res
      .status(201)
      .json(
        await analysis.recommend(
          uid(res),
          pid(req),
          req.body.symbols,
          req.body.cutoff,
          req.body.horizon,
        ),
      );
  });
  app.get("/portfolios/:id/recommendations/:rid", async (req, res) => {
    res.json(await analysis.get(uid(res), pid(req), String(req.params.rid)));
  });
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    res
      .status(
        err instanceof DomainError
          ? err.status
          : err instanceof SyntaxError
            ? 400
            : 500,
      )
      .json({
        error:
          err instanceof DomainError
            ? err.message
            : err instanceof SyntaxError
              ? "Invalid JSON"
              : "Internal error",
      });
  });
  return app;
}
