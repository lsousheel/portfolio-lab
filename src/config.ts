import { pool } from "./db.js";
import { Trading } from "./trading.js";
import { Analysis } from "./analysis.js";
import { CsvMarket } from "./csv-market.js";
import { Finnhub } from "./finnhub.js";

// Builds the services the app uses: historical prices come from the CSV file,
// current prices come from Finnhub, everything is stored in MySQL.
export function services() {
  const finnhub = new Finnhub(process.env.FINNHUB_API_KEY || "");
  const db = pool();
  const market = new CsvMarket((symbol) => finnhub.quote(symbol));
  const trading = new Trading(db, market);
  if (process.env.EXECUTION_MODE === "demo-last-quote")
    trading.executionMode = "demo-last-quote";
  const analysis = new Analysis(trading);
  return { db, trading, analysis, finnhub };
}
