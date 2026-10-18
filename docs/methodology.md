# Quantitative and execution methodology

## Dates, providers, and data quality

A recommendation cutoff is a UTC calendar date no later than the current date. Daily histories contain observations on provider-supplied trading days; missing dates are not filled, holidays are not manufactured, identical duplicate observations are collapsed, conflicting duplicates are rejected, and records are ordered by date. The offline fixture starts in 2006, omits weekends, and explicitly does **not** model exchange holidays, IPO dates, or actual company prices. The live adapter keeps only the available observations in the requested 20-year interval. Coverage, provider, retrieval time, currency, and adjustment status are stored or returned. A shorter available history is not treated as 20 complete years.

History uses adjusted closes, separate from raw execution quotes. The Alpha Vantage adapter is limited to the configured USD equity universe (20 demo names plus IBM) because GLOBAL_QUOTE does not independently establish instrument currency. Expansion requires instrument/currency verification. Adjusted data may reflect splits/dividends known after a historical decision; this is a stated limitation of retrospective analysis, not a point-in-time research dataset. Held-share corporate-action processing is outside the simulator. Never use this as a production account ledger.

The database stores market observations by symbol/date/provider. Refresh may revise prices, while recommendation inputs/results remain stored in immutable JSON payloads; there is no claim that the whole raw historical data vintage is preserved. Future prices are excluded from calculation, but corporate-action revision bias and selecting today's surviving company universe remain limitations.

## Indicators and intervals

For positive prices P[t], simple return r[t] = P[t]/P[t-1] - 1. SMA(n) is the arithmetic mean of the last n observations. The fast/slow windows are 20/100 for a 1-year horizon, 50/100 for 2 years, and 50/200 for 5 years. Uptrend means fast > slow, downtrend means fast < slow. A crossover compares those relations with the previous observation. Warm-up values are null, never fabricated zeros.

