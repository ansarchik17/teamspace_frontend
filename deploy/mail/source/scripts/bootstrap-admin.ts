import "dotenv/config";
import { migrate } from "../server/migrate.js";
import { pool, tx } from "../server/db.js";
import { hashPassword, validatePassword } from "../server/security.js";

try {
  const [login, name = "Администратор платформы"] = process.argv.slice(2);
  if (!login || login.length > 128 || name.length > 100)
    throw Error(
      "Usage: bootstrap-admin.ts LOGIN [NAME]; provide password on stdin",
    );
  if (process.stdin.isTTY)
    throw Error("Provide password through stdin, not a command-line argument");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 1024) throw Error("Password input is too long");
    chunks.push(bytes);
  }
  const password = Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
  validatePassword(password);
  await migrate();
  const hash = await hashPassword(password);
  await tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(731824917)");
    if (
      (
        await db.query(
          "SELECT id FROM identities WHERE platform_admin=true LIMIT 1",
        )
      ).rows.length
    )
      throw Error(
        "A platform administrator already exists; no account was changed",
      );
    await db.query(
      "INSERT INTO identities(login,name,password_hash,platform_admin,must_change) VALUES($1,$2,$3,true,true)",
      [login, name, hash],
    );
  });
  console.log(
    "Platform administrator created. Change the temporary password at first login.",
  );
} catch (error: any) {
  console.error(
    error.code === "23505"
      ? "Login already exists; no account was changed"
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
