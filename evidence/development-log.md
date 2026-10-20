# Development log (actual session record)

2026-10-18: Initiating user message: "use this as refernece do a good job". User clarification: "use the promt i pasted". Full reference preserved in reference-request.txt. Assignment preserved as assignment.pdf. No lecture slides supplied.

Design baseline: seven-page conceptual report produced before backend code. All seven rendered pages inspected. Source references checked through browsing. No names fabricated.

Issue 1: PDF extraction raised UnicodeEncodeError under cp1252 for a bullet. Actual tool change: set PYTHONIOENCODING=utf-8 before rerunning pypdf extraction. All four pages then read. This was an agent-directed fix, not a new human prompt.

Environment: Node 22.19 available. MySQL Workbench client exists but no server/service found; Docker unavailable. Downloading official MySQL 8.4.11 portable ZIP into ignored .local for isolated database validation. Initial guessed 8.4.7 URL returned 404; official download page identified 8.4.11.

AI activity: requirements interpretation, design/report drafting, source checking, implementation and test generation by Codex in this chat. Tests are not independent human validation. Expected-value examples and invariants will be documented separately. No later instructor hints received.

## Implementation validation and actual fixes

Baseline `cf82639` preserves the first backend/test implementation. Baseline `d894c93` preserves the 34-test version before the UTC-session correction. These are local commits only; nothing was pushed.

### Type checking and output path
Observed: mysql2 rejected the helper's `unknown[]` parameter type. Agent action changed `args: unknown[]` to `args: (string|number|boolean|null)[]`, retaining parameterized execution. Verification: TypeScript build passed.

Observed: `npm run migrate` could not find `dist/src/cli.js` because TypeScript inferred `src` as the source root before tests were present. Agent action added `"rootDir":"."` to tsconfig. Verification: build and migration executed successfully. These issues were discovered during commands in this chat; no new user fix prompt was invented.

### COUNT assertion mismatch (first Jasmine run)
Observed: `Expected '1' to be 1` in stored-evaluation test. The safe-number database configuration returns COUNT as a string. Before: `expect(stored.n).toBe(1)`. After: `expect(Number(stored.n)).toBe(1)`. This is appropriate for the tiny count, not money. `evidence/tests-first.txt` preserves 29 specs / one failure. Later suite passed.

### Saved result unavailable during provider outage
Observed by code review, not the initial suite: execute fetched a quote before consulting the command cache. Before: `const q = await this.quote(symbol); return this.command(...)`. After: `const prior = await this.cached(user,id,key,{action:'execute',orderId}); if(prior!==undefined) return prior;` before provider access. Same change for rebalance. The regression first fills, switches provider to failure, and retries the same key; exact committed result must return. Initial code is in `cf82639`, fixed code in `d894c93`.

### Benchmark cost mismatch
Observed by review: SMA strategy paid 10 bps per change, but buy-and-hold benchmark paid no entry cost. Before: benchmark was the raw price vector. After: normalized benchmark starts at 1 and subsequent values multiply price/entryPrice by `(1-costBps/10000)`. New constant-price test expects -0.001 benchmark return and zero inactive-strategy return. No assertion was weakened to hide a loss.

### UTC cutoff mismatch
Observed during demo-log review: database `created_at` strings were local 10:35 while the application uses UTC 14:35. Driver `timezone:'Z'` controls serialization, not the database session. A past UTC basket cutoff could therefore wrongly include newer orders. Baseline `d894c93` was committed before the fix. After: each pool connection queues `SET time_zone = '+00:00'`. Regression checks the session and verifies a cutoff one minute before a new order excludes it. This was a real agent review discovery, not a later instructor hint.

### Other actual tooling issues
Prettier could not infer a SQL parser when invoked over the migration; TypeScript/JSON formatting succeeded. Subsequent formatter runs target supported files only. The SQL migration was applied successfully by MySQL. `evidence/format.txt` retains the formatter error; it was not a migration failure.

