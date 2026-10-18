# Programming Finance - academic simulator

Report #1 is the separate seven-page conceptual-design PDF in `output/pdf/report-1-conceptual-design.pdf`. Editable source: `docs/build_report.py`. Add team/member names and review the missing Lecture #1 slides before submission. No later course-report format has been invented.

This is a Node 22 + TypeScript + Express + MySQL 8.4 backend. Includes a local browser dashboard; no brokerage connection. The default provider generates deterministic **synthetic** histories for 20 company symbols. Those symbols do not make the generated data real. All funds and executions are simulated.

## Open the dashboard

If the old server is running, press **Ctrl+C** in that terminal first. Then:

```powershell
npm.cmd run build
npm.cmd start
```

Open **http://localhost:3000**. No separate frontend installation or build is required; Express serves `public/` from the same origin as the API. If using Docker, rebuild with `docker compose up --build -d`.

Click **Set up a two-user demo**, then **Presentation mode**. It walks through Overview, Strategy lab, Trade desk, Basket trading, Performance, and Explain the project. The on-screen notes provide talking points and define the finance terms. Both demo accounts get 100,000 virtual dollars; no shares are purchased automatically.

Use the account button at top right to switch identities or connect an existing token. Browser-local demo tokens are stored in localStorage; use only a trusted local browser. Database portfolios survive an app restart; clearing browser storage removes the local identity shortcuts, so retain your original API token if you need to reconnect. The command-line demo does not expose its tokens, so its automatically generated identities are separate from browser-created demo identities.

For a full demonstration, generate a recommendation with the default historical cutoff, preview and approve its coordinated trades, queue/execute a single order, then queue and execute a two-user basket. Performance compares the stored recommendation against later prices. See `docs/frontend-guide.md` for an exact walkthrough.

## Quick start with Docker

Requires Docker Compose. From this directory:

```sh
docker compose up --build -d
docker compose exec app npm run seed
docker compose exec app npm test
docker compose exec app npm run demo
```

The application automatically migrates its database on startup. API: http://localhost:3000. MySQL persists in the named volume. `docker compose down` preserves it. Do not delete the volume unless deliberately discarding your simulation. The supplied passwords are local demo values, not production credentials. Docker is not installed on the authoring machine; this route is supplied but not executed here.

## Native setup (verified on Windows, Node 22.19, MySQL 8.4.11)

