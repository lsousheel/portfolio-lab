# Requirements traceability

Source: evidence/assignment.pdf (all 4 pages read). M = mandatory assignment requirement; O = assignment optional feature adopted; U = added by user's pasted instructions. Later Report #2 is mentioned in the assignment but its full submission requirements were not supplied.

| ID/type | Requirement | Design / implementation | Verification | Documentation |
|---|---|---|---|---|
| R01 M | Server side, console display; frontend optional | Express API; cli demo | API and demo | README, OpenAPI |
| R02 M | 1/2/5-year horizons | Portfolio horizon; domain.horizon | horizon and analysis specs | Report pp1,3; methodology |
| R03 M | Approximately 20 companies | 20-symbol fixture; max 20 held positions | 20-symbol recommendation; demo rebalance | Report pp1,4 |
| R04 M | Different historical intervals across last 20 years | MarketProvider; analysis.interval statistics | cutoff/fixture/normalization specs; seed | methodology |
| R05 M | Technical-analysis advice and frequency | SMA, RSI, crossover, statistics, review schedule | hand-derived SMA/RSI; replay audit | methodology, Report p6 |
| R06 M | Coupled investments optimized for risk | aligned covariance; capped-simplex optimizer; atomic rebalance | analytical optimizer; rollback/sell-buy tests | methodology, Report pp4-6 |
| R07 O/U | Multi-user basket trading | batch mutex; grouped full fills; ownership allocations | multi-user reconciliation; rollback; demo | methodology |
| R08 M/U | External prices, news, AI agents | AlphaVantage, AlphaNews, Agent/HttpAgent | offline contract tests; live not credential-verified | README live limitations |
| R09 M | Third-party historical provider | documented adjusted-history adapter | provider quota response test; live unverified | README |
| R10 M | Evaluate recommendations against later movements | stored recommendation; forward CLI; chronological replay | strict later dates; future-shock invariance | methodology, implementation report |
| R11 M | MySQL (not SQLite) | MySQL 8.4 migration, InnoDB transactions | actual local MySQL integration suite | README |
| R12 M | Jasmine tests and validation of AI tests | domain, provider, API, integration specs | executed suite; expected-value notes | evidence/test-expectations.md |
| R13 M | Actual AI problems, prompts, snippets, versions | original prompt; log; local Git baselines and patch | baseline commits and raw outputs | evidence/development-log.md |
| R14 M | Distinguish AI contributions by activity | actual activity matrix | human review still needed | implementation report |
| R15 M | Design-to-code mapping, mismatch/change example | domain/services separation; freshness/retry mismatch corrected | outage replay regression | design-to-code.md |
| R16 M | Preserve code before later instructor hints | baseline commits; documented future-hint process | no later hint received; no invented hint | development-log.md |
| R17 M | Report #1 purpose, queries, goals, use cases | separate conceptual design | all seven pages rendered/inspected | Report pp1,5 |
| R18 M | Minimal established concepts, 2-3 sentence definitions and links | five financial concepts | online sources opened/retrieved | Report pp2,7 |
| R19 M | Essential state/actions, necessity/sufficiency | compact table; explicit rationale | PDF visual inspection | Report pp2-3 |
| R20 M | Relationships and cross-concept action effects | diagram; cardinalities; transaction effects | PDF visual inspection | Report p4 |
| R21 M | Single PDF, 5-10 pages, conceptual only | seven-page PDF, editable Python source | pypdf count + Poppler rendering | output/pdf; docs/build_report.py |
| R22 M | Lecture #1 references | slides not supplied; no fabricated review | limitation stated | Report pp1,7 |
| R23 M | Peer evaluation | no peer reports supplied; not fabricated | not applicable until assignment | implementation report |
| R24 U | Maintainable TS/Express, lockfile, migrations, Docker | modules, package-lock, SQL, compose | npm ci/build; native migrations; Docker unexecuted | README |
| R25 U | Decimal money, parameterized SQL, integrity, ownership | Decimal; row locks; keys/FKs/checks | cash example; concurrent/rollback/API tests | methodology |
| R26 U | Up to 20 years, metadata, synthetic labeling, quotas | provider schema checks; coverage; timeout limits | offline/429/timeout/duplicate tests | methodology |
| R27 U | Cancellation, no double fill, quote freshness | explicit state machine; cached command results | cancel/fill race, stale/outage/retry tests | methodology |
| R28 U | Forward evaluation runnable without credentials | evaluate CLI; deterministic offline provider | stored evaluations and demo | README |
| R29 U | Persistence after restart | database state independent of app process | new pool and separate Node-process read; restart smoke | evidence |
| R30 U | Reproducible complete demo and verification | CLI, seed, native/Docker setup | build/migrate/test/demo outputs | implementation report |

Mandatory functionality is implemented; credential-backed live operation and Docker execution remain externally unverified. The optional independent second-conversation test-generation exploration was not performed, and no independent reviewer is claimed.

| R31 U | User-requested explanatory frontend | public/ dashboard, presentation tour, owned recommendation list and scoped basket route | real browser walkthrough; static and scoped-basket integration test | frontend-guide.md; frontend-browser-checks.txt |

## CSV data-source update

The active app now uses the user's 20 Nasdaq-format CSV files, including CSCO/GS/INTC. R03/R04/R05/R06/R10 are exercised against the supplied observations by tests/csv-market.spec.ts. The dataset has 50,260 observations and approximately 10 years of coverage; full 20-year real history remains missing. Adjustment method remains unverified and is labeled explicitly. Original files, hashes and validation evidence are bundled. Finnhub is used for current quotes/news; CSV closes are never passed off as fresh execution prices. The synthetic provider remains for deterministic tests and the explicit offline demo.
