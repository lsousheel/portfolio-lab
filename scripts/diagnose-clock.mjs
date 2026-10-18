import { pool, rows } from "../dist/src/db.js";
import { Trading } from "../dist/src/trading.js";
import { OfflineProvider } from "../dist/src/providers.js";
const db = pool(true),
  t = new Trading(db, new OfflineProvider());
try {
  const u = await t.user("Clock diagnostic"),
    p = await t.portfolio(u.id, 1);
  for (let i = 0; i < 12; i++) {
    const o = await t.submit(
      u.id,
      p.id,
      { symbol: "AAPL", side: "BUY", quantity: 1 },
      "clock-" + i,
    );
    const now = new Date();
    const [r] = await rows(db, "SELECT created_at FROM orders WHERE id=?", [
      o.id,
    ]);
    console.log({
      created: r.created_at,
      cutoff: now.toISOString(),
      aheadMs: Date.parse(r.created_at + "Z") - now.getTime(),
    });
  }
} finally {
  await db.end();
}
