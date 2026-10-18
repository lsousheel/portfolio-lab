"""Build Report #1 and a separate evidence-based implementation supplement."""
from pathlib import Path
Path("tmp/pdfs/report-review").mkdir(parents=True, exist_ok=True)
import build_report as b
from reportlab.platypus import Image, Preformatted
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from PIL import Image as PILImage
b.story=[]
b.styles['Body2'].fontSize=9.5
b.styles['Body2'].leading=12
b.styles['Body2'].spaceAfter=7
b.styles['Small2'].fontSize=8
b.styles['Small2'].leading=10
b.styles['Heading2'].fontSize=12
b.styles['Heading2'].leading=15
b.styles['Heading2'].spaceBefore=8
b.styles['Heading2'].spaceAfter=5
p,h,page,table=b.p,b.h,b.page,b.table
code_style=ParagraphStyle('CodeReport',fontName='Courier',fontSize=8,leading=11,spaceAfter=10,backColor=colors.HexColor('#eef3f5'),borderPadding=8)
def code(s): b.story.append(Preformatted(s,code_style))
page('Portfolio Lab<br/>Implementation and Testing')
p('<b>Programming Finance | October 18, 2026</b>')
p('Companion to the conceptual Report #1. This supplement addresses the assignment\'s general requirements for AI development records, design-to-code mapping, problems, and test validation. It does not claim to replace an as-yet unspecified Report #2 format. Team and member names must be supplied before submission.')
h('What the application does')
p('Portfolio Lab lets a user fund a virtual portfolio, select a 1-, 2-, or 5-year investment horizon, analyze 20 companies, review allocation suggestions, approve simulated trades, and evaluate recommendations against later historical observations. A browser dashboard explains each step; Express and TypeScript execute the rules, and MySQL persists the financial state. Jasmine tests check the implementation.')
h('Current delivery and evidence')
table([['Area','Current verified state'],['Companies and historical window','20 companies; requests intervals across a 20-year window. Supplied data: 50,260 observations, 2016-10-04 to 2026-10-02. Actual real-history coverage is about 10 years.'],['Market integration','Finnhub supplies quotes/news through the server. Historical analysis uses the supplied CSVs. Adjustment status is unverified; no invented historical observations.'],['Trading','Whole-share virtual orders, atomic rebalances and multi-user baskets. Strict five-minute quotes by default; explicitly labeled last-quote demo mode for presentations.'],['Verification','Latest recorded build and Jasmine run: 56 specs, 0 failures, 19.63 seconds. Main database migration and a browser MSFT fill verified.'],['Deployment','Native Node.js and MySQL setup. Docker is optional and not used in this delivery. No brokerage connection.']],[110,394])
h('Scope of the conclusions')
p('These checks establish observed behavior for the tested cases. They do not establish profitable strategies, complete 20-year real data, production security, or future live investment performance. A remote LLM service and Alpha Vantage paid-history access remain unverified.')
page('1 | Design translated into software')
table([['Financial concept','Code / persistent records','User interaction'],['Stock','providers.ts, csv-market.ts, finnhub.ts; prices and quotes','Inspect source, dates, prices and coverage.'],['Portfolio','trading.ts; portfolios, holdings and commands','Fund, inspect cash/shares, select horizon.'],['Trading strategy','analysis.ts and quantitative functions; recommendations, evaluations','Generate signals/weights; compare risk; evaluate later outcomes.'],['Order','trading.ts; orders and executions','Queue, cancel or execute; inspect ledger.'],['Basket trade','Trading batch and rebalance services; baskets and allocations','Coordinate a portfolio or aggregate authorized users\' orders.']],[92,238,174])
h('How the design guided the prompts')
p('The initiating prompt required minimal established concepts, their attributes and actions, relationships, simulated execution, MySQL state, ownership and transaction invariants. It then directed the AI to implement recommendations, coupled trades, baskets and chronological evaluation. The full instruction is retained verbatim in evidence/reference-request.txt; docs/design-to-code.md maps the resulting modules.')
h('Real mismatch: safe retries')
p('The design required a repeated request to return the same committed result without a second debit. Initially execution fetched a new quote before checking the stored command. An outage after the first fill therefore prevented retrieval of an already committed result. Review found this gap despite earlier passing tests.')
code('# Before (condensed sequence)\nquote = await fetchQuote()\nreturn executeIdempotentCommand(quote)\n\n# After (condensed sequence)\nprior = await cached(user, portfolio, key, payload)\nif prior is not None: return prior\nquote = await fetchQuote()\nreturn executeIdempotentCommand(quote)')
p('The excerpt above is explanatory pseudocode, not a verbatim code diff. Actual before/after versions: cf82639 and d894c93. A regression fills once, makes the provider fail, and repeats the request; the saved result must return without another fill.')
h('Deliberate refinements')
p('The risk lookback is now independent of the investment horizon. The user later requested an explanatory frontend, one live API, supplied CSV history, and usable demo trades. These additions retain the five financial concepts. Current implementation snapshot: 4564e15.')
page('2 | Analysis and execution rules')
table([['Horizon','Fast / slow SMA','Suggested review'],['1 year','20 / 100 observations','Monthly (21 observations)'],['2 years','50 / 100 observations','Quarterly (63 observations)'],['5 years','50 / 200 observations','Semiannual (126 observations)']],[130,190,184])
p('RSI uses simple average gains/losses over 14 changes, rather than Wilder smoothing. Warm-up results remain unavailable rather than zero. Returns are P[t]/P[t-1]-1; annualized volatility uses sample variance and 252 observations per year. The horizon describes the user\'s goal; riskYears selects the past covariance window.')
h('Coordinated risk allocation')
p('The optimizer minimizes w\' (C + 1e-8 I) w with nonnegative weights summing to one and a 20% per-company target cap. It aligns dates, requires at least 61 shared prices, uses projected gradient descent and checks feasibility/convergence. Existing, equal-weight and proposed risk use the same covariance window. Cash is modeled as zero-risk, so a fully invested proposal need not beat an all-cash account.')
p('A recorded CSV browser example had 503 aligned prices and estimated annualized volatility of 14.34% for equal weights versus 10.03% for the proposal. This is an in-sample estimate, not a realized gain or proof of future protection. Evidence: csv-dashboard.png and development-log.md.')
h('Transactions and baskets')
p('USD amounts use Decimal arithmetic and MySQL DECIMAL storage with half-up cent rounding. A direct fill commits cash, shares, order status and execution together. Row locks and request keys protect against overspending and duplicate fills. A rebalance sells before buys within one transaction. In a basket, compatible orders share a quote; allocations retain owners, opposing sides stay separate, and full fills reconcile exactly to per-user amounts. No user finances another.')
h('Two explicit quote policies')
p('Strict mode rejects observations older than five minutes. The opt-in demo-last-quote policy accepts Finnhub observations up to seven days old for hypothetical virtual fills; future timestamps remain invalid. The original quote timestamp, provider and mode are saved. This is a presentation policy, not a market-hours detector or real-time execution guarantee.')
h('Evaluation timing')
p('Signals exclude post-cutoff prices. Historical replay executes on the next observation and uses a 10-basis-point one-way cost assumption. Stored allocation evaluation enters at the first subsequent close. SMA replay and allocation evaluation are different experiments and are labeled separately. CSV close adjustment uncertainty, survivorship and data revisions limit interpretation.')
page('3 | Actual prompts, problems and fixes')
p('The user directed the work with the preserved structured prompt and these actual follow-ups. Quotations retain the original spelling; descriptions of agent fixes are summaries, not invented user prompts.')
table([['Actual user instruction','Observed issue / response','Verification and record'],['"can u check if all the asked thnsg working ropery test them all"','Audit exposed malformed basket request errors and excessive long-history computation. Added input validation and cached statistical means before summation.','45-spec audit passed; 3f7288d; audit-tests-verified.txt.'],['"u can use these 20 things instead of synthetic data"','Added strict CSV parsing, provenance, cutoff filtering and matching recommendation sources. Kept actual coverage and adjustment limitations visible.','54 specs passed; f53c498; csv-validation.json and csv-tests-final.txt.'],['"then how we need to make i working right"','Weekend Finnhub observations failed strict freshness checks. Added explicit hypothetical demo policy without changing observation times.','56 specs passed; 4564e15; demo-execution-tests.txt and demo-filled-state.json.']],[154,190,160])
h('Specific code: demo freshness policy')
code('const age = this.now().getTime() -\n  new Date(q.observedAt).getTime();\nconst demo =\n  this.executionMode === "demo-last-quote" &&\n  q.provider === "finnhub";\nconst maxAge = demo ? 7 * 86400000 : 300000;')
p('From src/trading.ts. The following check requires finite age, age >= 0 and age <= maxAge. Positive raw USD prices are still required. Migration 002 adds execution_mode and quote_provider to the execution ledger.')
h('Timing defect found through actual failures')
p('The user supplied a failing basket-test run. Diagnostics found database-created orders several milliseconds ahead of the application cutoff, excluding an order from the intended batch. Order creation now uses the injected application clock, matching cutoff validation. Fixed-clock boundary and rollback regressions passed; see frontend-test-baseline.txt, basket-clock-diagnosis.txt and frontend-tests-repeat.txt.')
h('Preserving development records')
p('The development log, Git history/bundle, test outputs and patches preserve baselines and fixes. No later instructor hints were received. Insufficient funds, missing prices and inconsistent transactions were already in the assignment; they are not presented as new hints. A future hint must be recorded verbatim with a pre-change version and regression.')
page('4 | How the tests were validated')
p('The same AI generated implementation and tests. Expected values below come from small arithmetic examples or invariants, not from rerunning the implementation formula as the oracle. They do not imply an independent human reviewer.')
table([['Case','Independent expectation'],['Cash and shares','100 - (3 x 12.50) = 62.50 cash, with 3 shares.'],['Drawdown','Prices 100,120,90,108 end +8%; maximum decline is 90/120 - 1 = -25%.'],['Covariance','Return vectors [1,0] and [0,1] yield sample matrix [[0.5,-0.5],[-0.5,0.5]].'],['Optimizer','Independent variances 1 and 4 imply minimum at w=0.8 since d(w^2 + 4(1-w)^2)/dw = 10w - 8.'],['Concurrency','From 50 cash, two purchases costing 37.50 cannot both commit; exactly one leaves 12.50.'],['Rollback / retry','Failure between cash and holdings updates leaves original cash, zero new shares and zero executions. Retrying a committed key creates no second fill.'],['Basket allocation','3 and 2 shares at 12.50 sum to 5 shares and 62.50. Per-owner debits sum exactly to the basket total.'],['Quote policy','A two-day-old Finnhub quote fails strict mode and passes explicit demo mode. Future, >7-day, wrong-provider old quotes and zero prices fail.']],[112,392])
h('What passing tests missed')
p('Earlier green suites did not expose the provider-outage retry defect or the UTC/basket clock mismatch. Review and observed failures triggered additional regressions. An initial benchmark also omitted a cost charged to the SMA strategy; a constant-price example now checks comparable entry costs. These cases show why passing tests alone do not prove correctness.')
h('Latest verification, not a new fabricated run')
p('The latest retained npm test output reports 56 specs, 0 failures in 19.63 seconds, including a TypeScript build. Integration tests use the separate MySQL pf_test database and mocked external providers. Migration 002 was applied to the main database; the browser demonstration was then verified against saved cash, holdings and execution records. Evidence: demo-execution-tests.txt and demo-filled-state.json. Earlier failures remain preserved.')
page('5 | Demonstration and review')
p('<b>Verified virtual purchase:</b> Presentation Demo started with $10,000.00. Buying 2 MSFT at $529.05 cost $1,058.10, leaving $8,941.90 and 2 shares. The price observation is October 16, 2026 at 20:00 UTC; the fill occurred October 18 in demo-last-quote mode. It is not a live-market fill.')
img='evidence/demo-filled.png'
source=PILImage.open(img)
sw,sh=source.size
crop=source.crop((int(sw*0.21),int(sh*0.60),int(sw*0.98),int(sh*0.94)))
img='tmp/pdfs/report-review/ledger-detail.png'
crop.save(img)
w,ht=crop.size
scale=min(504/w,250/ht)
b.story.append(Image(img,width=w*scale,height=ht*scale))
p('<font size="8">Figure 1. Detail from browser evidence of the committed order and execution provenance. Full-resolution evidence: evidence/demo-filled.png.</font>')
h('A short classroom walkthrough')
p('Start with the goal: explain decisions and transaction correctness using virtual money. Show Overview cash and holdings, then Strategy signals, source coverage and allocation risk. In Trade desk, queue an order and explicitly execute it; compare the ledger and account state. Explain basket ownership and allocation rules. Finish with Performance, distinguishing later observed evaluation from future returns.')
h('AI contribution and remaining review')
p('The student supplied requirements, follow-up directions, data files and reported failures. AI assisted interpretation, module design, coding, tests and debugging. Financial timing, transaction invariants and benchmark fairness required additional checking and rework. Human effort was not measured, so no hours or ranking of human workload is invented. Team review should check selected arithmetic, course-slide alignment and the saved development cases.')
h('Reproduce and submit')
p('With native MySQL running and local .env configured: npm ci; npm run build; npm run migrate; npm run seed; npm start. Run npm test separately against pf_test. Use EXECUTION_MODE=demo-last-quote only for labeled last-quote demonstrations. Keys stay in ignored .env. Submit Report #1 as the required conceptual PDF; include this supplement and the development log if requested. Add team/member names and review missing Lecture #1 slides 13/17 before submission.')
def footer(c,doc):
 c.setStrokeColor(colors.HexColor('#adc4cf'));c.line(48,40,552,40);c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#526676'));c.drawString(48,27,'Programming Finance | Implementation and testing supplement');c.drawRightString(552,27,str(doc.page))
b.SimpleDocTemplate('output/pdf/implementation-testing-supplement.pdf',pagesize=(600,780),rightMargin=48,leftMargin=48,topMargin=42,bottomMargin=55).build(b.story,onFirstPage=footer,onLaterPages=footer)
print('Supplement written')
