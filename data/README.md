# Supplied historical prices

These 20 CSVs are unchanged copies of the user's supplied raw_nasdaq_downloads files. They contain Close/Last, Volume, Open, High and Low, with newest rows first. The importer uses Close/Last and sorts dates ascending. Each file has 2,513 distinct dates, 2016-10-04 through 2026-10-02. The dataset has 50,260 closing-price observations, not 20 years of history. Source authenticity and split/dividend adjustment methodology were not independently verified. Do not describe these as verified total-return adjusted prices. Original SHA-256 hashes and coverage checks are in evidence/csv-validation.json.

MARKET_PROVIDER=csv selects this dataset. Invalid/empty dates, nonpositive closes, unavailable symbols and conflicting duplicate dates are rejected. No synthetic rows are inserted to extend coverage. Rows after a requested cutoff are excluded; the cutoff day itself is included.

CSV closes are not execution quotes. CSV mode obtains current quotes from Finnhub, requiring FINNHUB_API_KEY. Orders still require observations within five minutes, so closed-market or old quotes are rejected. Previous synthetic recommendations remain stored but are hidden from the CSV view and cannot be evaluated or proposed as CSV recommendations. Existing accounts and holdings are preserved; portfolios holding companies outside this dataset need a separate portfolio or a deliberate reconciliation, not silent substitution.

The synthetic provider is retained for deterministic tests and the explicitly labeled canned console transaction demo. Run that demo in a separate PowerShell process with $env:MARKET_PROVIDER='offline'; npm.cmd run demo. It does not change .env or the running dashboard. Normal application history is CSV-backed.
