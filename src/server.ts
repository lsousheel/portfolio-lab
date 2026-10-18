import { services } from "./config.js";
import { app } from "./api.js";
const { db, trading, analysis } = services();
const port = Number(process.env.PORT || 3000);
const server = app(trading, analysis).listen(
  port,
  "0.0.0.0",
  (error?: Error) => {
    if (error) {
      console.error(`Could not start Portfolio Lab on port ${port}: ${error.message}`);
      console.error("Stop the older server on this port, then run npm start again.");
      void db.end().finally(() => process.exit(1));
      return;
    }
    console.log(`Portfolio Lab is running at http://localhost:${port}`);
    console.log("Keep this terminal open. Press Ctrl+C to stop. Simulated trading only.");
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      void db.end().then(() => process.exit(0));
    }),
  );
