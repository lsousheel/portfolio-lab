// Real server process restart and API persistence smoke. Requires built code + migrated pf DB.
import { spawn } from "node:child_process";
const port = 3101,
  base = `http://127.0.0.1:${port}`;
let server;
async function start() {
  server = spawn(process.execPath, ["dist/src/server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Server exited");
    try {
      const r = await fetch(base + "/health");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Server startup timeout");
}
async function stop() {
  if (server && server.exitCode === null) {
    const done = new Promise((r) => server.once("exit", r));
    server.kill();
    await done;
  }
}
async function api(path, method = "GET", body, token, key) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
try {
  await start();
  const u = await api("/users", "POST", { name: "Restart smoke" }),
    p = await api("/portfolios", "POST", { horizon: 2 }, u.token);
  await api(
    `/portfolios/${p.id}/funds`,
    "POST",
    { amount: "123.45" },
    u.token,
    "fund",
  );
  await stop();
  await start();
  const stored = await api(`/portfolios/${p.id}`, "GET", undefined, u.token);
  if (stored.cash !== "123.45") throw Error("Persistence mismatch");
  console.log(
    "PASS: real API process stopped/restarted; authenticated account retains 123.45 cash.",
  );
} finally {
  await stop();
}
