# Browser dashboard and presentation walkthrough

The frontend is in `public/index.html`, `public/style.css`, and `public/app.js`, served by Express. No additional framework, CDN, or build dependency is needed. The API is the authority for money, ownership and execution. Browser valuations are estimated displays, not ledger calculations.

## Start

Stop any older server with Ctrl+C, run `npm.cmd run build`, then `npm.cmd start`, and visit http://localhost:3000. If using containers, rebuild them. The screen's data badge identifies synthetic/offline or Alpha Vantage mode. Synthetic prices are never labeled live.

## A practical class presentation

1. Click **Set up a two-user demo**. It creates Alex and Jordan with separate portfolios and $100,000 virtual cash each. It does not buy shares. Explain that accounts and records are real database entries, but funds and prices are synthetic.
2. Click **Presentation mode**. The green panel provides a speaking note for each screen and a Next step button. **Explain the project** contains a longer six-part outline.
3. **Overview:** show cash, estimated portfolio value, number of held companies and investment horizon. The market chart is a selected stock's adjusted history, explicitly not the account's performance.
4. **Strategy lab:** keep the default historical cutoff so later observations exist. Explain the future horizon versus the past risk window. Select 5-20 companies and click Generate recommendation. Compare historical volatility for existing, equal-weight and proposed allocations. Show SMA, RSI and target weights. These signals describe history rather than guaranteeing returns.
5. Click **Preview coordinated trades**. Review whole-share legs and residual cash. Click **Approve & execute simulated trades** to execute the rebalance atomically. Return to Overview to show the resulting holdings. If any leg fails, none commits.
6. **Trade desk:** queue a small buy or sell, then execute or cancel its pending row. Show the execution ledger and changed cash. The insufficient-funds demonstration queues an unaffordable order, receives the rejection, and cancels the unfilled demo order; balances stay unchanged.
7. **Basket trading:** select Jordan, queue both investors' AAPL orders, then execute the authorized basket. This collects all pending orders in those two portfolios only. Show the grouped total and each person's allocation. Change identities through the top-right account control to inspect each portfolio independently.
8. **Performance:** evaluate the latest stored recommendation through today. The three cards compare proposed, equal-weight and original holdings, using the same dates and cost assumptions. This is a historical forward-workflow replay when the cutoff predates creation. The separate SMA replay is a different strategy with its own transaction cost assumptions.
9. Finish at **Explain the project**. Mention the lack of live verification, corporate-action vintage limits, and the fact that the optimizer can increase risk relative to an all-cash account.

## State and authorization

Account shortcuts and bearer tokens are stored in this browser's localStorage for local demonstration, not a production credential design. Portfolio state and recommendations persist in MySQL. New accounts start without portfolios; users can create portfolios and fund them through the UI. Existing API tokens can be connected in the account dialog. A browser restart keeps local shortcuts; another browser must connect its own token.

`GET /app-config` exposes only the symbol universe and mode. `GET /portfolios/:id/recommendations` returns only an owned portfolio's recommendations. `POST /baskets` validates every participant token and portfolio ownership, requires the caller to participate, and supplies an explicit portfolio scope to the batch transaction. It does not expose the admin token or execute unrelated users' orders. Batch idempotency also binds the scope.

The conceptual Report #1 remains a proposed server-side design. This frontend is a later, user-requested enhancement; it does not change the assignment's optional status for client-side work.

## Weekend presentation mode
Set EXECUTION_MODE=demo-last-quote in your local .env, run npm.cmd run build and npm.cmd run migrate, then restart npm.cmd start. Strict is the default in .env.example; it requires quotes within five minutes. Demo mode permits Finnhub quotes up to seven days old and retains their timestamps. It does not infer exchange opening hours. Both modes use virtual funds only.

In Trade desk, choose a company, BUY or SELL and whole shares; click Queue order, then Execute on its pending row. Pending means queued, not automatically scheduled. A successful fill updates cash and holdings together. The execution ledger records mode, original quote time and execution time. A failed validation leaves the order pending so it can be retried or cancelled.

Verified presentation account: BUY 2 MSFT at $529.05 using the 2026-10-16 20:00 UTC Finnhub observation. Starting cash $10,000.00, debit $1,058.10, remaining cash $8,941.90 and 2 MSFT shares. This is a hypothetical demo fill, not a live-market execution.

## Easier navigation and trading
Use Overview for the next recommended step, Investment plan for recommendations, Buy & sell for individual orders, Group trades for basket examples, and Performance for evaluation. Company selectors show names alongside symbols. The active account, portfolio selector and cash balance appear on every signed-in page.

Trading now has explicit steps: Save order for review, then Complete trade. Awaiting your approval means the user still needs to act. Saving alone does not spend money. Success and failure messages remain visible and can be dismissed. Company selection and classroom rejection demonstrations are expandable advanced options. Quote policy remains visible; full source/coverage details can be expanded. Keyboard users have a skip link and visible focus indicators; narrow layouts use larger targets and stacked forms.
