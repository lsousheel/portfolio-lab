import { pool } from "./db.js";
import { Trading } from "./trading.js";
import { Analysis } from "./analysis.js";
import {
  AlphaVantage,
  OfflineProvider,
  AlphaNews,
  HttpAgent,
  LocalAgent,
} from "./providers.js";
export function services() {
  const db = pool(),
    live = process.env.MARKET_PROVIDER === "alpha",
    market = live
      ? new AlphaVantage(process.env.ALPHA_VANTAGE_KEY || "")
      : new OfflineProvider();
  const trading = new Trading(db, market);
  const agent = process.env.AI_URL
    ? new HttpAgent(process.env.AI_URL, process.env.AI_KEY || "")
    : new LocalAgent();
  const analysis = new Analysis(
    trading,
    agent,
    live ? new AlphaNews(market as AlphaVantage) : undefined,
  );
  return { db, trading, analysis };
}
