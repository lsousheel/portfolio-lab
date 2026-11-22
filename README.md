# Portfolio Lab — Programming Finance, Report #3

This project performs **historical technical analysis**, records **virtual stock purchases at Finnhub quotes**, and **monitors gains, losses, winners, and losers**. No real trades occur.

## Requirements

- Node.js 22 or later, npm, MySQL 8, and a free Finnhub API key from https://finnhub.io
- Only two CSV files are part of the submission:
  - `data/historical-prices.csv`: the Report #2 history for 20 symbols (50,260 rows, 2016-10-04 through 2026-10-02).
  - `data/realtime/realtime-quotes.csv`: contains 20 stock-price records retrieved from Finnhub on November 22, 2026. The latest available quote timestamps are from November 20, 2026, because the market was closed on the retrieval date.

## Setup

1. Create the databases and user in MySQL (change the password):

```sql
CREATE DATABASE pf;
CREATE DATABASE pf_test;
CREATE USER 'pf'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON pf.* TO 'pf'@'localhost';
GRANT ALL PRIVILEGES ON pf_test.* TO 'pf'@'localhost';
```

2. Run `npm ci` and `cp .env.example .env` (Windows: copy the file manually).
3. Add your MySQL password and `FINNHUB_API_KEY` to `.env`.
4. Run `npm run build`, `npm run migrate`, and `npm start`.
5. Open http://localhost:3000.

## How to use

1. Create a practice account and portfolio, and add virtual cash.
2. Select one or more stocks. The app uses historical prices to calculate SMA and 14-day RSI, then marks each stock as `CONSIDER_BUY`, `WAIT`, or `HOLD`.
3. Submit a virtual buy or sell by specifying the symbol and number of shares. The price is retrieved from Finnhub when the order executes. This does **not** submit a real trade.
4. While the webpage is open, the gains/losses section automatically checks holdings approximately every minute (or on **Refresh current prices**). It reports cash, stock value, overall value, unrealized gain/loss, percentages, quote timestamps, winners, and losers. Missing prices are labeled unavailable; any displayed total is explicitly marked **partial**, and missing holdings are excluded rather than assigned invented values.

## Collect current prices into the required CSV

Run `npm run quotes -- 1 120` after the Finnhub API key is configured. It requests the 20 stocks with a delay between requests and appends genuine returned prices to `data/realtime/realtime-quotes.csv`. The `120` argument is a delay between rounds (only relevant for multiple rounds). Quotes may reflect the previous session when the market is closed.

## Jasmine tests

Run `npm run typecheck`, then `npm test`. The tests cover SMA/RSI signals, historical CSV parsing, Finnhub quote handling, portfolio valuation, and quote CSV logging. Tests also simulate price changes across monitoring checks, both a winner and a loser, and missing quotes. Database and live API behavior must be checked manually with a running MySQL instance and a configured API key. To see periodic monitoring from the terminal, run `npm run watch -- <portfolio-id> 60`.

## Limitations

The historical dataset ends on 2026-10-02; past returns do not guarantee future results. Finnhub free-tier quotes may be delayed or unavailable and are not continuous streaming. Virtual purchases use the current available quote only according to the configured execution mode. `demo-last-quote` permits a prior quote up to seven days old, which must be treated as a demonstration, **not** a live execution. This is an educational simulation, not investing advice.

## Quick demonstration checklist

1. With MySQL and Finnhub configured, run `npm run build`, `npm run migrate`, and `npm start`. Open http://localhost:3000.
2. Create a practice account, create a portfolio, and add virtual funds.
3. Analyze AAPL and MSFT; review the SMA, RSI, and recommendations.
4. During market hours, use `EXECUTION_MODE=strict` for genuinely recent quotes. When the market is closed, you may temporarily choose `EXECUTION_MODE=demo-last-quote` to demonstrate a hypothetical purchase using the last available session's quote (up to seven days old). Restart the server after changing `.env`.
5. Virtually buy a stock and review its quantity, buy price, latest quote, timestamp, and gain/loss. Use **Refresh current prices** or leave the page open for the one-minute refresh. On a closed market, a newly bought position will normally be FLAT because its quote has not changed.
6. Winners and losers appear as prices diverge from purchase cost; no made-up market records are included for demonstration. For reproducible examples that show both statuses and quote failures without requiring market movements, run `npm test`.
7. Only source code, Jasmine tests, README, and the two required CSVs are submitted. Keep `.env` with the API key/password private.
