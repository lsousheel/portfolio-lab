import { pool, rows } from "../src/db.js";
const db = pool(true);
try {
  const result = await rows(db, "SELECT cash FROM portfolios WHERE id=?", [
    process.argv[2],
  ]);
  console.log(JSON.stringify(result));
} finally {
  await db.end();
}
