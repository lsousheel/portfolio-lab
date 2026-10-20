import mysql, { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import "dotenv/config";
export type DB = Pool | PoolConnection;
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function pool(test = false) {
  if (process.env.VERCEL) {
    for (const key of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
      if (!process.env[key])
        throw Error(`Missing hosted database setting: ${key}`);
    }
    if (["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST!))
      throw Error("Vercel requires a hosted MySQL database, not localhost");
    if (process.env.DB_SSL !== "true")
      throw Error("Set DB_SSL=true for the hosted database");
  }
  const db =
    process.env[test ? "TEST_DB_NAME" : "DB_NAME"] || (test ? "pf_test" : "pf");
  if (test && !db.endsWith("_test"))
    throw Error("Test database must end in _test");
  const result = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || "pf",
    password: process.env.DB_PASSWORD || "local-demo-only",
    database: db,
    connectionLimit: process.env.VERCEL ? 2 : 8,
    ssl:
      process.env.DB_SSL === "true"
        ? {
            rejectUnauthorized: true,
            ...(process.env.DB_SSL_CA
              ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") }
              : {}),
          }
        : undefined,
    dateStrings: true,
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  // Driver conversion timezone does not set the MySQL session timezone.
  // Queue this before any query on each newly created connection.
  result.on("connection", (connection) => {
    connection.query("SET time_zone = '+00:00'");
  });
  return result;
}
export async function rows(
  db: DB,
  sql: string,
  args: (string | number | boolean | null)[] = [],
): Promise<any[]> {
  const [r] = await db.execute<RowDataPacket[]>(sql, args);
  return r;
}
export async function transaction<T>(
  db: Pool,
  fn: (c: PoolConnection) => Promise<T>,
) {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export async function migrate(db: Pool) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
  );
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("migrations/" + name, "utf8"),
      checksum = hash(sql.replace(/\r\n/g, "\n"));
    const existing = await rows(
      db,
      "SELECT checksum FROM migrations WHERE name=?",
      [name],
    );
    if (existing.length) {
      if (existing[0].checksum !== checksum)
        throw Error("Migration checksum mismatch: " + name);
      continue;
    }
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await db.query(statement);
    await db.execute("INSERT INTO migrations(name,checksum) VALUES(?,?)", [
      name,
      checksum,
    ]);
  }
}
