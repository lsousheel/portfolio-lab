import { services } from "./config.js";
import { app } from "./api.js";
const { db, trading, analysis } = services();
const server = app(trading, analysis).listen(
  Number(process.env.PORT || 3000),
  "0.0.0.0",
  () => console.log("Simulated finance API listening; no brokerage connection"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      void db.end().then(() => process.exit(0));
    }),
  );