### Actual AI interaction evidence
The initiating pasted prompt is preserved verbatim. The user later said, "use the promt i pasted". Fixes above were agent-directed tool/code changes during this same interaction. No separate human prompt, human diagnosis, model transcript, or instructor hint has been invented. Local Git diffs and test outputs are the durable evidence available here; this log is a summary, not a verbatim reconstruction of internal reasoning.

### Future instructor-hint process
Before implementing a genuinely new hint: record its exact wording, date and source; commit or archive code/tests and capture current test output; add a failing regression with independently reasoned expected behavior; implement; rerun; record patch, command output and new commit. Existing insufficient-funds/missing-price/transaction requirements are already in the original assignment and must not be relabeled new hints.

Suggested demo cases: (1) cash-update rollback with retry; (2) provider outage after a committed trade; (3) UTC basket cutoff regression. Each has a concrete invariant and an executed test. Human reviewers should independently inspect the formulas, ownership/locking logic, and assumptions, rather than treating generated tests as a proof.

## Final validation

Final native MySQL suite: 35 Jasmine specs, 0 failures (14.21 s). Separate unit suite: 18 specs, 0 failures. Clean npm installation, typecheck, build, migrations, synthetic seed, complete demo, forward-evaluation worker, and real API process restart all executed successfully. Seven PDF pages visually inspected. Docker and credential-backed market/news/AI checks are explicitly unverified. No push, deployment or external message was performed.

Report revision requested in page-7 PDF annotation: replaced the AI-assistance section with a first-person account of the user's actual structured instructions and follow-up. Revised PDF remains seven pages; page 7 rendered and visually checked. Editable source and delivery archive updated.

## Frontend follow-up and basket timing fix

User requested a good frontend to understand and explain the project, and supplied the actual failing npm-test output. The supplied run showed two basket failures; a fresh run reproduced the infrastructure-rollback failure (evidence/frontend-test-baseline.txt). Clock diagnostics found MySQL-created order timestamps about 6 milliseconds ahead of the application's immediate batch cutoff (evidence/basket-clock-diagnosis.txt). Thus recently submitted orders could be excluded and the injected failure never reached. UTC timezone normalization did not eliminate this separate clock-source issue.

Fix: pending-order submission now explicitly sets created_at from the injected application clock, the same clock used for cutoff validation. A regression uses a fixed clock and asserts an exact-boundary order is included. The original rejection and rollback assertions remain intact. The expanded suite passed twice: 37 specs, 0 failures (evidence/frontend-tests.txt and frontend-tests-repeat.txt).

Added local browser dashboard with portfolio setup, analysis, coordinated proposals, orders, authorized two-user baskets, evaluations, and presentation guidance. Browser batch scope is authenticated for every portfolio and excludes unrelated pending orders. UI state is not treated as financial authority; the existing transaction services execute all operations. No remote publication performed.

Startup follow-up: an older node server occupied port 3000. Express 5 passed EADDRINUSE to the listen callback, which ignored the error and printed success before exit. Fixed the callback to report the error and exit nonzero. Reproduced port conflict with exit code 1, then replaced the verified old app process and confirmed dashboard HTTP 200 and app-config response on port 3000.

## Full requirement audit (18 October 2026)

The user's actual instruction was to check whether all requested things work and test them. The pre-change 37-spec suite passed (audit-tests-baseline.txt). Added HTTP journeys for every horizon and tests for invalid basket inputs, the 20-position limit, opposing basket groups, and rebalance retries during an outage. Discovered malformed participant and missing batch-key TypeErrors; explicit validation now returns 4xx responses. POST body normalization preserves existing bodyless commands. The CLI basket now includes only its own demo portfolios.

Expanded analysis testing exposed long-running database work and test timeouts (audit-tests-timeout*.txt). Historical persistence now uses one transaction per stock and larger bounded batches, avoiding partial history commits and reducing round trips. A single-history diagnostic measured about 2.6 seconds before and 1.9 seconds with the larger batches; these are individual observations, not a controlled benchmark or latency guarantee. Split the three-horizon aggregate test into separately asserted journeys retaining each 120-second deadline. Financial assertions and the existing 60-second chronology test remain unchanged. Final results are preserved separately rather than overwriting the failed evidence.

