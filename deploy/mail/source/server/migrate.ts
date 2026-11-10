import { readFile } from "node:fs/promises";
import { pool } from "./db.js";
export async function migrate() {
  await pool.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
}
if (process.argv[1]?.endsWith("migrate.ts")) {
  await migrate();
  await pool.end();
  console.log("Database migrated");
}