Use an existing MySQL 8 server and create databases/users with `scripts/init-local.sql`, or use the optional isolated Windows script. It downloads official MySQL into ignored `.local` and binds only loopback port 3307:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local-mysql.ps1
# First initialization only, after the server has started:
Get-Content scripts/init-local.sql | & .local/mysql-8.4.11-winx64/bin/mysql.exe --host=127.0.0.1 --port=3307 --user=root
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd run migrate
npm.cmd run seed
npm.cmd test
npm.cmd run demo
npm.cmd start
```

On subsequent runs, start the same database without initializing it again; do not rerun the first-run SQL with an empty root password. If port 3307 is already in use by this project's database, do not start a second server. The SQL sets a local root password and a separate `pf` application user. To stop the isolated server, use `mysqladmin.exe --host=127.0.0.1 --port=3307 --user=root -p shutdown` from the same bin directory (password in `scripts/init-local.sql`). Scripts with paths containing spaces should be run from a workspace path without spaces or use an existing server.

On macOS/Linux, use `npm` instead of `npm.cmd`, configure `.env` for your MySQL instance, then run the same npm commands. Node 22 is the tested version. `package-lock.json` pins dependencies; `npm ci` reproduces installation. Do not migrate concurrently from multiple processes; migrations check checksums and use restart-safe `CREATE IF NOT EXISTS` statements.

## API and demonstration

`docs/openapi.json` describes all routes. `docs/requests.http` provides requests for a REST client. `POST /users` returns a random bearer token once; only its SHA-256 hash is stored. Save the token locally. Portfolio routes require that token and enforce ownership. `/admin/baskets` requires the separate `ADMIN_TOKEN`. Registration and authentication are intentionally local-demo mechanisms, without password recovery, TLS termination, rate limiting, or production identity management.

`npm run demo` creates distinct demo identities each time, loads labeled histories, generates recommendations for all horizons, proposes and executes a coordinated rebalance, aggregates same-side orders across users, keeps opposite sides separate, shows balances, demonstrates insufficient funds, and prints evaluation and chronological replay. It does not reset existing data. The output is intentionally verbose for instructor inspection. `npm run seed` loads only synthetic market series; it does not fabricate trades or users.

Tests use **pf_test**, require the database name to end in `_test`, and never use SQLite. Integration tests create isolated random identities, but cancel pending orders in the dedicated test database for controlled basket tests. Never point them at a shared user database. `npm run test:unit` runs domain/provider tests without needing a reachable MySQL server.

## Live market/news and optional AI

Alpha Vantage documentation was checked: https://www.alphavantage.co/documentation/. Set `ALPHA_VANTAGE_KEY` and `MARKET_PROVIDER=alpha`, restart, then run:

```sh
npm run live-smoke -- IBM
```

Full `TIME_SERIES_DAILY_ADJUSTED` history requires provider entitlement/premium access. The adapter requests full coverage then filters to the last 20 calendar years, retaining actual available coverage. `GLOBAL_QUOTE` can be daily/delayed; the adapter labels it accordingly and conservatively timestamps its trading day at UTC midnight. It is readable through the quote endpoint but will normally fail the simulator's five-minute freshness check. A separately licensed intraday quote adapter is needed for fresh live-priced simulation. No live capability has been verified without credentials; there is no silent fixture fallback.

`AlphaNews` uses the documented NEWS_SENTIMENT endpoint when live mode is enabled. Provider calls use a 5-second timeout and at most 3 attempts; 429/5xx and network timeouts are bounded. No network calls occur in automated tests. Requests are sequential to avoid burst concurrency, but provider quotas remain the user's responsibility.

Without an LLM key, deterministic commentary explains the result. Optional `AI_URL` must be HTTPS and accept `POST {instruction,computed,untrustedNews}` with bearer `AI_KEY`, returning `{text:string}`. This is a generic agent-service adapter, not a claim of a tested vendor LLM integration. No trade tools or broker credentials are provided to it. Commentary is labeled untrusted and returned separately; calculated results remain authoritative. External text is not executed.

## Forward evaluation

```sh
npm run evaluate -- 2026-10-16
```

The command evaluates stored recommendations with later observations, or prints why evaluation is pending/unavailable. At least 61 shared subsequent observations are required. Use a date no later than today. Rerunning upserts the same recommendation/end-date record. An actual recommendation created before subsequent market observations is labeled forward evaluation; replaying an old cutoff today is explicitly historical forward-workflow replay. There is no claim that future live performance has already been observed.

See `docs/methodology.md`, `docs/traceability.md`, `docs/design-to-code.md`, `evidence/development-log.md`, and `docs/implementation-report.md` for formulas, constraints, implementation mapping, actual fixes, verification, and limitations.

## Latest verification audit

See [the requirement audit](docs/audit-report.md) for tested workflows, fixes, raw test evidence, and remaining external checks.

## Finnhub live prices and news (one API key)

Set FINNHUB_API_KEY in your local .env and restart npm start. Keep MARKET_PROVIDER=offline for synthetic analysis and simulated execution. In Overview, scroll to Live prices & news, choose a stock, then click Load live prices & news. This authenticated informational panel uses Finnhub /quote and /company-news; it does not reprice synthetic portfolios or influence historical recommendations. No paid candle-history or streaming-news endpoint is called. Current company news is not presented as news available at a historical recommendation cutoff.

The server sends the key in X-Finnhub-Token; it never sends it to the browser. Quotes cache for 60 seconds; headlines cache for 15 minutes; concurrent identical requests share one call. A process-wide panel instance permits at most 20 outbound calls per minute. Requests time out after five seconds; quota errors are not retried. Both endpoint calls count separately toward the provider's allowance. The panel shows partial results and errors, and labels quotes older than five minutes. A weekend/closed-market reading can be genuine but old. Keys belong in ignored .env, not source or the ZIP. Docker is optional and the user-selected native setup is used.

Verified 18 October 2026: AAPL quote and eight headlines returned successfully; quote timestamp was the previous market close and was labeled older. Browser rendering verified. Full Jasmine suite: 50 specs, 0 failures (evidence/finnhub-full-tests.txt). These checks establish current access for this key, not permanent entitlement or unrestricted real-time coverage.

## Current data source: supplied CSV history

The active local configuration now uses MARKET_PROVIDER=csv. The 20 original user-supplied Nasdaq-format files are bundled in data/nasdaq and loaded into MySQL by npm.cmd run seed. Charts, indicators, risk analysis and evaluation use these closing prices. Coverage is 2016-10-04 to 2026-10-02 (2,513 observations each); requested 20-year windows report incomplete coverage rather than fabricating rows. Price adjustment method is unverified. See data/README.md and evidence/csv-validation.json.

The CSV universe includes CSCO, GS and INTC instead of META, V and MA. Finnhub supplies execution quotes and the live panel; strict mode requires five-minute freshness. Explicit EXECUTION_MODE=demo-last-quote permits hypothetical fills from Finnhub observations up to seven days old, including weekends. No old CSV close is stamped as a current price. Existing synthetic recommendations are retained in storage but excluded from the CSV view. Generate a new recommendation to use the supplied data. The historical evaluation date defaults to the file end, October 2, 2026.

Earlier sections describing synthetic analysis apply only to MARKET_PROVIDER=offline, which remains the deterministic test/canned-demo option. The guided two-user synthetic demo is intentionally unavailable in CSV mode; create/fund accounts normally. Docker is not required.