RSI uses **simple mean** gains and losses over the latest 14 changes (not Wilder's recursive smoothing): 100 - 100/(1 + meanGain/meanLoss). No losses gives 100; no gains gives 0; no change gives neutral 50. At least 15 prices are needed. This choice is explicit to make manual testing easy.

Reports include trailing 1-, 2-, 5-, 10-, and 20-year interval statistics where available, with actual counts and a fullCoverage flag. Future investment horizon and historical risk window are separate inputs: `riskYears` supports 1/2/5/10/20, defaulting to the horizon. Review intervals are 21, 63, and 126 observations (monthly, quarterly, semiannual). The covariance allocation is the primary portfolio proposal; SMA/RSI contextualize it. SMA timing replay is a separate diagnostic strategy and is not mislabeled a backtest of the optimizer.

Sample variance divides squared deviations by N-1. Annual volatility = sqrt(252 * sample variance). Sharpe uses mean daily return / sample standard deviation * sqrt(252), assuming zero risk-free return; zero/insufficient variance gives null. Total return = last equity/first equity - 1. Drawdown is the minimum equity/running peak - 1 (negative or zero). Turnover is cumulative absolute changes in exposure, counting one full purchase as 1; no terminal liquidation is assumed.

252 is an observation-based daily approximation. Alignment can leave gaps; no claim is made of calendar-time volatility correction for a sparsely observed stock. Coverage and observation counts must be reviewed, particularly for sparse live history.

## Coupled portfolio allocation

The engine intersects dates across all selected series, then computes returns from **aligned prices**, avoiding mismatched return intervals. At least 61 shared prices are required. Sample covariance C[i,j] = sum((r_i - mean_i)*(r_j - mean_j))/(N-1). Correlation is covariance divided by component standard deviations, null when either variance is zero.

Minimize w' (C + 1e-8 I) w, subject to sum(w)=1, 0<=w_i<=0.20. This gives at least five represented assets when feasible. Projected gradient descent begins at equal weights. The step is 1/(2 * max absolute row sum of regularized C). Projection onto the capped simplex solves the Lagrange threshold by 100 bisection steps. Maximum coordinate change below 1e-9 is convergence; 20,000 iterations is a hard limit. Returned weights must sum to 1 within 1e-7. Infeasible concentration and nonconvergence are errors. Ridge regularization handles singular and constant-return inputs.

Risk comparisons use unregularized C over the identical window: sqrt(252*w'Cw). Existing portfolio weights include cash, treated as zero-return/zero-risk; thus moving an all-cash account to equities normally increases measured risk. Equal-weight baseline is fully invested. The engine never promises lower risk than the existing account. Money uses Decimal; statistical computations use JavaScript floating-point numbers and are reported as estimates.

For proposals, equity is fresh-quote cash plus positions. Target whole shares are floor(equity*weight/quote). Deltas yield buy/sell legs; sells are ordered first. Per-leg amounts use decimal half-up cent rounding. Residual cash is reported and must be nonnegative. Rounding can shift realized weights; the 20% cap constrains continuous target weights, not a guarantee on post-rounding weights including cash. Users approve explicit legs; execution revalidates current state and quotes. One rebalance transaction commits every leg or none.

## Orders, concurrency, and baskets

Quotes must be positive raw USD observations no older than five minutes and not in the future. Delayed daily quotes are rejected for execution. Whole shares only, maximum 1,000,000 per leg, and maximum 20 positive positions per portfolio. Monetary columns are DECIMAL, returned as strings. The ledger uses cents; raw quote prices carry four decimals.

State transitions: PENDING -> FILLED, CANCELLED, or REJECTED (batch business rejection). Direct execution errors leave the order PENDING for explicit correction/cancellation; no cash/holding/execution updates commit. No automatic partial fills: the simulator fills the complete order or rejects it. This is the defined partial-fill policy, not an unfinished partial-fill engine.

A transaction locks the portfolio before its order and holdings changes. A successful command stores its result under a per-portfolio request key. Identical retries return that result; a different payload under the same key is a conflict. Concurrent orders serialize on portfolio rows. A unique execution-per-order constraint is a second protection against double fills. Infrastructure failures roll back. Deadlock/lock-timeout failures are surfaced without automatic retries; callers may safely retry their idempotency key.

Basket aggregation window is all pending orders created on or before the operator-supplied fixed UTC cutoff. Batch keys are global and reusable only with the identical cutoff. A simulator mutex serializes batches. Portfolio locks are taken in sorted ID order, then orders rechecked under lock. Pricing is one quote per symbol for the batch; opposite sides stay separate. Within the eligible set, creation time then persistent ID supplies deterministic FIFO processing. Full fills at common prices avoid scarcity allocation favoritism; liquidity is modeled as unlimited. No user can finance another user. Business rejection rolls back that order to a savepoint and records its reason; infrastructure failure rolls back the entire batch.

Aggregate group quantities and amounts are **sums of per-order allocations**, not a separately rounded aggregate notional. For subcent quote prices this means aggregate amount can differ by a cent from rounding total quantity*price once; the policy deliberately reconciles exactly to user ledgers. No hidden residual pennies are transferred. The batch JSON preserves aggregate groups, executions retain order links, and basket_allocations preserve all quantities and cents. Pending cancellation racing with a fill has one locked outcome.

## Chronological and forward evaluation

Technical replay computes the signal through close T, executes at close T+1, and earns returns only after that execution. A 10-basis-point one-way combined transaction/slippage cost applies to exposure changes. Buy-and-hold pays the same entry cost. Neither pays a terminal liquidation cost. Changing later prices cannot change earlier decisions; this is tested.

Recorded allocation evaluation uses the first common observation **strictly after** the recommendation cutoff as entry and requires 61 subsequent common observations. It follows fixed normalized fractional allocations (not actual integer-share fills) through the end date. It reports strategy, equal-weight, and existing-portfolio buy-and-hold metrics using zero costs/slippage for all three. This isolates allocation comparison, while the separate replay demonstrates a cost-aware timing strategy. Static weights refer to initial allocations; share exposures drift with prices. Existing baseline uses the portfolio snapshot at recommendation creation, not a reconstructed historical account.

Record created after its cutoff: label historical forward-workflow replay. Record created before later data: label forward observation evaluation. Both are hypothetical analytical P&L; neither establishes actual live trading performance. The CLI can be invoked periodically as new observations arrive. Costs, model, entry date, and observation count accompany every evaluation.

The database explicitly sets every session to UTC; MySQL driver's serialization timezone alone is insufficient for timestamp comparisons. A regression checks both the session and order exclusion after a past batch cutoff.
