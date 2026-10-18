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
