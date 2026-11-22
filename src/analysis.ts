import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Trading } from "./trading.js";
import { rows } from "./db.js";
import { check, horizon, indicators } from "./domain.js";
import { CSV_SYMBOLS } from "./csv-market.js";

export function signalFor(indicator: ReturnType<typeof indicators>) {
  if (indicator.signal === "insufficient" || indicator.rsi === null) return "INSUFFICIENT_DATA";
  if (indicator.signal === "uptrend" && indicator.rsi < 70) return "CONSIDER_BUY";
  if (indicator.signal === "downtrend" || indicator.rsi >= 70) return "WAIT";
  return "HOLD";
}

/** Report #3: historical-price technical analysis, not automatic trading. */
export class Analysis {
  constructor(public trading: Trading) {}

  async recommend(user: string, id: string, symbols: string[], cutoff: string, h?: number) {
    check(Array.isArray(symbols) && symbols.length >= 1 && symbols.length <= 20 &&
      new Set(symbols).size === symbols.length && symbols.every(s => CSV_SYMBOLS.includes(s)),
      "Choose 1-20 distinct stocks from the historical CSV");
    check(z.iso.date().safeParse(cutoff).success && cutoff <= this.trading.now().toISOString().slice(0, 10),
      "Invalid or future cutoff");
    const portfolio = await this.trading.inspect(user, id);
    const selectedH = h ?? portfolio.horizon;
    horizon(selectedH);
    const details = [];
    for (const symbol of symbols) {
      const data = await this.trading.market.history(symbol, cutoff);
      const indicator = indicators(data.bars.map(b => b.close), selectedH);
      details.push({
        symbol,
        lastHistoricalPrice: data.bars.at(-1)?.close ?? null,
        lastHistoricalDate: data.bars.at(-1)?.date ?? null,
        indicators: indicator,
        suggestion: signalFor(indicator),
        source: data.provider,
        warnings: data.warnings,
      });
    }
    const payload = {
      portfolio: id, cutoff, horizon: selectedH,
      createdAt: this.trading.now().toISOString(),
      method: "SMA trend and 14-day RSI; an uptrend below RSI 70 suggests considering a buy. No orders are placed automatically.",
      details,
    };
    const recommendationId = randomUUID();
    await this.trading.db.execute(
      "INSERT INTO recommendations(id,portfolio_id,cutoff,payload) VALUES(?,?,?,?)",
      [recommendationId, id, cutoff, JSON.stringify(payload)],
    );
    return { id: recommendationId, ...payload };
  }

  async get(user: string, portfolioId: string, recommendationId: string) {
    await this.trading.inspect(user, portfolioId);
    const [record] = await rows(this.trading.db,
      "SELECT * FROM recommendations WHERE id=? AND portfolio_id=?", [recommendationId, portfolioId]);
    check(record, "Recommendation not found", 404);
    return record;
  }
}
