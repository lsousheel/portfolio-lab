# Independent expected results and what passing tests mean

The same AI agent generated code and tests. These examples use small arithmetic/invariants independent of the algorithm's internal operations; they are not evidence of independent human review.

* SMA: last three of [1,2,3,4] are [2,3,4], sum 9 / 3 = 3. A one-item history cannot produce SMA(2).
* RSI: [10,11,10,11] gives +1,-1,+1. Mean gain 2/3, loss 1/3, ratio 2; RSI = 100 - 100/3 = 66.6667. Constant prices produce the explicitly chosen neutral 50.
* Return/drawdown: [100,120,90,108] ends 8% above 100. Worst decline is 90/120 - 1 = -25%, not -10% from initial capital.
* Money: 1.005 rounded half up to cents = 1.01. Three shares at 12.50 cost 37.50; 100 becomes 62.50. Binary floating-point addition is not used for the ledger.
* Minimum variance: independent equal-variance assets are symmetric, so each receives half. For variances 1 and 4, derivative of w^2 + 4(1-w)^2 is 10w-8, giving w=.8. The test checks this closed-form result against the iterative optimizer.
* Feasibility: two assets each capped at .2 can sum to at most .4, not 1. Reject rather than return a success-shaped allocation.
* Integer allocation: with 100 cash, half in a 12.50 stock buys 4 shares, half in a 30 stock buys 1; 20 cash remains.
* Concurrency: two 37.50 purchases cannot both succeed from 50. Exactly one fill must commit, leaving 12.50, regardless of arrival order.
* Rollback: injecting a failure after the cash SQL but before the holdings SQL must leave 100 cash, zero shares, and zero executions. A later retry succeeds once.
* Basket: user A's 3 shares cost 37.50; user B's 2 cost 25.00; aggregate is 5 shares/62.50. An unfunded third account cannot borrow either user's funds. SQL sums independently reconcile allocations.
* Causality: every recorded signal date precedes its execution; replacing only later prices must preserve the earlier audit decisions. Passing a return-value check alone would not establish this.

First suite: 29 specs, one assertion failure because MySQL COUNT was returned as string '1' under safe large-number settings. The assertion changed to `Number(stored.n)` for this small count, not a weakened financial assertion. Test run output is preserved.

Passing tests did not catch the original committed-retry/provider-outage issue; code review exposed it, and a new regression now covers it. Likewise an initial benchmark omitted the strategy's entry cost; review added the same 10-bps entry cost to buy-and-hold. These examples show why green tests do not prove correctness or economic validity.

Regression after 34 passing specs: demo timestamp review found a UTC/session mismatch not exercised by the original suite. A new test checks a batch cutoff one minute before order creation leaves that order pending. The fixed pool initializes every connection to UTC. This is another concrete example of passing tests failing to establish full logical correctness.
