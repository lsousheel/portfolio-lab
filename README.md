# Programming Finance - academic simulator

Report #1 is the separate seven-page conceptual-design PDF in `output/pdf/report-1-conceptual-design.pdf`. Editable source: `docs/build_report.py`. Add team/member names and review the missing Lecture #1 slides before submission. No later course-report format has been invented.

This is a Node 22 + TypeScript + Express + MySQL 8.4 backend. No frontend and no brokerage connection. The default provider generates deterministic **synthetic** histories for 20 company symbols. Those symbols do not make the generated data real. All funds and executions are simulated.

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