The complete console demo, migration rerun, frontend JavaScript syntax check, typecheck and real process-restart persistence smoke were executed. Browser verification exercised explanation, trend replay, stored allocation evaluation and presentation guidance; screenshot audit-dashboard.png captures evaluation evidence. See docs/audit-report.md for coverage and external limitations. No live provider verification or Docker execution is claimed.

Follow-up profiling by code inspection identified the dominant CPU issue: covariance recomputed both series means inside each observation pair, and variance likewise recomputed its mean for every observation. This made long-history statistics quadratic in observations. Both now compute unchanged means once before summation. Added an independently hand-derived covariance example: returns [1,0] and [0,1] have sample covariance matrix [[0.5,-0.5],[-0.5,0.5]]. The slow in-progress pre-fix run was stopped and its partial output preserved (audit-tests-interrupted.txt). This is the primary long-window performance fix; database batching alone was not sufficient.

Final audit result: 45 Jasmine specs, 0 failures, 101.744 seconds (audit-tests-verified.txt). Original chronology timeout was not increased. Final statistics diagnostic: covariance plus per-stock metrics across 20 stocks and 20 years took 64.552 ms excluding provider generation and database I/O. Final-code process restart persistence smoke passed. No external deployment.

## Finnhub follow-up

User requested one API provider for free/basic quotes and news, supplied Finnhub documentation, then explicitly asked to use its sample key in the project. Saved the supplied key only in ignored .env; no value is copied into this record. Added an authenticated informational /live/:symbol endpoint and an Overview panel, keeping synthetic historical analysis and simulated trading separate. No new external news is fed into historical recommendations. Five mocked tests cover header authentication, caching, timestamps, denied access, partial quota failure, missing configuration, invalid symbols and unsafe URLs. Full suite: 50 specs, 0 failures in 16.725 seconds. Live AAPL quote and eight headlines returned; closed-market timestamp was correctly labeled older in the browser. Captured evidence/finnhub-dashboard.png. No Docker use or publication.

## User-supplied CSV follow-up

User authorized replacing synthetic data with 20 supplied files. Copied originals unchanged to data/nasdaq, validated 50,260 closing observations and preserved file hashes. All files cover 2016-10-04 through 2026-10-02; this does not satisfy a full 20-year real-history dataset. Added CsvMarket, strict date/price parsing, cutoff filtering and source metadata. Adjustment status is explicitly unverified. Updated the displayed stock universe, source banner, chart labels, evaluation end date, persisted-recommendation selection and backend source compatibility guard. Old data and accounts remain stored.

CSV mode uses Finnhub quotes with their original timestamps for simulated execution; stale quotes remain rejected. It never substitutes historical closes for fresh prices. Added tests for all 20 files, a hand-checked AAPL first/last close, invalid records, cutoff and unavailable-symbol behavior, no historical quote fallback, and all-horizon recommendation/evaluation persistence against MySQL. Synthetic fixtures remain solely an explicit offline provider for tests/demos. Browser generated a CSV-backed recommendation. API key remains in ignored .env.

Final verification: 54 Jasmine specs, 0 failures in 45.568 seconds (csv-tests-final.txt); the earlier run also passed 54 specs. MySQL query confirmed 50,260 records, 20 distinct companies, and exact file coverage (csv-database-check.txt). Browser CSV recommendation showed 503 aligned observations for the two-year window, equal-weight historical volatility 14.34% and proposed 10.03%, without claiming future risk reduction. CSV screenshot saved. Native server remains running in CSV mode.

## Report delivery update, 18 October 2026
User requested the assignment report. Updated the seven-page conceptual Report #1 for the optional frontend, CSV history and explicit demo quote policy; retained the user's structured prompting account. Produced a separate six-page implementation/testing supplement with actual prompts, design mapping, defects, code excerpt, hand-derived expectations and verified trade screenshot. User then requested describing the project as 20; reports specify 20 companies and requested 20-year analysis while distinguishing the shorter observed data coverage. Both PDFs rendered and visually checked. References reopened. Sources and evidence included; team/member metadata and lecture slides remain missing.

