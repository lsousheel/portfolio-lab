const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const usd = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n || 0),
  );
const pct = (n) =>
    n == null ? "Not available" : (Number(n) * 100).toFixed(2) + "%",
  num = (n) => (n == null ? "—" : Number(n).toFixed(2)),
  today = () => new Date().toISOString().slice(0, 10);
const names = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  META: "Meta",
  NVDA: "NVIDIA",
  JPM: "JPMorgan Chase",
  BAC: "Bank of America",
  V: "Visa",
  MA: "Mastercard",
  JNJ: "Johnson & Johnson",
  PFE: "Pfizer",
  UNH: "UnitedHealth",
  XOM: "Exxon Mobil",
  CVX: "Chevron",
  PG: "Procter & Gamble",
  KO: "Coca-Cola",
  WMT: "Walmart",
  HD: "Home Depot",
  DIS: "Disney",
};
let accounts;
try {
  accounts = JSON.parse(localStorage.getItem("pf-accounts") || "[]");
} catch {
  accounts = [];
}
let active = localStorage.getItem("pf-active"),
  config = { symbols: Object.keys(names), provider: "Connecting…" },
  portfolio = null,
  portfolios = [],
  recommendation = null,
  proposal = null,
  evaluation = null,
  batch = null,
  chartSymbol = "AAPL",
  tour = -1,
  busy = false,
  chosenPortfolio = localStorage.getItem("pf-portfolio");
const current = () => accounts.find((a) => a.id === active),
  base = () => "/portfolios/" + portfolio.id;
