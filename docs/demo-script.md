# Short demonstration script (about 6-8 minutes)

1. Open Report #1 and explain the five concepts, especially the distinction between portfolio rebalance and multi-user order aggregation. Mention that Lecture #1 slides and team names still need human review.
2. Show `npm run migrate` and `npm test`. Point to the hand-derived cash and optimizer tests, then the injected rollback test. The suite uses actual MySQL, not an in-memory replacement.
3. Run `npm run demo`. State explicitly that prices and account funds are synthetic. Show recommendations for 1/2/5-year horizons and their review intervals. Compare current, equal-weight, and proposed historical risk without promising a risk reduction from an all-cash account.
4. Inspect the coordinated proposal and residual cash. Show atomic execution and the separate multi-user AAPL buy group: two owners, common price, independent cash, exact allocated sums. Opposing sells remain a different group.
5. Show the deliberate insufficient-funds error and unchanged balance. Explain no partial fills, no real brokerage and no cross-user financing.
6. Show chronological replay and the saved recommendation evaluation. Distinguish historical replay from genuinely later live observations; show signal/execution dates and cost assumptions.
7. Run `node scripts/restart-smoke.mjs` to stop/restart the API and read the persisted balance. Show one of the actual fixes from `evidence/development-log.md`, its Git baseline, and the regression test.
8. Close with current limits: live API entitlement/keys and optional AI endpoint not tested; Docker unavailable on this machine; corporate-action vintage and real execution realism are outside this academic simulator.