## Lecture screenshots supplied, 18 October 2026
The user supplied screenshots of Lecture #1 slides 13 and 17. Report #1 now cites the reviewed slides, maps the minimal concepts to slide 13, and explicitly explains buy/sell/hold and portfolio cash as the simulated counterpart of the lecture's payment/deposit account example. Removed the now-obsolete missing-slide statement from both PDF sources. Full lecture deck was not reviewed. Report #1 remains seven pages; supplement remains six. All conceptual pages and the changed supplement page were rendered and visually checked. Screenshots preserved as lecture-1-slide-13.png and lecture-1-slide-17.png. This update changes documentation, not trading behavior.

## Report #1 rubric check
Checked the user's pasted Report #1 instructions against the PDF. Strengthened the rationale for state attributes and actions, linked it to sources and lecture slides, and emphasized conceptual scope with coding/testing reserved for later reports. Added docs/report-1-requirements-check.md with page mapping and the separate peer-evaluation dependency. Final PDF: seven pages, rendered and visually checked. Team/member names remain required. No peer reports were supplied and no peer review was invented.

## Usability update
User requested an interface easy for any user. Simplified navigation and company selectors, added contextual next-step guidance and account/portfolio/cash orientation, explained pending versus completed orders, added persistent confirmation/error feedback, and moved detailed source notices and advanced company/classroom controls into disclosures. Added keyboard skip navigation, aria-current, busy state, stronger secondary-text contrast, reduced-motion support and narrow-screen CSS. Browser checked Overview, planning disclosures, order submission and cancellation. A single AAPL SELL 1 test order was saved then cancelled; cash stayed $191.65 and no trade executed. Syntax check passed; existing build/Jasmine suite passed 56 specs, 0 failures in 27.28 seconds. No claim of a comprehensive accessibility audit or testing with representative users.

## Coverage, strategy and verification clarification
User requested verified 20-year wording, expanded AI/verification disclosure, a buy/sell/hold example and optimization assumptions. Updated Report #1 to eight pages: page 6 illustrates the SMA rule separately from target-weight trades and describes long-only/full-investment/20%-cap assumptions, historical covariance, sample minimum, regularization and omitted costs. Page 7 specifies planned up-to-20-year analysis versus validated 2016-10-04 through 2026-10-02 coverage (50,260 rows). Page 8 distinguishes student inputs, AI contributions, recorded automated checks and independent team review still needed. No unrecorded human verification claimed. Rendered and inspected all eight pages; updated source and rubric page mapping. No application changes.

## Vercel deployment preparation, 20 October 2026
User authorized publishing to Vercel. CLI whoami confirmed an existing signed-in account, with a CLI update-worker warning. Added a default-export Express entry point, Vercel configuration with CSV inclusion, deployment exclusions, and verified-certificate TLS options for hosted MySQL. Cloud environment guards reject missing settings, localhost and disabled TLS. No remote database credentials were supplied; the hosted MySQL choice is pending. No deployment or public URL is claimed. The entry point passed local health/config/home smoke checks; full suite output is in vercel-preparation-tests.txt. Local database and app remain in place.

## Hosted deployment completed, 20 October 2026
User supplied the Aiven connection and authorized using it. Retrieved its project CA from the console and verified an encrypted, certificate-validated MySQL connection. Applied both migrations without modifying local data. Created Vercel project portfolio-lab, stored runtime settings as secrets, and deployed to https://portfolio-lab-one.vercel.app. Public HTTP checks passed; a dedicated verification account successfully created a portfolio, deposited virtual funds, bought one AAPL share, read activity, generated an allocation over all 20 CSV stocks, evaluated later observations, and replayed AAPL history. Browser verified the live landing page. Evidence: vercel-live-smoke.txt. Aiven showed Developer tier with trial credits; this is not claimed to be a free plan. Credentials are excluded from source control.
