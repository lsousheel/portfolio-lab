# Implementation and testing report

Date: October 18, 2026. This document is an engineering delivery record, **not Report #1** and not a fabricated Report #2 submission.

## Delivered

A complete local academic backend with Express/TypeScript, MySQL 8.4 migrations, Decimal money, synthetic and Alpha Vantage provider adapters, optional news/AI interfaces, stored recommendations, covariance optimization, whole-share coordinated trading, multi-user full-fill basket aggregation, historical replay and forward evaluation. OpenAPI, request examples, Compose, native setup, lockfile, console demonstration, test suite, traceability, and actual development evidence accompany it.

The separate conceptual PDF is seven pages; all pages were rendered with Poppler and visually inspected. Its editable source is `docs/build_report.py` (Python/reportlab). Rebuild from the project root with a Python environment containing reportlab: `python docs/build_report.py`. This is optional for running the backend. The assignment and initiating prompt are preserved under evidence.

## Executed checks

| Check | Result / evidence |
|---|---|
| npm ci | Passed; 158 audited packages, 0 reported vulnerabilities at run time; transitive glob deprecation warning retained in evidence/install.txt |
| npm run typecheck | Passed; evidence/typecheck.txt |
| npm run build | Passed; evidence/build.txt and build in final Jasmine run |
| npm run migrate | Applied on real MySQL 8.4.11; repeated invocation passed checksum validation; evidence/migrate.txt |
| npm run seed | Loaded labeled deterministic histories for all 20 symbols; evidence/seed.txt |
| npm test | **35 specs, 0 failures**, 14.21 seconds in final run; evidence/tests-final.txt |
| npm run test:unit | Domain/provider-only suite; evidence/unit-tests.txt |
| npm run demo | Completed all required console stages; evidence/demo-final.txt |
| node scripts/restart-smoke.mjs | Actual API process stopped and restarted; authenticated balance remained 123.45; evidence/restart-smoke.txt |
| npm run evaluate -- 2026-10-16 | Forward-workflow worker run against stored historical recommendations; evidence/forward-worker.txt |
| Report PDF | 7 pages; all rendered pages visually checked for clipping and layout; evidence/artifact-validation.txt |

The first suite failed one assertion (MySQL count string versus number); its output remains in evidence/tests-first.txt. Subsequent fixes and regressions are documented in development-log.md, including a defect found after an initially passing suite. Tests use a dedicated database whose name ends in `_test`, with no network calls and no SQLite substitution.

## AI contributions and human-review needs

| Activity | Actual AI contribution | Extra checking / human review still needed |
|---|---|---|
| Requirements | Read all PDF pages; separated mandatory features, optional basket enhancement and pasted additions | Check course-specific expectations against missing lecture slides |
| Design | Chose concepts, relationships, assumptions and rendered the report | Add real team/member names; approve financial scope |
| Code generation | Created the backend, migrations, providers, CLI, packaging | Review authentication scope, deployment needs and licensed data rights before use beyond a local exercise |
| Test generation | Created Jasmine examples, invariants, integration/API and persistence checks | Independently verify selected calculations; AI-generated tests are not independent proof |
| Debugging | Fixed type/output-path issues, count expectation, retry behavior, benchmark costs and UTC session mismatch | Review saved patches and reproduce tests; no invented human debugging effort is claimed |

More verification work was needed around financial timing, database transactions and benchmark fairness than around syntax. This describes observed agent work; no measurement of human effort is available because no human implementation review occurred in this session.

## Boundaries and externally unverified capabilities

* Docker is unavailable in the authoring environment. Compose/Dockerfile are provided, but container execution is not claimed. Native Node/MySQL installation, application and tests were executed successfully instead.
* No Alpha Vantage credential or paid-history entitlement was supplied. The real adapter, news adapter, configuration and live smoke command exist; live historical/quote/news calls were not verified. Daily delayed quotes intentionally fail execution freshness, so fresh live-priced simulation needs a suitable intraday adapter/license.
* No remote AI explanation service or credentials were supplied. The generic HTTPS agent contract and local deterministic explanation exist; a remote vendor LLM call was not made.
* Historical prices and demo results are synthetic. Actual future live performance cannot have been demonstrated here. The worker demonstrates a usable process, not real-world profitability.
* This simulator deliberately uses full fills, no liquidity model, no margin, no short selling, USD-only instruments and no held-share corporate-action ledger. Quantitative limitations, including adjusted-data vintage and survivorship bias, are explicit in methodology.md.
* Peer-review reports and Lecture #1 slides 13/17 were not supplied. Team/member names remain missing submission metadata. No peer evaluation or lecture content was fabricated.

## Reproduction and review

Run the native or Docker commands in README.md. To inspect development versions, use the local Git commits or clone the included `development-history.bundle` into a separate directory. The archive contains source and evidence, not node_modules, database binaries, credentials from external services, or the live MySQL data directory. `npm ci`, migrate, seed and demo rebuild the exercise.

Recommended final presentation cases: atomic rollback, idempotent replay during an outage, and UTC cutoff correction. Each has an actual observed issue or invariant, a saved baseline and a regression. The course's later hint process is documented without pretending a new hint was received.
