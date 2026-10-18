# Design to implementation

| Concept / relationship | Code | Persistent records | Design fidelity |
|---|---|---|---|
| Stock and dated information | providers.ts, Analysis.history | prices, quotes | adjusted analysis vs raw execution separation |
| Portfolio with owner/cash/holdings/horizon | Trading.portfolio/inspect/fund | users, portfolios, holdings | whole shares, max 20 positions, isolated balances |
| Strategy and recommendation | domain.ts, Analysis.recommend | recommendations | indicators and covariance support inspectable advice |
| Order, fill, cancellation | Trading.submit/execute/cancel/fill | orders, executions, commands | PENDING transitions; cash and shares change together |
| Coordinated basket | Trading.rebalance/basket | batches, basket_allocations, executions | atomic portfolio rebalance; multi-user aggregation separately modeled |
| Subsequent performance | replay, Analysis.evaluate | evaluations | strict post-cutoff entry and labeled replay |
| Implementation services (not financial concepts) | api.ts, db.ts, config.ts | migrations, simulator_lock | no extra user-facing concepts |

Actual mismatch found during implementation review: the conceptual design promised safe retry after a committed trade, but initial `execute` fetched a new quote before consulting the saved command. If the provider failed later, the completed result was inaccessible even though it was stored. The revised path checks the owned portfolio and cached command first, validates the fingerprint, and returns that committed result without market access. Regression test switches the provider to failure after the first fill. This is a real mismatch and resolution, not a hypothetical instructor hint.

A deliberate refinement separates the investment horizon from an optional `riskYears` window; the initial implementation used the horizon for both. The default remains the horizon, while a user can independently select 1/2/5/10/20 years for risk estimation. This makes the conceptual distinction explicit in the API.

Financial basket trading ordinarily concerns several securities, whereas the assignment also asks to aggregate users buying the same stock. The implementation therefore exposes a single-portfolio atomic rebalance and a separate multi-user operator batch. Both preserve an order-level audit trail. This avoids treating shared execution as shared money.

The optimizer proposal is not claimed to be the same strategy as the SMA timing replay. Recorded allocation evaluation measures the optimizer weights; replay measures SMA timing. Both are labeled, and this distinction is documented rather than hidden behind one performance number.
