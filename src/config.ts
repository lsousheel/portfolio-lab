import { pool } from "./db.js";
import { Trading } from "./trading.js";
import { Analysis } from "./analysis.js";
import { CsvMarket } from "./csv-market.js";
import { Finnhub } from "./finnhub.js";
import {
  AlphaVantage,
  OfflineProvider,
  AlphaNews,
  HttpAgent,
  LocalAgent,
} from "./providers.js";
export function services() {
  const finnhub = new Finnhub(process.env.FINNHUB_API_KEY || "");
  const db = pool(),
    live = process.env.MARKET_PROVIDER === "alpha",
    market = live
      ? new AlphaVantage(process.env.ALPHA_VANTAGE_KEY || "")
      : process.env.MARKET_PROVIDER === "csv"
        ? new CsvMarket((symbol) => finnhub.quote(symbol))
        : new OfflineProvider();
  const trading = new Trading(db, market);
  if (process.env.EXECUTION_MODE === "demo-last-quote")
    trading.executionMode = "demo-last-quote";
  const agent = process.env.AI_URL
    ? new HttpAgent(process.env.AI_URL, process.env.AI_KEY || "")
    : new LocalAgent();
  const analysis = new Analysis(
    trading,
    agent,
    live ? new AlphaNews(market as AlphaVantage) : undefined,
  );
  return { db, trading, analysis, finnhub };
}
