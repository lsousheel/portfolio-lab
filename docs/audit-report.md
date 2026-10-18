# Verification audit — 18 October 2026

Requested by the user: "can u check if all the asked thnsg working ropery test them all".

Scope: original pasted requirements in evidence/reference-request.txt, assignment traceability in docs/traceability.md, and the later explanatory frontend request. This is execution evidence, not a proof that every possible input or deployment is correct.

## Coverage

| Area | Checks |
|---|---|
| Financial calculations | Hand-derived SMA/RSI, returns/drawdown, money rounding, covariance allocation, singular/infeasible constraints, concentration, shared-date alignment |
| Trading | Exact balances, whole shares, funds/holdings rejection, stale/missing quotes, ownership, concurrent spending, cancellation race, injected rollback, retry conflicts and outage retries |
| Baskets | Two-user aggregation, cents/quantity reconciliation, separate opposing sides, excluded unrelated portfolios, unauthorized participation, cutoff boundary and rollback |
| Analysis | 1/2/5-year HTTP journeys, 20 stocks, 20-year risk window, weights summing to one, 20% cap, risk comparison, persisted recommendations, executable proposals, deterministic explanation |
| Evaluation | Strictly later observations, future-shock invariance, all-horizon replay, benchmark costs, stored evaluation results |
| Persistence | Dedicated native MySQL test database; separate-process reads; real server stop/restart retains authenticated account and 123.45 cash |
| Interface | Dashboard serving; existing browser walkthrough evidence in frontend-browser-checks.txt; this audit additionally exercised explanations, trend replay, allocation evaluation and presentation mode |
| Delivery | TypeScript compilation/typecheck, frontend syntax, migrations, console demo, archive integrity and seven-page report presence |

## Changes and observations

- Invalid basket participants (including null) and missing batch keys now produce validation responses instead of TypeErrors. Missing POST bodies normalize to an empty object, preserving bodyless proposal/explanation calls; array bodies are rejected.
- Console demonstration basket now explicitly scopes its three portfolios, so unrelated pending orders cannot be processed by running the demo.
- Historical persistence now groups bounded batches of up to 5,000 observations in one transaction per stock. This reduces round trips and prevents partially committed histories. It does not cache or substitute data, and no guaranteed latency improvement is claimed.
- The initial expanded test combined three lengthy end-to-end journeys under one 120-second deadline and timed out. A repeat also timed out during analysis. Raw failed runs are preserved. The combined test was split into independently asserted horizon journeys, each retaining the 120-second limit; no financial assertions were removed. Final outcome is in evidence/audit-tests-verified.txt.
- Browser evaluation displayed a 2025-10-17 entry, 261 subsequent observations through 2026-10-16, 3.54% proposed return and 3.24% equal-weight return on synthetic data. Trend replay returned its separate metrics. These are historical demonstrations, not real investment outcomes.

## Remaining external checks

Live Alpha Vantage prices/history, news and remote AI require credentials/access and were not tested live. Docker is unavailable here; the Compose setup is supplied but unexecuted. No claim of mobile or cross-browser coverage is made. Lecture slides, team submission metadata and peer reports remain unavailable. PDF visual inspection belongs to the earlier report verification; this audit checks the packaged report's page count and integrity.

## Reproduce

From the project folder with MySQL running: npm.cmd test; npm.cmd run typecheck; npm.cmd run migrate; npm.cmd run demo; node scripts/restart-smoke.mjs. Open http://localhost:3000 for the dashboard. Use the dedicated pf_test database for tests. The demo creates additional simulated accounts each run.


### Long-history performance correction

The dominant slowdown was repeated mean calculation inside covariance and variance summations, causing quadratic work in the number of observations. Means are now calculated once, with the financial formulas unchanged. An independent two-return example checks covariance exactly. The pre-fix long-window run was interrupted, recorded as incomplete, and replaced by a full rerun. Database batching alone did not resolve the issue.

## Final result

PASS: npm.cmd test completed with 45 specs, 0 failures in 101.744 seconds (evidence/audit-tests-verified.txt). Build, typecheck, migration rerun, frontend syntax, complete console demo and real server restart checks passed. Final server is running at http://localhost:3000. The original 60-second chronology deadline and per-horizon 120-second deadlines passed without increasing them. The credential-backed and Docker limitations above still apply.