const save = () => {
  localStorage.setItem("pf-accounts", JSON.stringify(accounts));
  if (active) localStorage.setItem("pf-active", active);
  else localStorage.removeItem("pf-active");
  if (chosenPortfolio) localStorage.setItem("pf-portfolio", chosenPortfolio);
};
let toastTimer;
function toast(message, error = false, persistent = false) {
  $("#status").textContent = message;
  $("#status").className = "visible" + (error ? " error" : "");
  clearTimeout(toastTimer);
  if (!persistent)
    toastTimer = setTimeout(() => ($("#status").className = ""), 6500);
}
async function api(path, method = "GET", body, token = current()?.token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (method === "POST") headers["Idempotency-Key"] = crypto.randomUUID();
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error(
      "Unreadable server response. Restart with npm run build and npm start.",
    );
  }
  if (!response.ok)
    throw Error(data.error || "Request failed (" + response.status + ")");
  return data;
}
async function action(message, fn) {
  if (busy) return;
  busy = true;
  document.body.classList.add("busy");
  toast(message, false, true);
  try {
    await fn();
    $("#status").className = "";
  } catch (e) {
    toast(e.message || "Something went wrong", true);
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
}
function accountDialog() {
  $("#account-select").innerHTML =
    '<option value="">Choose an identity…</option>' +
    accounts
      .map(
        (a) =>
          `<option value="${esc(a.id)}" ${a.id === active ? "selected" : ""}>${esc(a.name)}</option>`,
      )
      .join("");
  $("#account-dialog").showModal();
}
async function loadPortfolio() {
  portfolios = await api("/portfolios");
  if (!portfolios.some((p) => p.id === chosenPortfolio))
    chosenPortfolio = portfolios[0]?.id;
  portfolio = chosenPortfolio
    ? await api("/portfolios/" + chosenPortfolio)
    : null;
  save();
  if (portfolio) {
    const list = await api(base() + "/recommendations");
    recommendation = list[0] ? { id: list[0].id, ...list[0].payload } : null;
  } else recommendation = null;
  proposal = null;
  evaluation = null;
}
function heading(title, subtitle, actions = "") {
  return `<div class="heading"><div><p class="eyebrow">INVEST WITH UNDERSTANDING</p><h1>${title}</h1><p class="muted">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
const explain = (title, text) =>
    `<div class="learning"><strong>◎ &nbsp; ${title}</strong>${text}</div>`,
  empty = (title, text) =>
    `<div class="empty"><strong>${title}</strong>${text}</div>`;
const card = (label, value, foot, accent = false) =>
  `<div class="card ${accent ? "accent" : ""}"><div class="label">${label}<span>↗</span></div><div class="value">${value}</div><div class="foot">${foot}</div></div>`;
function picker() {
  return `<div class="portfolio-picker"><select id="portfolio-picker" aria-label="Active portfolio">${portfolios.map((p, i) => `<option value="${p.id}" ${p.id === portfolio?.id ? "selected" : ""}>Portfolio ${i + 1} · ${p.horizon} years</option>`).join("")}</select><button class="button" data-action="new-portfolio">+ Portfolio</button></div>`;
}
const tourSteps = [
  [
    "overview",
    "Start with a goal",
    "This is a simulated account. Cash is uninvested money; holdings are the shares you own. Choose a 1-, 2-, or 5-year goal.",
  ],
  [
    "strategy",
    "Explain the recommendation",
    "Analyze the selected companies over a historical window. The strategy proposes an allocation; it does not buy anything until approved.",
  ],
  [
    "trades",
    "Show a transaction",
    "Place a whole-share order, execute it, then show cash and holdings changing together. A rejected order does not change the balance.",
  ],
  [
    "basket",
    "Show multi-user trading",
    "Queue the same stock for two identities. A batch groups their orders, but each person pays only for their own shares.",
  ],
  [
    "results",
    "Measure what happened later",
    "Evaluate a stored recommendation after its cutoff. Compare with equal weights and the original portfolio.",
  ],
  [
    "guide",
    "Finish with the limits",
    "Explain synthetic data, simulated execution, and why historical performance is not a guarantee.",
  ],
];
function tourBanner() {
  if (tour < 0) return "";
  const s = tourSteps[tour];
  return `<section class="tour"><span class="tour-num">0${tour + 1}</span><div class="tour-text"><div class="eyebrow">PRESENTATION NOTES · ${tour + 1} / 6</div><h3>${s[1]}</h3><p>${s[2]}</p></div><button class="button subtle" data-action="end-tour">Exit</button><button class="button lime" data-action="next-tour">${tour === 5 ? "Finish" : "Next step →"}</button></section>`;
}
function welcome() {
  return (
    heading(
      "Your investing story starts here.",
      "A hands-on workspace for understanding portfolios, risk, and simulated trading.",
    ) +
    `<section class="intro"><div><p class="eyebrow">LEARN. EXPERIMENT. EXPLAIN.</p><h2>Make every decision<br>something you can explain.</h2><p class="muted">Follow a portfolio from its first virtual dollar to a recommendation, a coordinated trade, and an honest evaluation.</p><div class="two-buttons"><button class="button primary" data-action="accounts">Create your account →</button><button class="button" data-action="demo">Set up a two-user demo</button></div></div><div class="intro-art" aria-hidden="true"><span></span><span></span><span></span><span></span></div></section><div class="steps">${[
      ["01", "Build a portfolio", "Choose a horizon and add simulated funds."],
      [
        "02",
        "Understand the strategy",
        "Explore trends and compare allocation risk.",
      ],
      [
        "03",
        "Trade together",
        "Execute whole-share orders and multi-user baskets.",
      ],
      [
        "04",
        "Check the outcome",
        "Evaluate later prices against clear baselines.",
      ],
    ]
      .map(
        ([n, h, p]) =>
          `<div class="step"><span>${n}</span><h3>${h}</h3><p>${p}</p></div>`,
      )
      .join("")}</div>` +
    explain(
      "What is real here?",
      "The application, calculations, accounts, and database records are working. In offline mode stock prices are synthetic, and all money and trades are simulated.",
    )
  );
}
function lineChart(values) {
  if (values.length < 2)
    return empty("Not enough data", "Two observations are required.");
  const w = 680,
    h = 180,
    min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || 1,
    pts = values
      .map(
        (v, i) =>
          `${((i / (values.length - 1)) * w).toFixed(2)},${(h - 12 - ((v - min) / range) * (h - 24)).toFixed(2)}`,
      )
      .join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Adjusted stock price over the displayed period" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a9c98b" stop-opacity=".35"/><stop offset="100%" stop-color="#a9c98b" stop-opacity="0"/></linearGradient></defs>${[30, 75, 120, 165].map((y) => `<line x1="0" y1="${y}" x2="680" y2="${y}" stroke="#e9eee3" stroke-dasharray="4 5"/>`).join("")}<polygon points="0,180 ${pts} 680,180" fill="url(#area)"/><polyline points="${pts}" fill="none" stroke="#377654" stroke-width="2.4" vector-effect="non-scaling-stroke"/></svg>`;
}
async function overview() {
  if (!portfolio)
    return (
      heading(
        "Create your first portfolio.",
        "Your account is ready. Choose a goal to begin.",
      ) +
      `<div class="panel"><p>A portfolio holds cash and shares for one investor.</p><button class="button primary" data-action="new-portfolio">Create a portfolio →</button></div>`
    );
  const held = portfolio.holdings.filter((h) => h.quantity > 0),
    quotes = {};
  for (const h of held)
    quotes[h.symbol] = await api("/market/" + h.symbol + "/quote");
  const invested = held.reduce(
      (s, h) => s + h.quantity * Number(quotes[h.symbol].price),
      0,
    ),
    history = await api(
      "/market/" + chartSymbol + "/history?cutoff=" + today(),
    ),
    bars = history.bars.slice(-252),
    change = bars.length > 1 ? bars.at(-1).close / bars[0].close - 1 : 0;
  return (
    heading(
      "Your portfolio, at a glance.",
      `Welcome back, ${esc(current().name)}. See where you stand before your next move.`,
      picker(),
    ) +
    `<div class="cards">${card("Estimated portfolio value", usd(Number(portfolio.cash) + invested), "Cash + quoted value of holdings", true)}${card("Available cash", usd(portfolio.cash), "Ready for simulated trades")}${card("Companies held", held.length + ' <span style="font-size:14px;color:#82917d">/ 20</span>', "Diversify across different stocks")}${card("Investment horizon", portfolio.horizon + " years", "Your future investment goal")}</div><div class="grid"><section class="panel"><div class="panel-head"><div><h2>Market explorer</h2><p class="muted small">Last 252 observations · adjusted price</p></div><select id="chart-symbol" aria-label="Chart stock">${config.symbols.map((s) => `<option ${s === chartSymbol ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="split"><div><span class="stat-inline">${usd(bars.at(-1)?.close)}</span><p class="small ${change >= 0 ? "positive" : "negative"}">${pct(change)} over the displayed window</p></div><div class="legend"><i></i>${esc(names[chartSymbol])}</div></div><div class="chart">${lineChart(bars.map((b) => b.close))}</div><div class="chart-labels"><span>${bars[0]?.date || ""}</span><span>${bars.at(-1)?.date || ""}</span></div><p class="small muted" style="margin:12px 0 0">${esc(history.provider)} · Selected stock history, not your portfolio return.</p></section><section class="panel"><div class="panel-head"><div><h2>Your next move</h2><p class="small muted">A clear path from evidence to action</p></div><span class="tag">GUIDED</span></div><div class="stack"><div><h3>01 &nbsp; Add virtual funds</h3><p class="small muted">Give your portfolio a starting balance.</p><button class="button" data-action="fund">+ Add funds</button></div><div><h3>02 &nbsp; Find an allocation</h3><p class="small muted">Compare risk across selected companies.</p><a class="button primary" href="#strategy">Open strategy lab →</a></div></div>${explain("Cash is part of the portfolio", "An all-cash portfolio has zero stock-price volatility in this model. Buying stocks can increase risk even when diversified.")}</section></div><section class="panel"><div class="panel-head"><div><h2>Your holdings</h2><p class="small muted">Whole shares owned by this portfolio</p></div><a class="button subtle" href="#trades">Trade desk ↗</a></div>${held.length ? `<div class="table-wrap"><table><thead><tr><th>Company</th><th>Shares</th><th>Quote</th><th>Estimated value</th><th>Portfolio weight</th></tr></thead><tbody>${held.map((x) => `<tr><td><span class="ticker">${x.symbol}</span><span class="company">${names[x.symbol] || ""}</span></td><td>${x.quantity}</td><td>${usd(quotes[x.symbol].price)}</td><td>${usd(x.quantity * Number(quotes[x.symbol].price))}</td><td>${pct((x.quantity * Number(quotes[x.symbol].price)) / (Number(portfolio.cash) + invested))}</td></tr>`).join("")}</tbody></table></div>` : empty("Your cash is waiting for a plan.", "Generate a recommendation in Strategy lab, or place your first order in Trade desk.")}</section>`
  );
}
function strategy() {
  const r = recommendation;
  return (
    heading(
      "Turn evidence into a strategy.",
      "Choose your horizon, inspect the signals, and decide whether to act.",
    ) +
    `<section class="panel"><form id="strategy-form"><div class="form-grid"><label>Investment horizon<select name="horizon">${[1, 2, 5].map((h) => `<option value="${h}" ${h === (r?.horizon || portfolio.horizon) ? "selected" : ""}>${h} year${h > 1 ? "s" : ""}</option>`).join("")}</select></label><label>Historical risk window<select name="riskYears">${[1, 2, 5, 10, 20].map((h) => `<option value="${h}" ${h === (r?.lookbackYears || 2) ? "selected" : ""}>Past ${h} year${h > 1 ? "s" : ""}</option>`).join("")}</select></label><label>Decision cutoff<input type="date" name="cutoff" value="${r?.cutoff || "2025-10-16"}" max="${today()}" required></label></div><div class="split"><h3>Companies to consider <span class="muted small">5–20 · include all held stocks</span></h3><button type="button" class="button subtle" data-action="select-all">Select all 20</button></div><div class="symbols">${config.symbols.map((s) => `<label><input type="checkbox" name="symbol" value="${s}" ${!r || r.symbols.includes(s) ? "checked" : ""}>${s}</label>`).join("")}</div><button class="button primary" type="submit">Generate recommendation →</button><span class="small muted"> &nbsp; Analysis only. No trades are placed.</span></form>${explain("Horizon and history are different", "The horizon is how long you plan to invest. The historical window selects past observations used to estimate risk. An older cutoff lets you demonstrate evaluation against later observations.")}</section>${r ? recommendationView(r) : empty("Your recommendation will appear here.", "Calculate trend indicators and a minimum-variance allocation.")}`
  );
}
function recommendationView(r) {
  const max = Math.max(
    r.risk.current,
    r.risk.equalWeight,
    r.risk.proposed,
    0.0001,
  );
  return `<div style="height:22px"></div><div class="grid"><section class="panel"><div class="panel-head"><div><p class="eyebrow">ESTIMATED HISTORICAL RISK</p><h2>Compare the three allocations.</h2></div><span class="tag">${r.risk.observations} observations</span></div><div class="metric-bars">${[
    ["Existing portfolio", r.risk.current],
    ["Equal weights", r.risk.equalWeight],
    ["Proposed allocation", r.risk.proposed],
  ]
    .map(
      ([name, value]) =>
        `<div class="row"><span>${name}</span><div class="bar-track"><div class="bar-fill" style="width:${(Number(value) / max) * 100}%"></div></div><b>${pct(value)}</b></div>`,
    )
    .join(
      "",
    )}</div>${explain("What does this number mean?", "Annualized volatility estimates how much returns fluctuated. Lower means a smoother past path—not a guarantee of smaller future losses. All three use the same dates.")}<p class="small muted" style="margin-top:13px">${r.risk.from} to ${r.risk.to}. Current allocation includes cash.</p></section><section class="panel"><p class="eyebrow">YOUR STRATEGY</p><h2>Review ${esc(r.frequency)}.</h2><p class="muted">A long-only, minimum-variance allocation with a maximum target of 20% in one company.</p><p>Goal: <b>${r.horizon} years</b><br>Decision cutoff: <b>${r.cutoff}</b></p><button class="button primary" data-action="propose">Preview coordinated trades →</button><p class="small muted" style="margin-top:12px">A preview uses fresh quotes. You approve execution separately.</p></section></div><section class="panel"><div class="panel-head"><div><h2>Signals behind the recommendation</h2><p class="small muted">SMA = moving average · RSI = recent gains versus losses</p></div><button class="button subtle" data-action="explain-ai">Explain these results</button></div><div class="table-wrap"><table><thead><tr><th>Company</th><th>Trend</th><th>Fast SMA</th><th>Slow SMA</th><th>RSI (14)</th><th>Target allocation</th></tr></thead><tbody>${r.details.map((d, i) => `<tr><td><span class="ticker">${d.symbol}</span><span class="company">${names[d.symbol] || ""}</span></td><td><span class="tag ${d.indicators.signal === "downtrend" ? "red" : ""}">${esc(d.indicators.signal)}</span></td><td>${num(d.indicators.fast)}</td><td>${num(d.indicators.slow)}</td><td>${num(d.indicators.rsi)}</td><td>${pct(r.weights[i])}</td></tr>`).join("")}</tbody></table></div>${explain("Signals are context, not predictions", "An uptrend means the fast average is above the slow average. RSI summarizes recent price changes. Target weights come from covariance optimization, not from treating every uptrend as a buy instruction.")}<div id="ai-explanation"></div><details><summary>Coverage and calculation details</summary><p class="small muted">${esc(r.limitations.join(" · "))}</p><pre>${esc(JSON.stringify({ optimization: r.optimization, coverage: r.details.map((d) => ({ symbol: d.symbol, ...d.coverage, provider: d.provider })), intervals: r.details[0]?.intervals }, null, 2))}</pre></details></section>${proposal ? proposalView() : ""}`;
}
function proposalView() {
  return `<section class="panel" id="proposal-panel" style="margin-top:22px"><div class="panel-head"><div><p class="eyebrow">REVIEW BEFORE EXECUTING</p><h2>Your coordinated trade proposal</h2></div><span class="badge">${proposal.legs.length} legs</span></div><div class="table-wrap"><table><thead><tr><th>Stock</th><th>Action</th><th>Whole shares</th></tr></thead><tbody>${proposal.legs.map((l) => `<tr><td>${l.symbol}</td><td><span class="tag ${l.side === "SELL" ? "amber" : ""}">${l.side}</span></td><td>${l.quantity}</td></tr>`).join("")}</tbody></table></div><div class="split" style="margin-top:20px"><p>Estimated residual cash <b>${usd(proposal.residualCash)}</b></p><button class="button primary" data-action="execute-proposal" ${proposal.legs.length ? "" : "disabled"}>Approve & execute simulated trades</button></div>${explain("All legs commit together", "The server executes sells first and validates affordability again. If any leg fails, the whole rebalance rolls back. Quotes can change between preview and execution.")}</section>`;
}
async function trades() {
  const a = await api(base() + "/activity");
  return (
    heading(
      "Practice the trade. See the effect.",
      "Orders use whole shares and virtual money. Every successful fill is saved.",
    ) +
    `<div class="grid"><section class="panel"><p class="eyebrow">NEW SIMULATED ORDER</p><form id="order-form"><div class="form-grid"><label>Company<select name="symbol">${config.symbols.map((s) => `<option>${s}</option>`).join("")}</select></label><label>Action<select name="side"><option>BUY</option><option>SELL</option></select></label><label>Whole shares<input type="number" name="quantity" value="3" min="1" max="1000000" step="1" required></label></div><div class="two-buttons"><button class="button primary" type="submit">Queue order</button><button class="button" type="button" data-action="show-quote">Check quote</button></div><p id="quote-display" class="small muted" style="margin-top:15px">Orders stay pending until executed or collected in a basket.</p></form></section><section class="panel"><p class="eyebrow">ACCOUNT CHECK</p><h2>${usd(portfolio.cash)} available</h2><p class="muted">Purchases cannot exceed cash. Sales cannot exceed owned shares.</p><button class="button" data-action="reject-demo">Demonstrate an insufficient-funds rejection</button>${explain("What to show in your presentation", "Queue an order, then execute it below. Compare cash and holdings. The database saves the fill and account changes in one transaction.")}</section></div><section class="panel"><div class="panel-head"><div><h2>Order activity</h2><p class="small muted">${a.orders.length} orders in this portfolio</p></div><button class="button subtle" data-action="refresh">Refresh ↻</button></div>${
      a.orders.length
        ? `<div class="table-wrap"><table><thead><tr><th>Company</th><th>Side</th><th>Quantity</th><th>Status</th><th>Action / reason</th></tr></thead><tbody>${a.orders
            .slice()
            .reverse()
            .map(
              (o) =>
                `<tr><td><span class="ticker">${esc(o.symbol)}</span></td><td>${o.side}</td><td>${o.quantity}</td><td><span class="tag ${["REJECTED", "CANCELLED"].includes(o.status) ? "red" : o.status === "PENDING" ? "amber" : ""}">${o.status}</span></td><td>${o.status === "PENDING" ? `<div class="order-actions"><button class="button" data-action="execute-order" data-id="${o.id}">Execute</button><button class="button subtle" data-action="cancel-order" data-id="${o.id}">Cancel</button></div>` : esc(o.reason || "—")}</td></tr>`,
            )
            .join("")}</tbody></table></div>`
        : empty(
            "No orders yet.",
            "Queue a buy or sell to start your audit trail.",
          )
    }</section><section class="panel" style="margin-top:22px"><h2>Execution ledger</h2>${
      a.executions.length
        ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Quantity</th><th>Fill price</th><th>Amount</th><th>Executed (UTC)</th></tr></thead><tbody>${a.executions
            .slice()
            .reverse()
            .map(
              (e) =>
                `<tr><td>${esc(e.order_id.slice(0, 8))}…</td><td>${e.quantity}</td><td>${usd(e.price)}</td><td>${usd(e.amount)}</td><td>${esc(e.executed_at)}</td></tr>`,
            )
            .join("")}</tbody></table></div>`
        : empty(
            "No fills yet.",
            "Executions appear only after a trade commits.",
          )
    }</section>`
  );
}
async function basketPage() {
  const others = accounts.filter((a) => a.id !== active);
  return (
    heading(
      "Trade together. Keep ownership separate.",
      "Combine compatible pending orders across two authorized demo identities.",
    ) +
    `<div class="steps">${[
      ["01", "Queue", "Each investor submits their own order."],
      ["02", "Group", "Orders are grouped by stock and side."],
      ["03", "Fill", "One quote is used per stock for the batch."],
      ["04", "Reconcile", "Each investor pays for their allocation."],
    ]
      .map(
        ([n, h, t]) =>
          `<div class="step"><span>${n}</span><h3>${h}</h3><p>${t}</p></div>`,
      )
      .join(
        "",
      )}</div><div class="grid equal"><section class="panel"><p class="eyebrow">TWO-USER DEMONSTRATION</p><h2>Set up the same-stock example.</h2><p class="muted">Queues 3 AAPL shares for this portfolio and 2 for the second identity's first portfolio. It does not execute yet.</p><label>Second investor<select id="second-investor"><option value="">Choose an investor…</option>${others.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></label><div class="two-buttons"><button class="button primary" data-action="queue-basket" ${others.length ? "" : "disabled"}>Queue both investors' orders</button><button class="button" data-action="demo">Create two demo accounts</button></div>${explain("Authorization still matters", "Only portfolios whose demo tokens are saved in this browser participate. Unrelated accounts are excluded.")}</section><section class="panel"><p class="eyebrow">COLLECT PENDING ORDERS</p><h2>Execute this pair's basket.</h2><p class="muted">Processes all pending orders in the active portfolio and the selected investor's first portfolio. Buys and sells stay separate.</p><button class="button primary" data-action="run-basket" ${others.length ? "" : "disabled"}>Execute authorized basket →</button><p class="small muted" style="margin-top:16px">Full fills only. Unaffordable orders are rejected without using another investor's cash.</p></section></div>${batch ? basketResults() : ""}`
  );
}
function basketResults() {
  return `<section class="panel"><div class="panel-head"><div><p class="eyebrow">BATCH RECEIPT</p><h2>${batch.fills.length} filled · ${batch.rejected.length} rejected</h2><p class="small muted">Cutoff: ${esc(batch.cutoff)}</p></div><span class="tag">RECONCILED</span></div><div class="table-wrap"><table><thead><tr><th>Stock / side</th><th>Total shares</th><th>Total allocated amount</th></tr></thead><tbody>${Object.entries(
    batch.groups,
  )
    .map(
      ([k, v]) =>
        `<tr><td>${esc(k.replace(":", " / "))}</td><td>${v.quantity}</td><td>${usd(v.amount)}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div><h3 style="margin-top:25px">Individual fills</h3><div class="table-wrap"><table><thead><tr><th>Owner</th><th>Stock</th><th>Shares</th><th>Allocated cost</th><th>Cash after fill</th></tr></thead><tbody>${batch.fills.map((f) => `<tr><td>${esc(batch.owners?.[f.orderId] || f.orderId.slice(0, 8))}</td><td>${f.symbol} / ${f.side}</td><td>${f.quantity}</td><td>${usd(f.amount)}</td><td>${usd(f.cash)}</td></tr>`).join("")}</tbody></table></div>${batch.rejected.length ? `<div class="notice">${batch.rejected.map((x) => esc(x.orderId.slice(0, 8) + ": " + x.reason)).join("<br>")}</div>` : ""}${explain("Why the totals match", "Group amounts sum individually rounded allocations. Separate cash debits and share records preserve each investor’s ownership.")}</section>`;
}
function resultCard(name, m, featured = false) {
  return `<div class="result-card ${featured ? "featured" : ""}"><h3>${name}</h3><div class="value ${m.totalReturn >= 0 ? "positive" : "negative"}">${pct(m.totalReturn)}</div><p class="muted">Total return</p><hr><p class="split"><span>Maximum drawdown</span><b>${pct(m.maxDrawdown)}</b></p><p class="split"><span>Annual volatility</span><b>${pct(m.annualVolatility)}</b></p><p class="split"><span>Sharpe (0% risk-free)</span><b>${num(m.sharpe)}</b></p><p class="split"><span>Turnover</span><b>${num(m.turnover)}</b></p></div>`;
}
function performance() {
  return (
    heading(
      "Did the recommendation hold up?",
      "Measure what happened after the decision. Keep comparisons honest.",
    ) +
    `<section class="panel"><div class="panel-head"><div><p class="eyebrow">RECORDED ALLOCATION EVALUATION</p><h2>${recommendation ? "Decision dated " + recommendation.cutoff : "Start with a recommendation"}</h2><p class="muted small">${recommendation ? "Evaluates the latest stored recommendation for this portfolio." : "Open Strategy lab to record a decision with a historical cutoff."}</p></div><a href="#strategy" class="button subtle">Strategy lab ↗</a></div><form id="evaluation-form"><div class="form-grid"><label>Evaluate through<input type="date" name="end" value="${today()}" max="${today()}" required></label></div><button class="button primary" ${recommendation ? "" : "disabled"}>Evaluate later observations →</button></form>${explain("No peeking into the future", "Entry uses the first shared observation strictly after the cutoff. At least 61 later shared observations are needed. An old cutoff analyzed today is historical replay, not observed future live performance.")}</section>${evaluation ? evaluationView() : ""}<section class="panel" style="margin-top:22px"><h2>Separate experiment: trend timing</h2><p class="small muted">Compare the SMA timing rule against buy-and-hold for one stock.</p><form id="replay-form"><div class="form-grid"><label>Stock<select name="symbol">${config.symbols.map((s) => `<option>${s}</option>`).join("")}</select></label><label>Strategy horizon<select name="horizon"><option value="1">1 year</option><option value="2">2 years</option><option value="5">5 years</option></select></label></div><button class="button" type="submit">Run chronological replay</button></form><div id="replay-result"></div>${explain("A different experiment", "This tests SMA timing, not the covariance allocation above. It applies 10 basis points of combined cost/slippage per exposure change and the same entry cost to buy-and-hold.")}</section>`
  );
}
function evaluationView() {
  const e = evaluation;
  return `<section class="panel" style="margin-top:22px"><span class="badge">${esc(e.label)}</span><h2 style="margin-top:15px">Same period. Three ways to invest.</h2><p class="small muted">Entry ${e.executionDate} → ${e.end} · ${e.observations} observations · zero costs for all three</p><div class="result-cards">${[
    ["Recommended allocation", e.strategy, true],
    ["Equal-weight baseline", e.equalWeight, false],
    ["Original buy-and-hold", e.existingBuyHold, false],
  ]
    .map(([name, m, feature]) => resultCard(name, m, feature))
    .join(
      "",
    )}</div>${explain("Read the full result", "Compare return, drawdown (worst peak-to-trough fall) and volatility (variation in returns). These fractional allocations are analytical comparisons, not realized account profit.")}<p class="small muted" style="margin-top:14px">${esc(e.assumptions)}</p></section>`;
}
function guide() {
  return (
    heading(
      "Explain the project with confidence.",
      "Follow this presentation outline directly through the app.",
      `<button class="button primary" data-action="start-tour">Start guided presentation →</button>`,
    ) +
    `<div class="notice">This is a working software engineering simulator. Offline prices are synthetic, funds are virtual, and the application cannot send real brokerage orders.</div><div class="guide-grid">${[
      [
        "01",
        "What problem does it solve?",
        "Inspect a portfolio, get explainable allocation suggestions, coordinate trades, and measure later outcomes.",
        "We turn historical prices into transparent calculations, then keep trading separate from recommendations.",
        "overview",
        "Show the portfolio",
      ],
      [
        "02",
        "How does a recommendation work?",
        "Moving averages and RSI summarize trends. Covariance measures how stocks move together; an optimizer proposes target weights.",
        "The horizon is a future goal. The lookback is past evidence. Lower historical risk is not a promise.",
        "strategy",
        "Show calculations",
      ],
      [
        "03",
        "How is trading kept consistent?",
        "The server checks ownership, cash, holdings and fresh quotes. Transactions save related changes together, and request keys prevent duplicate fills.",
        "A failed buy does not lose cash. A coordinated rebalance completes every leg or none.",
        "trades",
        "Show an order",
      ],
      [
        "04",
        "What makes basket trading different?",
        "Several investors’ orders are grouped by stock and side, while their accounts and allocations remain separate.",
        "Two people can buy five shares together while each pays only for the shares they requested.",
        "basket",
        "Show a shared batch",
      ],
      [
        "05",
        "How do we evaluate it?",
        "Record a decision, enter at a later observation, and compare with equal weights and the existing portfolio.",
        "We do not use later prices to generate the earlier recommendation. A replay is labeled as a replay.",
        "results",
        "Show the comparison",
      ],
      [
        "06",
        "What are its limits?",
        "Synthetic data demonstrates the workflow, not profitability. Live data access, realistic liquidity and corporate-action accounting need further work.",
        "AI explains computed results but cannot change numbers or execute trades. Human review matters.",
        "strategy",
        "Show the evidence",
      ],
    ]
      .map(
        ([n, title, text, say, route, link]) =>
          `<article class="guide-card"><span class="number">${n}</span><h3>${title}</h3><p>${text}</p><a href="#${route}">${link} →</a><blockquote>“${say}”</blockquote></article>`,
      )
      .join("")}</div>`
  );
}
let renderedRoute;
async function render() {
  const route = location.hash.slice(1) || "overview";
  $$("#nav a").forEach((a) =>
    a.classList.toggle("active", a.dataset.page === route),
  );
  $("#crumb").textContent =
    {
      overview: "Overview",
      strategy: "Strategy lab",
      trades: "Trade desk",
      basket: "Basket trading",
      results: "Performance",
      guide: "Project guide",
    }[route] || "Overview";
  $("#account-button").textContent =
    current()?.name?.slice(0, 2).toUpperCase() || "U";
  let content;
  if (route === "guide") content = guide();
  else if (!current()) content = welcome();
  else if (!portfolio) content = await overview();
  else
    content =
      route === "strategy"
        ? strategy()
        : route === "trades"
          ? await trades()
          : route === "basket"
            ? await basketPage()
            : route === "results"
              ? performance()
              : await overview();
  $("#main").innerHTML = tourBanner() + content;
  if (renderedRoute !== route) {
    window.scrollTo(0, 0);
    renderedRoute = route;
  }
}
async function refresh() {
  if (portfolio) portfolio = await api(base());
  await render();
}
async function demo() {
  if (!config.synthetic)
    throw Error(
      "The guided demo needs offline mode. Set MARKET_PROVIDER=offline and restart.",
    );
  for (const name of ["Alex · demo", "Jordan · demo"]) {
    const u = await api("/users", "POST", { name }, null);
    accounts.push(u);
    active = u.id;
    save();
    const p = await api("/portfolios", "POST", { horizon: 2 });
    await api("/portfolios/" + p.id + "/funds", "POST", {
      amount: "100000.00",
    });
  }
  active = accounts.at(-2).id;
  chosenPortfolio = null;
  save();
  await loadPortfolio();
  $("#account-dialog").close();
  location.hash = "overview";
  await render();
}
function dialogInput(title, label, value, type = "text") {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.innerHTML = `<form><h2>${title}</h2><label>${label}${type === "select" ? '<select name="value"><option value="1">1 year</option><option value="2" selected>2 years</option><option value="5">5 years</option></select>' : `<input name="value" value="${value}" required type="${type}" ${type === "number" ? 'min="0.01" max="999999999" step="0.01"' : ""}>`}</label><div class="two-buttons"><button class="button primary" type="submit">Continue</button><button class="button" type="button">Cancel</button></div></form>`;
    document.body.append(d);
    const done = (v) => {
      d.close();
      d.remove();
      resolve(v);
    };
    d.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      e.stopPropagation();
      done(new FormData(e.target).get("value"));
    };
    d.querySelector("button[type=button]").onclick = () => done(null);
    d.oncancel = (e) => {
      e.preventDefault();
      done(null);
    };
    d.showModal();
  });
}
async function createPortfolio() {
  const h = await dialogInput(
    "Create a portfolio",
    "Investment horizon",
    "2",
    "select",
  );
  if (h === null) return;
  const p = await api("/portfolios", "POST", { horizon: Number(h) });
  chosenPortfolio = p.id;
  await loadPortfolio();
  await render();
}
async function basketMembers() {
  const second = accounts.find((a) => a.id === $("#second-investor").value);
  if (!second) throw Error("Choose the second investor first.");
  const ps = await api("/portfolios", "GET", undefined, second.token);
  if (!ps.length) throw Error("The second investor needs a portfolio first.");
  return [
    { account: current(), portfolio: portfolio.id },
    { account: second, portfolio: ps[0].id },
  ];
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const name = b.dataset.action;
  if (name === "accounts") {
    accountDialog();
    return;
  }
  if (name === "start-tour") {
    tour = 0;
    location.hash = "overview";
    action("Opening presentation…", render);
    return;
  }
  if (name === "end-tour") {
    tour = -1;
    action("Closing presentation…", render);
    return;
  }
  if (name === "next-tour") {
    tour = tour === 5 ? -1 : tour + 1;
    if (tour >= 0) location.hash = tourSteps[tour][0];
    action("Opening next step…", render);
    return;
  }
  if (name === "select-all") {
    $$("input[name=symbol]").forEach((i) => (i.checked = true));
    return;
  }
  action("Working with your simulated portfolio…", async () => {
    if (name === "demo") await demo();
    if (name === "new-portfolio") await createPortfolio();
    if (name === "fund") {
      const amount = await dialogInput(
        "Add simulated funds",
        "Amount in USD",
        "10000.00",
        "number",
      );
      if (amount !== null) {
        await api(base() + "/funds", "POST", { amount });
        await refresh();
      }
    }
    if (name === "refresh") await refresh();
    if (name === "propose") {
      proposal = await api(
        base() + "/recommendations/" + recommendation.id + "/proposal",
        "POST",
        {},
      );
      await render();
      $("#proposal-panel").scrollIntoView({ behavior: "smooth" });
    }
    if (name === "execute-proposal") {
      await api(base() + "/rebalance", "POST", { legs: proposal.legs });
      proposal = null;
      location.hash = "overview";
      await refresh();
    }
    if (name === "explain-ai") {
      const r = await api(
        base() + "/recommendations/" + recommendation.id + "/explain",
        "POST",
        {},
      );
      $("#ai-explanation").innerHTML = explain(
        esc(r.commentary.label),
        esc(r.commentary.text),
      );
    }
    if (name === "show-quote") {
      const s = $("#order-form select[name=symbol]").value,
        q = await api("/market/" + s + "/quote");
      $("#quote-display").textContent =
        `${s}: ${usd(q.price)} · ${q.provider} · observed ${q.observedAt}`;
    }
    if (name === "execute-order") {
      await api(base() + "/orders/" + b.dataset.id + "/execute", "POST", {});
      await refresh();
    }
    if (name === "cancel-order") {
      await api(base() + "/orders/" + b.dataset.id + "/cancel", "POST", {});
      await refresh();
    }
    if (name === "reject-demo") {
      const quote = await api("/market/AAPL/quote");
      const quantity =
        Math.floor(Number(portfolio.cash) / Number(quote.price)) + 1;
      if (quantity > 1000000)
        throw Error(
          "This account can afford the maximum order. Use a smaller funded demo portfolio for this example.",
        );
      const o = await api(base() + "/orders", "POST", {
        symbol: "AAPL",
        side: "BUY",
        quantity,
      });
      try {
        await api(base() + "/orders/" + o.id + "/execute", "POST", {});
        await refresh();
      } catch (error) {
        await api(base() + "/orders/" + o.id + "/cancel", "POST", {});
        await refresh();
        $("#main").insertAdjacentHTML(
          "afterbegin",
          `<div class="notice">Demonstration result: ${esc(error.message)}. The unfilled demo order was cancelled. No cash or holdings changed.</div>`,
        );
      }
    }
    if (name === "queue-basket") {
      const members = await basketMembers();
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        await api(
          "/portfolios/" + m.portfolio + "/orders",
          "POST",
          { symbol: "AAPL", side: "BUY", quantity: i === 0 ? 3 : 2 },
          m.account.token,
        );
      }
      $("#main").insertAdjacentHTML(
        "afterbegin",
        '<div class="notice">Queued 3 shares and 2 shares. Select Execute authorized basket to fill this pair’s pending orders.</div>',
      );
    }
    if (name === "run-basket") {
      const members = await basketMembers(),
        owners = {};
      for (const m of members) {
        const a = await api(
          "/portfolios/" + m.portfolio + "/activity",
          "GET",
          undefined,
          m.account.token,
        );
        a.orders.forEach((o) => (owners[o.id] = m.account.name));
      }
      batch = await api("/baskets", "POST", {
        key: crypto.randomUUID(),
        cutoff: new Date().toISOString(),
        members: members.map((m) => ({
          portfolio: m.portfolio,
          token: m.account.token,
        })),
      });
      batch.owners = owners;
      await refresh();
    }
  });
});
document.addEventListener("submit", (e) => {
  if (["account-form", "token-form"].includes(e.target.id)) return;
  e.preventDefault();
  const f = new FormData(e.target);
  action("Calculating and saving results…", async () => {
    if (e.target.id === "strategy-form") {
      recommendation = await api(base() + "/recommendations", "POST", {
        horizon: Number(f.get("horizon")),
        riskYears: Number(f.get("riskYears")),
        cutoff: f.get("cutoff"),
        symbols: f.getAll("symbol"),
      });
      proposal = null;
      evaluation = null;
      await render();
    }
    if (e.target.id === "order-form") {
      await api(base() + "/orders", "POST", {
        symbol: f.get("symbol"),
        side: f.get("side"),
        quantity: Number(f.get("quantity")),
      });
      await refresh();
    }
    if (e.target.id === "evaluation-form") {
      evaluation = await api(
        base() + "/recommendations/" + recommendation.id + "/evaluate",
        "POST",
        { end: f.get("end") },
      );
      await render();
    }
    if (e.target.id === "replay-form") {
      const r = await api("/market/" + f.get("symbol") + "/replay", "POST", {
        cutoff: today(),
        horizon: Number(f.get("horizon")),
      });
      $("#replay-result").innerHTML =
        `<div class="result-cards">${resultCard("SMA timing rule", r.strategy, true)}${resultCard("Buy-and-hold", r.buyHold)}</div><p class="small muted" style="margin-top:15px">${esc(r.label)} · ${r.audit.length} decisions · ${r.costBps} bps combined costs</p>`;
    }
  });
});
document.addEventListener("change", (e) => {
  if (e.target.id === "portfolio-picker")
    action("Loading portfolio…", async () => {
      chosenPortfolio = e.target.value;
      await loadPortfolio();
      await render();
    });
  if (e.target.id === "chart-symbol")
    action("Loading history…", async () => {
      chartSymbol = e.target.value;
      await render();
    });
});
$("#account-button").onclick = accountDialog;
$("#close-account").onclick = () => $("#account-dialog").close();
$("#demo-setup").onclick = () =>
  action("Creating two funded demo accounts…", demo);
$("#tour-button").onclick = () => {
  tour = tour < 0 ? 0 : -1;
  if (tour === 0) location.hash = "overview";
  action("Opening presentation…", render);
};
$("#account-form").onsubmit = (e) => {
  e.preventDefault();
  action("Creating account…", async () => {
    const u = await api(
      "/users",
      "POST",
      { name: new FormData(e.target).get("name") },
      null,
    );
    accounts.push(u);
    active = u.id;
    chosenPortfolio = null;
    save();
    await loadPortfolio();
    $("#account-dialog").close();
    await render();
  });
};
$("#token-form").onsubmit = (e) => {
  e.preventDefault();
  action("Connecting identity…", async () => {
    const token = new FormData(e.target).get("token"),
      u = await api("/me", "GET", undefined, token);
    accounts = accounts.filter((a) => a.id !== u.id);
    accounts.push({ ...u, token });
    active = u.id;
    chosenPortfolio = null;
    save();
    await loadPortfolio();
    $("#account-dialog").close();
    await render();
  });
};
$("#account-select").onchange = (e) =>
  action("Switching investor…", async () => {
    active = e.target.value;
    chosenPortfolio = null;
    save();
    if (current()) await loadPortfolio();
    else portfolio = null;
    batch = null;
    $("#account-dialog").close();
    await render();
  });
$("#forget-account").onclick = () =>
  action("Signing out…", async () => {
    active = null;
    portfolio = null;
    save();
    $("#account-dialog").close();
    await render();
  });
window.addEventListener("hashchange", () => {
  if (!busy) action("Opening workspace…", render);
});
(async () => {
  try {
    config = await api("/app-config");
    $("#data-badge").textContent = config.provider;
    if (current()) await loadPortfolio();
    await render();
  } catch (e) {
    $("#main").innerHTML =
      heading(
        "Let’s reconnect your workspace.",
        "Could not load the saved account or database.",
      ) +
      `<section class="panel"><p>${esc(e.message)}</p><button class="button primary" data-action="accounts">Manage accounts</button></section>`;
    toast(e.message, true);
  }
})();
