import { mkdir, readFile, writeFile, access, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) throw Error(cmd + " failed");
}
await mkdir(".local", { recursive: true });
if (!(await exists(".env")))
  await writeFile(
    ".env",
    (await readFile(".env.example", "utf8")).replace(
      "MAIL_CREDENTIAL_KEY=",
      "MAIL_CREDENTIAL_KEY=" + randomBytes(32).toString("hex"),
    ),
    { mode: 0o600 },
  );
let envText = await readFile(".env", "utf8");
if (/^MAIL_CREDENTIAL_KEY=\s*$/m.test(envText)) {
  envText = envText.replace(
    /^MAIL_CREDENTIAL_KEY=\s*$/m,
    "MAIL_CREDENTIAL_KEY=" + randomBytes(32).toString("hex"),
  );
  await writeFile(".env", envText, { mode: 0o600 });
}
await chmod(".env", 0o600);
dotenv.config({ quiet: true });
if (process.env.STALWART_URL !== "http://127.0.0.1:28083")
  throw Error("local:setup supports only the isolated local mail container");
if (!(await exists(".local/stalwart.env")))
  await writeFile(
    ".local/stalwart.env",
    "STALWART_RECOVERY_ADMIN=admin:" + randomBytes(32).toString("hex") + "\n",
    { mode: 0o600 },
  );
await chmod(".local/stalwart.env", 0o600);
run("docker", ["compose", "--profile", "mail", "up", "-d", "--wait"]);
const credential = (await readFile(".local/stalwart.env", "utf8"))
  .trim()
  .slice(24);
async function call(method, args) {
  const r = await fetch("http://127.0.0.1:28083/jmap/", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(credential).toString("base64"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      methodCalls: [[method, args, "c"]],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error("Stalwart HTTP " + r.status);
  return r.json();
}
let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    await call("x:Bootstrap/get", {});
    ready = true;
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!ready) throw Error("Stalwart did not become ready");
const bootstrap = await call("x:Bootstrap/get", {});
if (bootstrap.methodResponses?.[0]?.[1]?.list?.length) {
  const result = await call("x:Bootstrap/set", {
    update: {
      singleton: {
        serverHostname: "mail.axis.test",
        defaultDomain: "axis.test",
        requestTlsCertificate: false,
        generateDkimKeys: false,
      },
    },
  });
  if (!result.methodResponses?.[0]?.[1]?.updated)
    throw Error("Stalwart bootstrap failed");
  await writeFile(".local/stalwart-bootstrap.json", JSON.stringify(result), {
    mode: 0o600,
  });
  run("docker", ["compose", "--profile", "mail", "restart", "stalwart"]);
}
run("npm", ["run", "seed"]);
for (let i = 0; i < 30; i++) {
  try {
    const r = await call("x:Domain/get", {});
    if (r.methodResponses?.[0]?.[1]?.list) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
run("npm", ["run", "mail:seed"]);
console.log(
  "\nГотово. Запуск: npm run dev:all\nЛогины и временные пароли: .local/ACCESS.md\nStalwart создаст ящики автоматически после запуска backend.",
);
