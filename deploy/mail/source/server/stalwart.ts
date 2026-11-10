import { readFile } from "node:fs/promises";
import { query, fail, pool } from "./db.js";
import { encrypt, decrypt, token, digest } from "./security.js";
const caps = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];
export async function withProvisioningLock<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const connection = await pool.connect();
  let locked = false;
  try {
    locked = (
      await connection.query("SELECT pg_try_advisory_lock(731824916) AS locked")
    ).rows[0].locked;
    if (!locked)
      fail(
        503,
        "MAIL_BUSY",
        "Почтовые аккаунты обновляются. Повторите через несколько секунд.",
      );
    return await fn();
  } finally {
    try {
      if (locked)
        await connection.query("SELECT pg_advisory_unlock(731824916)");
    } finally {
      connection.release();
    }
  }
}

export async function managementAuthorization() {
  if (process.env.STALWART_API_KEY_FILE) {
    const key = (
      await readFile(process.env.STALWART_API_KEY_FILE, "utf8")
    ).trim();
    if (!key || /[\r\n]/.test(key))
      fail(503, "MAIL_CONFIG", "Некорректный ключ управления Stalwart");
    return "Bearer " + key;
  }
  if (!process.env.STALWART_ADMIN_FILE)
    fail(503, "MAIL_CONFIG", "Не настроен канал управления Stalwart");
  const raw = (await readFile(process.env.STALWART_ADMIN_FILE, "utf8")).trim();
  const credential = raw.startsWith("STALWART_RECOVERY_ADMIN=")
    ? raw.slice(24)
    : raw;
  return "Basic " + Buffer.from(credential).toString("base64");
}

