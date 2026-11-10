import "dotenv/config";
import { buildApp } from "./app.js";
import { migrate } from "./migrate.js";
import { startWorkers } from "./workers.js";
import { pool } from "./db.js";
await migrate();
const app = await buildApp();
await app.listen({
  port: Number(process.env.PORT ?? 4100),
  host: process.env.HOST ?? "127.0.0.1",
});
const stop = startWorkers();
console.log(
  `TeamSpace Mail API: http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 4100}`,
);
const close = async () => {
  stop();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", close);
process.on("SIGINT", close);
