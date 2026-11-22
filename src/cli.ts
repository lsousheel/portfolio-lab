import { services } from "./config.js";
import { migrate, rows } from "./db.js";
import { CSV_SYMBOLS } from "./csv-market.js";
import { logQuotes } from "./quote-log.js";
import { monitorPortfolio } from "./monitoring.js";
const { db, trading, finnhub } = services();
try {
  const command = process.argv[2];
  if (command === "migrate") {
    await migrate(db);
    console.log("Migrations applied");
  } else if (command === "quotes") {
    // npm run quotes -- [rounds] [seconds between rounds] [output file]
    const rounds = Number(process.argv[3] || 1),
      seconds = Number(process.argv[4] || 120),
      file = process.argv[5] || "data/realtime/realtime-quotes.csv";
    if (!process.env.FINNHUB_API_KEY) throw Error("Set FINNHUB_API_KEY in .env first");
    const result = await logQuotes({
      symbols: CSV_SYMBOLS,
      quote: (s) => finnhub.quote(s),
      file,
      rounds,
      intervalMs: seconds * 1000,
      spacingMs: 3200,
    });
    console.log(`Done. ${result.written} rows added to ${file}, ${result.failed} skipped.`);
  } else if (command === "watch") {
    // npm run watch -- <portfolio id> [seconds between checks] [checks]
    const id = process.argv[3],
      seconds = Number(process.argv[4] || 60),
      checks = Number(process.argv[5] || 1000);
    if (!id) throw Error("Usage: npm run watch -- <portfolio id> [seconds] [checks]");
    const owner = (await rows(db, "SELECT user_id FROM portfolios WHERE id=?", [id]))[0];
    if (!owner) throw Error("Portfolio not found");
    for (let i = 0; i < checks; i++) {
      const m = await monitorPortfolio(trading, owner.user_id, id);
      console.log(`[${m.checkedAt}] ${m.summary}`);
      for (const l of m.lines)
        console.log(
          `   ${l.symbol.padEnd(6)} ${String(l.quantity).padStart(4)} sh  paid ${l.avgCost}  now ${l.price ?? "n/a"}  gain ${l.gain ?? "n/a"} (${l.gainPct ?? "n/a"}%)  ${l.status}`,
        );
      if (i < checks - 1) await new Promise((r) => setTimeout(r, seconds * 1000));
    }
  } else
    throw Error(
      "Use migrate, quotes [rounds] [seconds] [file], or watch <portfolio id> [seconds] [checks]",
    );
} finally {
  await db.end();
}