export async function management(calls: any[]) {
  const base = process.env.STALWART_URL;
  if (!base) fail(503, "MAIL_CONFIG", "Не настроен канал управления Stalwart");
  const r = await fetch(new URL("/jmap/", base), {
    method: "POST",
    headers: {
      Authorization: await managementAuthorization(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ using: caps, methodCalls: calls }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("Stalwart management HTTP " + r.status);
  const b: any = await r.json();
  for (const v of b.methodResponses ?? []) {
    if (
      v[0] === "error" ||
      Object.keys(v[1].notCreated ?? {}).length ||
      Object.keys(v[1].notUpdated ?? {}).length ||
      Object.keys(v[1].notDestroyed ?? {}).length
    )
      throw new Error("Stalwart management operation failed: " + v[0]);
  }
  return b.methodResponses;
}
export function mailAuthorization(secret: string) {
  const raw = decrypt(secret);
  if (raw.startsWith("{")) {
    const c = JSON.parse(raw);
    return (
      "Basic " + Buffer.from(c.login + ":" + c.password).toString("base64")
    );
  }
  return "Bearer " + raw;
}
export async function syncStalwart(memberId?: string) {
  if (
    process.env.MAIL_MODE !== "stalwart" ||
    process.env.STALWART_PROVISIONING_ENABLED === "false"
  )
    return;
  return withProvisioningLock(() => syncManagedAccounts(memberId));
}
async function syncManagedAccounts(memberId?: string) {
  if (
    !(await query("SELECT id FROM memberships WHERE mail_managed=true LIMIT 1"))
      .length
  )
    return;
  const domains = await query(
    "SELECT d.* FROM domains d WHERE d.verified=true AND ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM memberships m WHERE m.id=$1 AND m.tenant_id=d.tenant_id AND split_part(m.email,'@',2)=d.name)) ORDER BY d.name",
    [memberId ?? null],
  );
  const list = (
    await management([["x:Domain/get", { properties: ["id", "name"] }, "d"]])
  )[0][1].list;
  for (const d of domains) {
    const current = list.find((x: any) => x.name === d.name);
    const id =
      current?.id ??
      (
        await management([
          [
            "x:Domain/set",
            {
              create: {
                new: {
                  name: d.name,
                  certificateManagement: { "@type": "Manual" },
                  dnsManagement: { "@type": "Manual" },
                  dkimManagement: { "@type": "Automatic" },
                },
              },
            },
            "d",
          ],
        ])
      )[0][1].created.new.id;
    await query("UPDATE domains SET stalwart_id=$1 WHERE id=$2", [id, d.id]);
    d.stalwart_id = id;
  }
  const members = await query(
    "SELECT m.*,u.name,u.active AS identity_active,t.status AS tenant_status FROM memberships m JOIN identities u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.mail_managed=true AND ($1::uuid IS NULL OR m.id=$1) ORDER BY m.id",
    [memberId ?? null],
  );
  for (const m of members) {
    const active =
      m.status === "active" &&
      m.tenant_status === "active" &&
      m.identity_active;
    let hash = digest(
      JSON.stringify(["display-name-v2", m.email, m.quota_mb, active, m.name]),
    );
    if (hash === m.mail_sync_hash && !m.mail_auth_failed && !m.mail_pending_email) continue;
    // Failed authentication requires an explicit administrator retry, not a
    // password reset every five seconds in the background.
    if (m.mail_auth_failed && !memberId && !m.mail_pending_email) continue;
    try {
      if (m.mail_pending_email) {
        const { reconcileMailboxAddress } = await import("./mail-address.js");
        await reconcileMailboxAddress(m, domains);
        hash = digest(JSON.stringify(["display-name-v2", m.email, m.quota_mb, active, m.name]));
      }
      const domain = domains.find(
        (d) => d.tenant_id === m.tenant_id && d.name === m.email.split("@")[1],
      );
      if (!domain) throw new Error("Домен не подтверждён");
      if (!m.mail_secret) {
        m.mail_secret = encrypt(
          JSON.stringify({ type: "basic", login: m.email, password: token() }),
        );
        await query("UPDATE memberships SET mail_secret=$1 WHERE id=$2", [
          m.mail_secret,
          m.id,
        ]);
      }
      const secret = JSON.parse(decrypt(m.mail_secret));
      const payload: any = {
        name: m.email.split("@")[0],
        domainId: domain.stalwart_id,
        description: m.name,
        roles: { "@type": "User" },
        quotas: { maxDiskQuota: m.quota_mb * 1048576 },
        credentials: { "0": { "@type": "Password", secret: secret.password } },
        permissions: {
          "@type": "Merge",
          disabledPermissions: Object.fromEntries(
            (active
              ? [
                  "imapAuthenticate",
                  "pop3Authenticate",
                  "sieveAuthenticate",
                  "jmapIdentityCreate",
                  "jmapIdentityUpdate",
                  "jmapIdentityDestroy",
                ]
              : ["authenticate"]
            ).map((x) => [x, true]),
          ),
        },
      };
      let oid = m.mail_object_id;
      if (!oid) {
        const all = (
          await management([
            [
              "x:Account/get",
              { properties: ["id", "name", "domainId", "description"] },
              "a",
            ],
          ])
        )[0][1].list;
        const found = all.find(
          (x: any) =>
            x.name === payload.name && x.domainId === payload.domainId,
        );
        if (
          found &&
          !found.description?.startsWith(`Axis membership ${m.id}:`)
        ) {
          // Recover only an account that accepts our previously persisted secret.
          // A matching human name is never evidence of ownership.
          const proof = await discoverSession(m.mail_secret);
          if (!proof.ok)
            throw new Error("Адрес уже занят ящиком вне управления TeamSpace");
        }
        oid = found?.id;
      }
      const { guardWorkspaceMailboxQuota } = await import("./mail-budget.js");
      await guardWorkspaceMailboxQuota(m.tenant_id, oid, m.quota_mb * 1048576, m.id);
      if (oid)
        await management([
          ["x:Account/set", { update: { [oid]: payload } }, "u"],
        ]);
      else
        oid = (
          await management([
            [
              "x:Account/set",
              { create: { new: { "@type": "User", ...payload } } },
              "c",
            ],
          ])
        )[0][1].created.new.id;
      await query("UPDATE memberships SET mail_object_id=$1 WHERE id=$2", [
        oid,
        m.id,
      ]);
      let account = m.mail_account_id;
      if (active) {
        const r = await discoverSession(m.mail_secret);
        if (!r.ok) throw new Error("Не удалось войти в созданный ящик");
        const s: any = await r.json();
        account = s.primaryAccounts["urn:ietf:params:jmap:mail"];
      }
      await query(
        "UPDATE memberships SET mail_backend='stalwart',mail_account_id=$1,mail_sync_hash=$2,mail_error=null,mail_auth_failed=false WHERE id=$3",
        [account, hash, m.id],
      );
    } catch (e: any) {
      await query("UPDATE memberships SET mail_error=$1 WHERE id=$2", [
        e.message.slice(0, 400),
        m.id,
      ]);
    }
  }
}

export function mailboxStatus(m: any) {
  if (m.mail_backend === "stalwart" && m.mail_account_id && m.mail_secret)
    return m.mail_error ? "error" : "ready";
  if (process.env.MAIL_MODE !== "stalwart") return "local";
  if (m.mail_error) return "error";
  if (process.env.STALWART_PROVISIONING_ENABLED === "false")
    return "unconnected";
  return "pending";
}

// The membership is committed first, so an upstream outage can be retried
// without losing the user or inviting a duplicate account creation.
export async function provisionMemberNow(memberId: string) {
  try {
    await syncStalwart(memberId);
  } catch (error: any) {
    if (error.code !== "MAIL_BUSY")
      await query("UPDATE memberships SET mail_error=$1 WHERE id=$2", [
        "Не удалось создать почтовый ящик. Повторите подключение.",
        memberId,
      ]);
  }
  const [member] = await query("SELECT * FROM memberships WHERE id=$1", [
    memberId,
  ]);
  return { status: mailboxStatus(member) };
}

export async function discoverSession(secret: string) {
  const base = new URL(process.env.STALWART_URL!);
  let u = new URL("/.well-known/jmap", base);
  for (let i = 0; i < 4; i++) {
    const r = await fetch(u, {
      headers: { Authorization: mailAuthorization(secret) },
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
    if (![301, 302, 303, 307, 308].includes(r.status)) return r;
    const next = new URL(r.headers.get("location") ?? "", u);
    if (next.origin !== base.origin)
      fail(502, "MAIL_ORIGIN", "Недопустимое перенаправление JMAP");
    u = next;
  }
  fail(502, "MAIL_REDIRECT", "Слишком много перенаправлений JMAP");
}
