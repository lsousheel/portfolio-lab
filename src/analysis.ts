import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Trading } from "./trading.js";
import { rows, transaction } from "./db.js";
import {
  align,
  check,
  covariance,
  horizon,
  indicators,
  metrics,
  optimize,
  proposal,
  replay,
  risk,
} from "./domain.js";
import { Agent, History, LocalAgent, NewsProvider } from "./providers.js";
export class Analysis {
  constructor(
    public trading: Trading,
    public agent: Agent = new LocalAgent(),
    public news?: NewsProvider,
  ) {}
  async history(symbol: string, cutoff: string): Promise<History> {
    check(
      z.iso.date().safeParse(cutoff).success &&
        cutoff <= this.trading.now().toISOString().slice(0, 10),
      "Invalid or future cutoff",
    );
    const history = await this.trading.market.history(symbol, cutoff);
    await transaction(this.trading.db, async (connection) => {
      for (let i = 0; i < history.bars.length; i += 5000) {
        const chunk = history.bars.slice(i, i + 5000);
        const values = chunk.map((b) => [
          symbol,
          b.date,
          b.close,
          history.provider,
          history.retrievedAt.slice(0, 23).replace("T", " "),
          history.currency,
          history.adjustmentStatus,
        ]);
        await connection.query(
          "INSERT INTO prices(symbol,observed_date,adjusted_close,provider,retrieved_at,currency,adjustment_status) VALUES ? ON DUPLICATE KEY UPDATE adjusted_close=VALUES(adjusted_close),retrieved_at=VALUES(retrieved_at)",
          [values],
        );
      }
    });
    return history;
  }
  async recommend(
    user: string,
    id: string,
    symbols: string[],
    cutoff: string,
    h?: number,
    riskYears?: number,
  ) {
    check(
      Array.isArray(symbols) &&
        symbols.length >= 5 &&
        symbols.length <= 20 &&
        new Set(symbols).size === symbols.length,
      "Choose 5-20 distinct symbols",
    );
    const p = await this.trading.inspect(user, id);
    const selectedH = h ?? p.horizon,
      cfg = horizon(selectedH);
    const histories = [];
    for (const symbol of symbols)
      histories.push(await this.history(symbol, cutoff));
    const lookbackStart = new Date(cutoff + "T00:00:00Z");
    const riskWindow = riskYears ?? selectedH;
    check([1, 2, 5, 10, 20].includes(riskWindow), "Invalid risk lookback");
    lookbackStart.setUTCFullYear(lookbackStart.getUTCFullYear() - riskWindow);
    const aligned = align(
      histories.map((h) =>
        h.bars.filter(
          (b) => b.date >= lookbackStart.toISOString().slice(0, 10),
        ),
      ),
    );
    const cov = covariance(aligned.prices),
      optimized = optimize(cov, 0.2),
      equal = symbols.map(() => 1 / symbols.length);
    const holdings = Object.fromEntries(
      p.holdings.map((x: any) => [x.symbol, x.quantity]),
    );
    check(
      Object.keys(holdings).every(
        (s) => symbols.includes(s) || holdings[s] === 0,
      ),
      "Universe must include held stocks",
    );
    const last = aligned.prices.map((s) => s.at(-1)!);
    const currentValue =
      last.reduce((s, x, i) => s + x * (holdings[symbols[i]] || 0), 0) +
      Number(p.cash);
    const current = last.map((x, i) =>
      currentValue ? (x * (holdings[symbols[i]] || 0)) / currentValue : 0,
    );
    const details = histories.map((history) => ({
      symbol: history.symbol,
      coverage: history.coverage,
      provider: history.provider,
      warnings: history.warnings,
      indicators: indicators(
        history.bars.map((b) => b.close),
        selectedH,
      ),
      intervals: [1, 2, 5, 10, 20].map((years) => {
        const start = new Date(cutoff + "T00:00:00Z");
        start.setUTCFullYear(start.getUTCFullYear() - years);
        const part = history.bars.filter(
          (b) => b.date >= start.toISOString().slice(0, 10),
        );
        return {
          years,
          from: part[0]?.date,
          to: part.at(-1)?.date,
          observations: part.length,
          fullCoverage:
            history.coverage.from <= start.toISOString().slice(0, 10),
          metrics: part.length >= 3 ? metrics(part.map((b) => b.close)) : null,
        };
      }),
    }));
    const correlations = cov.map((r, i) =>
      r.map((x, j) =>
        cov[i][i] > 0 && cov[j][j] > 0
          ? x / Math.sqrt(cov[i][i] * cov[j][j])
          : null,
      ),
    );
    const payload = {
      portfolio: id,
      horizon: selectedH,
      cutoff,
      createdAt: this.trading.now().toISOString(),
      symbols,
      details,
      strategy:
        "Constrained minimum variance; SMA trend and RSI context. Review target allocation on schedule, no automatic trades.",
      frequency: cfg.frequency,
      reviewDays: cfg.reviewDays,
      lookbackYears: riskWindow,
      weights: optimized.weights,
      optimization: optimized,
      risk: {
        current: risk(current, cov),
        equalWeight: risk(equal, cov),
        proposed: risk(optimized.weights, cov),
        covariance: cov,
        correlations,
        observations: aligned.dates.length,
        from: aligned.dates[0],
        to: aligned.dates.at(-1),
      },
      limitations: [
        "Risk estimate is historical, not guaranteed reduction",
        "Current risk includes zero-risk cash; proposal invests in equities and may increase risk",
        "SMA replay is a diagnostic strategy, distinct from the covariance allocation recommendation",
        "Adjusted series are not point-in-time corporate-action snapshots",
      ],
      allocationChanges: symbols.map((symbol, i) => ({
        symbol,
        currentWeight: current[i],
        targetWeight: optimized.weights[i],
      })),
    };
    const recommendationId = randomUUID();
    await this.trading.db.execute(
      "INSERT INTO recommendations(id,portfolio_id,cutoff,payload) VALUES(?,?,?,?)",
      [recommendationId, id, cutoff, JSON.stringify(payload)],
    );
    return { id: recommendationId, ...payload };
  }
  async get(user: string, pid: string, rid: string) {
    await this.trading.inspect(user, pid);
    const [r] = await rows(
      this.trading.db,
      "SELECT * FROM recommendations WHERE id=? AND portfolio_id=?",
      [rid, pid],
    );
    check(r, "Recommendation not found", 404);
    return r;
  }
  async propose(user: string, pid: string, rid: string) {
    const r = await this.get(user, pid, rid),
      p = await this.trading.inspect(user, pid),
      quotes: Record<string, string> = {};
    for (const symbol of r.payload.symbols)
      quotes[symbol] = (await this.trading.quote(symbol)).price;
    return {
      recommendation: rid,
      quoteTime: this.trading.now().toISOString(),
      ...proposal(
        r.payload.symbols,
        r.payload.weights,
        quotes,
        Object.fromEntries(p.holdings.map((x: any) => [x.symbol, x.quantity])),
        p.cash,
      ),
    };
  }
  async explain(user: string, pid: string, rid: string) {
    const r = await this.get(user, pid, rid);
    const news = this.news ? await this.news.news(r.payload.symbols[0]) : [];
    return {
      computed: r.payload,
      news,
      commentary: await this.agent.explain(r.payload, news),
    };
  }
  async evaluate(user: string, pid: string, rid: string, end: string) {
    const r = await this.get(user, pid, rid);
    check(end > r.cutoff, "Evaluation must be later than recommendation");
    const series = [];
    for (const symbol of r.payload.symbols) {
      const h = await this.history(symbol, end);
      series.push(h.bars.filter((b) => b.date > r.cutoff && b.date <= end));
    }
    const shared = align(series),
      weights: number[] = r.payload.weights,
      n = weights.length;
    const base = shared.prices.map((x) => x[0]);
    const value = (w: number[]) =>
      shared.dates.map((_, t) =>
        w.reduce((s, x, i) => s + (x * shared.prices[i][t]) / base[i], 0),
      );
    const existing: number[] = r.payload.allocationChanges.map(
        (a: any) => a.currentWeight,
      ),
      cashWeight = 1 - existing.reduce((s, x) => s + x, 0);
    const existingValue = value(existing).map((x) => x + cashWeight);
    const result = {
      recommendation: rid,
      cutoff: r.cutoff,
      executionDate: shared.dates[0],
      end: shared.dates.at(-1),
      observations: shared.dates.length,
      strategy: metrics(value(weights), 1),
      equalWeight: metrics(value(Array(n).fill(1 / n)), 1),
      existingBuyHold: metrics(existingValue, 0),
      feesBps: 0,
      slippageBps: 0,
      label:
        r.payload.createdAt.slice(0, 10) > r.cutoff
          ? "historical forward-workflow replay"
          : "forward observation evaluation",
      assumptions:
        "Fractional normalized analytical allocation, first subsequent adjusted close, static buy-and-hold weights; no simulator executions or fees. Not realized P&L.",
    };
    await this.trading.db.execute(
      "INSERT INTO evaluations(id,recommendation_id,end_date,payload) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)",
      [randomUUID(), rid, end, JSON.stringify(result)],
    );
    return result;
  }
  async replay(symbol: string, cutoff: string, h: number) {
    const history = await this.history(symbol, cutoff);
    return replay(history.bars, h);
  }
}
