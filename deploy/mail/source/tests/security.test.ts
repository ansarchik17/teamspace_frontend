import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../server/app.js";
import { pool, query } from "../server/db.js";
import { migrate } from "../server/migrate.js";
import {
  hashPassword,
  token,
  digest,
  validatePassword,
} from "../server/security.js";
import { quotaTick } from "../server/workers.js";

if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
  throw new Error("Tests require a separate *_test database");
process.env.MAIL_MODE = "local";
delete process.env.AI_BASE_URL;
let app: Awaited<ReturnType<typeof buildApp>>;
let tenantA: string, tenantB: string;
const members: any = {};
const pass = "Test1234";
class Client {
  cookie = "";
  csrf = "";
  async call(url: string, method: any = "GET", body?: any, headers: any = {}) {
    const r = await app.inject({
      url: "/api" + url,
      method,
      payload: body,
      headers: {
        cookie: this.cookie,
        ...(method !== "GET" ? { "x-csrf-token": this.csrf } : {}),
        ...headers,
      },
    });
    let data: any;
    try {
      data = r.json();
    } catch {
      data = r.body;
    }
    return { status: r.statusCode, data, headers: r.headers };
  }
  async login(login: string) {
    const r = await this.call("/auth/login", "POST", { login, password: pass });
    assert.equal(r.status, 200);
    this.cookie = String(r.headers["set-cookie"]).split(";")[0];
    const s = await this.call("/session");
    this.csrf = s.data.csrf;
    return s.data;
  }
}
let a: Client, b: Client, hr: Client, admin: Client, platform: Client;
before(async () => {
  await migrate();
  await query("TRUNCATE identities,tenants CASCADE");
  [tenantA, tenantB] = (
    await query(
      "INSERT INTO tenants(name,slug,quota_mb) VALUES('Alpha','alpha',1024),('Beta','beta',1024) RETURNING id",
    )
  ).map((x) => x.id);
  for (const [tid, name] of [
    [tenantA, "alpha.test"],
    [tenantB, "beta.test"],
  ])
    await query(
      "INSERT INTO domains(tenant_id,name,verification_token,verified) VALUES($1,$2,$3,true)",
      [tid, name, token()],
    );
  const hash = await hashPassword(pass);
  for (const [login, name, role, tid, email, platformAdmin] of [
    ["100000000001", "Alice", "user", tenantA, "alice@alpha.test", false],
    ["100000000002", "Bob", "user", tenantB, "bob@beta.test", false],
    ["100000000003", "HR", "hr", tenantA, "hr@alpha.test", false],
    [
      "100000000004",
      "Admin",
      "tenant_admin",
      tenantA,
      "admin@alpha.test",
      false,
    ],
    [
      "100000000005",
      "Platform",
      "tenant_admin",
      tenantB,
      "platform@beta.test",
      true,
    ],
  ]) {
    const [u] = await query(
      "INSERT INTO identities(login,name,password_hash,must_change,platform_admin) VALUES($1,$2,$3,false,$4) RETURNING id",
      [login, name, hash, platformAdmin],
    );
    const [m] = await query(
      "INSERT INTO memberships(tenant_id,user_id,role,email,quota_mb) VALUES($1,$2,$3,$4,10) RETURNING *",
      [tid, u.id, role, email],
    );
    members[name as string] = { ...m, userId: u.id };
    await query(
      "INSERT INTO consents(tenant_id,user_id,version,text_hash,document_text,accepted) VALUES($1,$2,1,$3,'test',true)",
      [tid, u.id, digest("test")],
    );
  }
  app = await buildApp();
  a = new Client();
  b = new Client();
  hr = new Client();
  admin = new Client();
  platform = new Client();
  await a.login("100000000001");
  await b.login("100000000002");
  await hr.login("100000000003");
  await admin.login("100000000004");
  await platform.login("100000000005");
});
after(async () => {
  await app?.close();
  await pool.end();
});
test("calendar routes enforce sessions and CSRF before contacting Stalwart", async () => {
  for (const path of [
    "/calendar/events?after=2026-09-01T00:00:00Z&before=2026-10-01T00:00:00Z",
    "/calendar/events/example",
    "/calendar/events/example/ics",
  ]) {
    assert.equal((await new Client().call(path)).status, 401);
  }
  for (const [path, method] of [
    ["/calendar/events", "POST"],
    ["/mail/meeting", "POST"],
    ["/calendar/events/example", "PUT"],
    ["/calendar/events/example", "DELETE"],
    ["/calendar/events/example/rsvp", "POST"],
  ]) {
    const r = await a.call(path, method, {}, { "x-csrf-token": "wrong" });
    assert.equal(r.status, 403);
    assert.equal(r.data.code, "CSRF");
  }
  assert.equal(
    (
      await a.call(
        "/calendar/events?after=2026-09-01T00:00:00Z&before=2026-10-01T00:00:00Z",
      )
    ).data.code,
    "CALENDAR_NOT_CONNECTED",
  );
});
test("unauthenticated mailbox access is denied", async () => {
  assert.equal((await new Client().call("/mail/messages")).status, 401);
});
test("incorrect login returns a generic error", async () => {
  const r = await new Client().call("/auth/login", "POST", {
    login: "not-existing",
    password: pass,
  });
  assert.equal(r.status, 401);
  assert.equal(r.data.code, "INVALID_CREDENTIALS");
});
test("CSRF token required on mutations", async () => {
  const r = await a.call(
    "/profile",
    "PATCH",
    { signature: "x" },
    { "x-csrf-token": "bad" },
  );
  assert.equal(r.status, 403);
  assert.equal(r.data.code, "CSRF");
});
test("foreign origin is rejected", async () => {
  assert.equal(
    (
      await a.call(
        "/profile",
        "PATCH",
        { signature: "x" },
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
});
test("ordinary user cannot list personnel or platform companies", async () => {
  assert.equal((await a.call("/members")).status, 403);
  assert.equal((await a.call("/platform/tenants")).status, 403);
});
test("HR sees only own company and cannot assign privileged roles", async () => {
  const list = await hr.call("/members");
  assert.ok(list.data.every((m: any) => m.email.endsWith("@alpha.test")));
  const r = await hr.call("/members", "POST", {
    login: "100000000006",
    name: "Escalation",
    email: "e@alpha.test",
    password: pass,
    role: "tenant_admin",
    quota_mb: 1,
  });
  assert.equal(r.status, 403);
  assert.equal(
    (
      await hr.call("/members/" + members.Admin.id, "PATCH", {
        status: "suspended",
      })
    ).status,
    403,
  );
});
test("cannot select a tenant without membership", async () => {
  assert.equal(
    (await a.call("/session/tenant", "POST", { tenantId: tenantB })).status,
    403,
  );
});
test("tenant admin cannot mutate another tenant member", async () => {
  assert.equal(
    (
      await admin.call("/members/" + members.Bob.id, "PATCH", {
        status: "suspended",
      })
    ).status,
    404,
  );
});
test("company domain ownership is enforced during provisioning", async () => {
  const r = await admin.call("/members", "POST", {
    login: "100000000006",
    name: "Wrong domain",
    email: "e@beta.test",
    password: pass,
    role: "user",
    quota_mb: 1,
  });
  assert.equal(r.status, 400);
});
test("quota allocation cannot exceed company budget", async () => {
  const r = await admin.call("/members", "POST", {
    login: "100000000006",
    name: "Too big",
    email: "e@alpha.test",
    password: pass,
    role: "user",
    quota_mb: 5000,
  });
  assert.equal(r.data.code, "TENANT_QUOTA");
});
let sent: string, incoming: string;
test("local cross-company mail delivery creates separate copies and hides BCC", async () => {
  const r = await a.call(
    "/mail/send",
    "POST",
    {
      to: ["bob@beta.test"],
      bcc: ["hr@alpha.test"],
      subject: "Integration message",
      body: "Hello from Alpha",
      attachmentIds: [],
    },
    { "idempotency-key": "integration-delivery" },
  );
  assert.equal(r.status, 200);
  sent = r.data.id;
  const list = await b.call("/mail/messages?folder=inbox");
  assert.equal(list.data.items.length, 1);
  incoming = list.data.items[0].id;
  assert.notEqual(sent, incoming);
  const mail = await b.call("/mail/messages/" + incoming);
  assert.deepEqual(mail.data.bcc, []);
  assert.equal(mail.data.body, "Hello from Alpha");
});
test("a second user cannot read sender or recipient message by ID", async () => {
  assert.equal((await b.call("/mail/messages/" + sent)).status, 404);
  assert.equal((await a.call("/mail/messages/" + incoming)).status, 404);
  assert.equal((await admin.call("/mail/messages/" + sent)).status, 404);
});
test("send retry with same idempotency key does not duplicate", async () => {
  const r = await a.call(
    "/mail/send",
    "POST",
    {
      to: ["bob@beta.test"],
      bcc: ["hr@alpha.test"],
      subject: "Integration message",
      body: "Hello from Alpha",
      attachmentIds: [],
    },
    { "idempotency-key": "integration-delivery" },
  );
  assert.equal(r.data.id, sent);
  assert.equal((await b.call("/mail/messages")).data.total, 1);
});
test("same idempotency key with different content is rejected", async () => {
  const r = await a.call(
    "/mail/send",
    "POST",
    { to: ["bob@beta.test"], subject: "Different", body: "Different" },
    { "idempotency-key": "integration-delivery" },
  );
  assert.equal(r.status, 409);
});
test("external mail is not falsely marked delivered in local mode", async () => {
  const r = await a.call(
    "/mail/send",
    "POST",
    { to: ["outside@example.com"], subject: "External", body: "test" },
    { "idempotency-key": "external-delivery" },
  );
  assert.equal(r.status, 409);
  assert.equal(r.data.code, "EXTERNAL_MAIL_UNAVAILABLE");
});
test("draft edits and moving mail are ownership-scoped", async () => {
  const d = await a.call("/mail/drafts", "POST", {
    to: [],
    subject: "Draft",
    body: "Version one",
  });
  assert.equal(d.status, 200);
  assert.equal(
    (
      await b.call("/mail/drafts", "POST", {
        to: [],
        subject: "Stolen",
        body: "x",
        draftId: d.data.id,
      })
    ).status,
    404,
  );
  assert.equal(
    (await b.call("/mail/messages/" + sent, "PATCH", { folder: "trash" }))
      .status,
    404,
  );
});
test("foreign attachments cannot be referenced or downloaded", async () => {
  const [f] = await query(
    "INSERT INTO attachments(tenant_id,mailbox_id,filename,content_type,data,size_bytes) VALUES($1,$2,'secret.txt','text/plain',$3,6) RETURNING id",
    [tenantA, members.Alice.id, Buffer.from("secret")],
  );
  assert.equal((await b.call("/mail/attachments/" + f.id)).status, 404);
  const r = await b.call(
    "/mail/send",
    "POST",
    {
      to: ["alice@alpha.test"],
      subject: "bad",
      body: "bad",
      attachmentIds: [f.id],
    },
    { "idempotency-key": "foreign-attachment" },
  );
  assert.equal(r.status, 404);
});
test("password expiry blocks an already authenticated session", async () => {
  await query(
    "UPDATE identities SET password_changed_at=now()-interval '100 days' WHERE id=$1",
    [members.Alice.userId],
  );
  assert.equal(
    (await a.call("/mail/messages")).data.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  await query("UPDATE identities SET password_changed_at=now() WHERE id=$1", [
    members.Alice.userId,
  ]);
});
test("consent change gates mailbox API server-side", async () => {
  await query("UPDATE tenants SET consent_version=2 WHERE id=$1", [tenantA]);
  assert.equal((await a.call("/mail/messages")).data.code, "CONSENT_REQUIRED");
  assert.equal(
    (await a.call("/consent", "POST", { version: 1, accepted: true })).status,
    409,
  );
  assert.equal(
    (await a.call("/consent", "POST", { version: 2, accepted: true })).status,
    200,
  );
  assert.equal((await a.call("/mail/messages")).status, 200);
  await query("UPDATE tenants SET consent_version=1 WHERE id=$1", [tenantA]);
});
test("provisioned users must change temporary password and accept consent", async () => {
  const r = await admin.call("/members", "POST", {
    login: "100000000006",
    name: "New user",
    email: "new@alpha.test",
    password: pass,
    role: "user",
    quota_mb: 1,
  });
  assert.equal(r.status, 200);
  const user = new Client();
  const s = await user.login("100000000006");
  assert.equal(s.passwordRequired, true);
  assert.equal(
    (await user.call("/mail/messages")).data.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  assert.equal(
    (
      await user.call("/auth/password", "POST", {
        currentPassword: pass,
        password: pass,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await user.call("/auth/password", "POST", {
        currentPassword: pass,
        password: "New-strong-password-456",
      })
    ).status,
    200,
  );
  assert.equal(
    (await user.call("/mail/messages")).data.code,
    "CONSENT_REQUIRED",
  );
  await user.call("/consent", "POST", { version: 1, accepted: true });
  assert.equal((await user.call("/mail/messages")).status, 200);
});
test("blocking member revokes its existing sessions", async () => {
  await admin.call("/members/" + members.HR.id, "PATCH", {
    status: "suspended",
  });
  assert.equal((await hr.call("/mail/messages")).status, 401);
});
test("quota worker creates one Russian notification per crossing", async () => {
  await query("UPDATE memberships SET quota_mb=1 WHERE id=$1", [
    members.Bob.id,
  ]);
  await query("UPDATE messages SET size_bytes=900000 WHERE id=$1", [incoming]);
  await quotaTick();
  await quotaTick();
  const r = await b.call("/notifications");
  assert.equal(r.data.filter((x: any) => x.kind === "quota").length, 1);
  assert.match(r.data[0].title, /80%/);
});
test("mail delivery respects recipient hard quota", async () => {
  const r = await a.call(
    "/mail/send",
    "POST",
    { to: ["bob@beta.test"], subject: "quota", body: "a".repeat(200000) },
    { "idempotency-key": "quota-delivery" },
  );
  assert.equal(r.data.code, "QUOTA_EXCEEDED");
});
test("AI requires both company policy and configured provider", async () => {
  const r = await a.call("/ai/jobs", "POST", {
    messageId: sent,
    kind: "summary",
  });
  assert.equal(r.data.code, "AI_DISABLED");
  await query("UPDATE tenants SET ai_enabled=true WHERE id=$1", [tenantA]);
  assert.equal(
    (await a.call("/ai/jobs", "POST", { messageId: sent, kind: "summary" }))
      .data.code,
    "AI_NOT_CONFIGURED",
  );
});
test("audit and contacts do not expose other-company identities", async () => {
  const contacts = await a.call("/mail/contacts");
  assert.ok(contacts.data.every((x: any) => x.email.endsWith("@alpha.test")));
  const logs = await admin.call("/audit");
  assert.ok(logs.data.every((x: any) => x.tenant_id === tenantA));
});
test("platform admin manages tenants without mailbox impersonation", async () => {
  assert.equal((await platform.call("/platform/tenants")).data.length, 2);
  assert.equal((await platform.call("/mail/messages/" + sent)).status, 404);
});
test("same identity has independent roles and mailboxes in two companies", async () => {
  const [m] = await query(
    "INSERT INTO memberships(tenant_id,user_id,role,email,quota_mb) VALUES($1,$2,'tenant_admin','alice@beta.test',1) RETURNING id",
    [tenantB, members.Alice.userId],
  );
  await query(
    "INSERT INTO consents(tenant_id,user_id,version,text_hash,document_text,accepted) VALUES($1,$2,1,$3,'test',true)",
    [tenantB, members.Alice.userId, digest("test")],
  );
  assert.equal(
    (await a.call("/session/tenant", "POST", { tenantId: tenantB })).status,
    200,
  );
  assert.equal((await a.call("/session")).data.member.role, "tenant_admin");
  assert.equal((await a.call("/mail/messages/" + sent)).status, 404);
  assert.ok(
    (await a.call("/members")).data.every((x: any) =>
      x.email.endsWith("@beta.test"),
    ),
  );
  await a.call("/session/tenant", "POST", { tenantId: tenantA });
  assert.equal((await a.call("/session")).data.member.role, "user");
  assert.equal((await a.call("/members")).status, 403);
  assert.equal(
    (
      await admin.call(
        "/members/" + members.Alice.id + "/reset-password",
        "POST",
        { password: "Another-password-123" },
      )
    ).data.code,
    "GLOBAL_IDENTITY",
  );
});
test("AI cannot reference foreign messages or expose another user result", async () => {
  process.env.AI_BASE_URL = "http://127.0.0.1:1/v1";
  process.env.AI_MODEL = "test-only";
  assert.equal(
    (await a.call("/ai/jobs", "POST", { messageId: incoming, kind: "summary" }))
      .status,
    404,
  );
  const own = await a.call("/ai/jobs", "POST", {
    messageId: sent,
    kind: "summary",
  });
  assert.equal(own.status, 200);
  await query("UPDATE tenants SET ai_enabled=true WHERE id=$1", [tenantB]);
  assert.equal((await b.call("/ai/jobs/" + own.data.id)).status, 404);
  assert.equal((await admin.call("/ai/jobs/" + own.data.id)).status, 404);
  delete process.env.AI_BASE_URL;
});
test("quota notifications cover 95%, 100% and a new episode after cleanup", async () => {
  for (const size of [1000000, 1050000, 100, 900000]) {
    await query("UPDATE messages SET size_bytes=$1 WHERE id=$2", [
      size,
      incoming,
    ]);
    await quotaTick();
    await quotaTick();
  }
  const notifications = (await b.call("/notifications")).data.filter(
    (x: any) => x.kind === "quota",
  );
  assert.equal(notifications.length, 4);
  assert.ok(notifications.some((x: any) => x.title.includes("95%")));
  assert.ok(notifications.some((x: any) => x.title.includes("100%")));
});
test("platform supports 40 independent companies", async () => {
  for (let i = 0; i < 38; i++) {
    const r = await platform.call("/platform/tenants", "POST", {
      name: "Company " + i,
      slug: "company-" + i,
      quota_mb: 1000,
    });
    assert.equal(r.status, 200);
  }
  const all = await platform.call("/platform/tenants");
  assert.equal(all.data.length, 40);
  assert.equal((await a.call("/session")).data.memberships.length, 2);
});
test("only platform admin can reset a shared identity and all its sessions are revoked", async () => {
  assert.equal(
    (
      await admin.call(
        "/platform/identities/" + members.Alice.userId + "/reset-password",
        "POST",
        { password: "Global-temporary-456" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await platform.call(
        "/platform/identities/" + members.Alice.userId + "/reset-password",
        "POST",
        { password: "Global-temporary-456" },
      )
    ).status,
    200,
  );
  assert.equal((await a.call("/session")).status, 401);
  const [u] = await query("SELECT must_change FROM identities WHERE id=$1", [
    members.Alice.userId,
  ]);
  assert.equal(u.must_change, true);
});

test("existing mailbox connection validates identity, persists encrypted credentials and excludes provisioning", async () => {
  const originalFetch = globalThis.fetch;
  const previousUrl = process.env.STALWART_URL;
  const previousKey = process.env.MAIL_CREDENTIAL_KEY;
  process.env.STALWART_URL = "https://mail.example.test";
  process.env.MAIL_CREDENTIAL_KEY = "cd".repeat(32);
  let identity = "wrong@alpha.test";
  globalThis.fetch = (async (url: any, init: any) => {
    if (new URL(url).pathname === "/.well-known/jmap")
      return Response.json({
        apiUrl: "https://mail.example.test/jmap/",
        accounts: { own: {} },
        primaryAccounts: { "urn:ietf:params:jmap:mail": "own" },
      });
    const { methodCalls } = JSON.parse(init.body);
    assert.equal(methodCalls[0][0], "Identity/get");
    assert.equal(methodCalls[0][1].accountId, "own");
    return Response.json({
      methodResponses: [
        ["Identity/get", { list: [{ email: identity }] }, "identity"],
      ],
    });
  }) as typeof fetch;
  try {
    assert.equal(
      (
        await b.call("/integrations/stalwart", "POST", {
          password: "mail-secret",
          accountId: "foreign",
        })
      ).data.code,
      "MAIL_ACCOUNT",
    );
    assert.equal(
      (
        await b.call("/integrations/stalwart", "POST", {
          password: "mail-secret",
        })
      ).data.code,
      "MAIL_IDENTITY_MISMATCH",
    );
    identity = "bob@beta.test";
    const response = await b.call("/integrations/stalwart", "POST", {
      password: "mail-secret",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.data, { ok: true });
    const [row] = await query("SELECT * FROM memberships WHERE id=$1", [
      members.Bob.id,
    ]);
    assert.equal(row.mail_managed, false);
    assert.equal(row.mail_account_id, "own");
    assert.ok(!row.mail_secret.includes("mail-secret"));
    const session = (await b.call("/session")).data;
    assert.equal(session.member.mail_connected, true);
    assert.equal(session.member.mail_managed, false);
    assert.ok(!JSON.stringify(session).includes(row.mail_secret));
    await query(
      "UPDATE memberships SET mail_object_id='managed-id' WHERE id=$1",
      [members.Bob.id],
    );
    assert.equal(
      (
        await b.call("/integrations/stalwart", "POST", {
          password: "mail-secret",
        })
      ).data.code,
      "MAIL_MANAGED",
    );
    await query("UPDATE memberships SET mail_object_id=null WHERE id=$1", [
      members.Bob.id,
    ]);
    await query("UPDATE domains SET verified=false WHERE tenant_id=$1", [
      tenantB,
    ]);
    assert.equal(
      (
        await b.call("/integrations/stalwart", "POST", {
          password: "mail-secret",
        })
      ).data.code,
      "DOMAIN_UNVERIFIED",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.STALWART_URL;
    else process.env.STALWART_URL = previousUrl;
    if (previousKey === undefined) delete process.env.MAIL_CREDENTIAL_KEY;
    else process.env.MAIL_CREDENTIAL_KEY = previousKey;
  }
});

test("concurrent provisioning fails fast instead of exhausting database connections", async () => {
  const { withProvisioningLock } = await import("../server/stalwart.js");
  const holder = await pool.connect();
  try {
    await holder.query("SELECT pg_advisory_lock(731824916)");
    await assert.rejects(
      withProvisioningLock(async () => {
        throw Error("Must not run");
      }),
      { code: "MAIL_BUSY" },
    );
  } finally {
    await holder.query("SELECT pg_advisory_unlock(731824916)");
    holder.release();
  }
  assert.equal(await withProvisioningLock(async () => "released"), "released");
});

test("creation reports upstream failure and retry is tenant-scoped", async () => {
  const saved = {
    mode: process.env.MAIL_MODE,
    enabled: process.env.STALWART_PROVISIONING_ENABLED,
  };
  const originalFetch = globalThis.fetch;
  process.env.MAIL_MODE = "stalwart";
  process.env.STALWART_PROVISIONING_ENABLED = "true";
  globalThis.fetch = (async () => {
    throw Error("simulated upstream outage");
  }) as typeof fetch;
  try {
    const created = await admin.call("/members", "POST", {
      login: "888000000001",
      name: "Provision failure",
      email: "provision-failure@alpha.test",
      password: pass,
      role: "user",
      quota_mb: 1,
    });
    assert.equal(created.status, 200);
    assert.equal(created.data.mailbox.status, "error");
    const [row] = await query("SELECT * FROM memberships WHERE id=$1", [
      created.data.id,
    ]);
    assert.ok(row.mail_error);
    assert.equal(row.mail_backend, "local");
    assert.equal(
      (await b.call(`/members/${row.id}/provision`, "POST", {})).status,
      403,
    );
    assert.equal(
      (await platform.call(`/members/${row.id}/provision`, "POST", {})).status,
      404,
    );
    assert.equal(
      (await admin.call(`/members/${row.id}/provision`, "POST", {})).data
        .mailbox.status,
      "error",
    );
    const list = (await admin.call("/members")).data;
    assert.equal(
      list.find((m: any) => m.id === row.id).mailbox.status,
      "error",
    );
    assert.ok(!JSON.stringify(list).includes("mail_secret"));
    const client = new Client();
    await client.login("888000000001");
    await query("UPDATE identities SET must_change=false WHERE id=$1", [
      row.user_id,
    ]);
    await client.call("/consent", "POST", { version: 1, accepted: true });
    assert.equal(
      (await client.call("/mail/messages")).data.code,
      "MAIL_PROVISIONING",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MAIL_MODE = saved.mode;
    if (saved.enabled === undefined)
      delete process.env.STALWART_PROVISIONING_ENABLED;
    else process.env.STALWART_PROVISIONING_ENABLED = saved.enabled;
  }
});

test("disabled provisioning is explicit and does not claim the mailbox is ready", async () => {
  const saved = {
    mode: process.env.MAIL_MODE,
    enabled: process.env.STALWART_PROVISIONING_ENABLED,
  };
  process.env.MAIL_MODE = "stalwart";
  process.env.STALWART_PROVISIONING_ENABLED = "false";
  try {
    const created = await admin.call("/members", "POST", {
      login: "888000000002",
      name: "Manual connection",
      email: "manual@alpha.test",
      password: pass,
      role: "user",
      quota_mb: 1,
    });
    assert.equal(created.status, 200);
    assert.equal(created.data.mailbox.status, "unconnected");
  } finally {
    process.env.MAIL_MODE = saved.mode;
    if (saved.enabled === undefined)
      delete process.env.STALWART_PROVISIONING_ENABLED;
    else process.env.STALWART_PROVISIONING_ENABLED = saved.enabled;
  }
});

test("revoked mailbox credentials stop background authentication retries", async () => {
  const { jmap } = await import("../server/mail.js");
  const { encrypt } = await import("../server/security.js");
  const original = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts++;
    return new Response("", { status: 401 });
  }) as typeof fetch;
  try {
    await query("UPDATE memberships SET mail_secret=$1 WHERE id=$2", [
      encrypt(
        JSON.stringify({
          login: "bob@beta.test",
          password: "revoked-test-password",
        }),
      ),
      members.Bob.id,
    ]);
    const [member] = await query("SELECT * FROM memberships WHERE id=$1", [
      members.Bob.id,
    ]);
    const ctx = {
      member,
      tenant: { id: member.tenant_id },
      user: { id: member.user_id },
      session: null,
    };
    await assert.rejects(
      jmap(ctx, [["Mailbox/get", { accountId: member.mail_account_id }, "m"]]),
      { code: "MAIL_AUTH" },
    );
    const [updated] = await query("SELECT * FROM memberships WHERE id=$1", [
      member.id,
    ]);
    assert.equal(updated.mail_auth_failed, true);
    await assert.rejects(
      jmap({ ...ctx, member: updated }, [
        ["Mailbox/get", { accountId: member.mail_account_id }, "m"],
      ]),
      { code: "MAIL_AUTH" },
    );
    await quotaTick();
    assert.equal(
      attempts,
      1,
      "No repeat login attempt from request or quota worker",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("password policy accepts eight characters while retaining letter and digit requirements", () => {
  assert.doesNotThrow(() => validatePassword("Test1234"));
  for (const password of ["Test123", "abcdefgh", "12345678", "a1".repeat(65)])
    assert.throws(() => validatePassword(password), { code: "WEAK_PASSWORD" });
});

test("Workspace shared budget authenticates, rejects stale revisions and enforces mailbox allocations", async () => {
  const oldToken = process.env.AXISMAIL_STORAGE_TOKEN,
    oldMode = process.env.MAIL_MODE;
  process.env.AXISMAIL_STORAGE_TOKEN =
    "test-storage-budget-secret-32-characters";
  const org = "734ba7d0-a0c8-47bb-8990-219cd06cc001",
    path = `/api/internal/workspace/organizations/${org}/storage`;
  const headers = {
    authorization: `Bearer ${process.env.AXISMAIL_STORAGE_TOKEN}`,
  };
  try {
    assert.equal((await app.inject({ url: path })).statusCode, 401);
    const put = async (quota_bytes: number, revision: number) =>
      app.inject({
        url: path,
        method: "PUT",
        headers,
        payload: { quota_bytes, revision },
      });
    assert.equal((await put(10 * 1048576, 0)).statusCode, 200);
    assert.equal((await put(20 * 1048576, 0)).statusCode, 409);
    const [tenant] = await query(
      "SELECT id FROM tenants WHERE workspace_org_id=$1",
      [org],
    );
    const [identity] = await query("SELECT id FROM identities LIMIT 1");
    const [member] = await query(
      "INSERT INTO memberships(tenant_id,user_id,role,email,quota_mb) VALUES($1,$2,'user','shared-budget@example.test',6) RETURNING id",
      [tenant.id, identity.id],
    );
    await assert.rejects(
      query("UPDATE memberships SET quota_mb=11 WHERE id=$1", [member.id]),
      { code: "P7503" },
    );
    await assert.rejects(
      query("UPDATE memberships SET mail_managed=false WHERE id=$1", [
        member.id,
      ]),
      { code: "P7503" },
    );
    process.env.MAIL_MODE = "stalwart";
    assert.equal((await put(5 * 1048576, 1)).statusCode, 409);
    assert.equal((await put(8 * 1048576, 1)).statusCode, 200);
    const result = (await app.inject({ url: path, headers })).json();
    assert.equal(result.quota_bytes, 8 * 1048576);
    assert.equal(result.allocated_bytes, 6 * 1048576);
    assert.equal(result.revision, 2);
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "mail-budget-")),
      keyFile = join(dir, "key");
    await writeFile(keyFile, "test-management-key");
    const oldFetch = globalThis.fetch,
      oldKey = process.env.STALWART_API_KEY_FILE,
      oldUrl = process.env.STALWART_URL;
    process.env.STALWART_API_KEY_FILE = keyFile;
    process.env.STALWART_URL = "http://stalwart.invalid";
    let extra = false;
    globalThis.fetch = (async () =>
      Response.json({
        methodResponses: [
          [
            "x:Account/get",
            {
              list: [
                {
                  id: "owned-budget-account",
                  domainId: "budget-domain",
                  quotas: { maxDiskQuota: 7 * 1048576 },
                  usedDiskQuota: 2 * 1048576,
                },
                ...(extra
                  ? [{ id: "unmanaged", domainId: "budget-domain" }]
                  : []),
              ],
            },
            "budget",
          ],
        ],
      })) as typeof fetch;
    try {
      await query(
        "UPDATE memberships SET mail_backend='stalwart',mail_object_id='owned-budget-account' WHERE id=$1",
        [member.id],
      );
      await query(
        "INSERT INTO domains(tenant_id,name,verification_token,stalwart_id) VALUES($1,'budget.example.test','test','budget-domain')",
        [tenant.id],
      );
      const live = (await app.inject({ url: path, headers })).json();
      assert.equal(live.used_bytes, 2 * 1048576);
      assert.equal(live.allocated_bytes, 7 * 1048576);
      const { guardWorkspaceMailboxQuota } = await import(
        "../server/mail-budget.js"
      );
      await assert.rejects(
        guardWorkspaceMailboxQuota(
          tenant.id,
          "owned-budget-account",
          9 * 1048576,
        ),
        { code: "TENANT_QUOTA" },
      );
      await guardWorkspaceMailboxQuota(
        tenant.id,
        "owned-budget-account",
        8 * 1048576,
      );
      const [pendingIdentity] = await query(
        "INSERT INTO identities(login,name,password_hash,must_change) VALUES('pending-budget-test','Pending', $1,false) RETURNING id",
        [await hashPassword(pass)],
      );
      await query(
        "INSERT INTO memberships(tenant_id,user_id,role,email,quota_mb) VALUES($1,$2,'tenant_admin','pending-budget@example.test',1)",
        [tenant.id, pendingIdentity.id],
      );
      const pending = (await app.inject({ url: path, headers })).json();
      assert.equal(pending.allocated_bytes, 8 * 1048576,
        "each mailbox reserves the larger of its requested and applied quota");
      assert.equal((await put(7 * 1048576, 2)).statusCode, 409);
      await query(
        "INSERT INTO consents(tenant_id,user_id,version,text_hash,document_text,accepted) VALUES($1,$2,1,$3,'test',true)",
        [tenant.id, pendingIdentity.id, digest("test")],
      );
      const mailboxAdmin = new Client();
      await mailboxAdmin.login("pending-budget-test");
      const belowUsed = await mailboxAdmin.call(`/members/${member.id}`, "PATCH", { quota_mb: 1 });
      assert.equal(belowUsed.status, 409);
      assert.equal(belowUsed.data.code, "MAIL_QUOTA_USED");
      const overBudget = await mailboxAdmin.call(`/members/${member.id}`, "PATCH", { quota_mb: 8 });
      assert.equal(overBudget.status, 409);
      assert.equal(overBudget.data.code, "TENANT_QUOTA");
      assert.equal((await mailboxAdmin.call(`/members/${members.Alice.id}`, "PATCH", { quota_mb: 1 })).status, 404);
      assert.equal((await mailboxAdmin.call(`/members/${member.id}`, "PATCH", { quota_mb: 7 })).status, 200);
      const [changed] = await query("SELECT quota_mb,mail_sync_hash FROM memberships WHERE id=$1", [member.id]);
      assert.equal(changed.quota_mb, 7);
      assert.equal(changed.mail_sync_hash, null);
      const [mailAudit] = await query("SELECT detail FROM audit_events WHERE tenant_id=$1 AND action='member.updated' AND resource_id=$2 ORDER BY created_at DESC LIMIT 1", [tenant.id, member.id]);
      assert.equal(mailAudit.detail.before.quota_mb, 6);
      assert.equal(mailAudit.detail.after.quota_mb, 7);
      const mailboxPath = `/api/internal/workspace/organizations/${org}/mailboxes`;
      assert.equal((await app.inject({ url: mailboxPath })).statusCode, 401);
      const mailboxList = await app.inject({ url: mailboxPath, headers });
      assert.equal(mailboxList.statusCode, 200, mailboxList.body);
      const mailboxPage = mailboxList.json();
      assert.equal(mailboxPage.items.length, 2);
      assert.equal(mailboxPage.allocated_bytes, 8 * 1048576);
      assert.equal(JSON.stringify(mailboxPage).includes("mail_secret"), false);
      const updateMailbox = (id: string, quota: number, revision = mailboxPage.revision) => app.inject({ method: "PUT", url: `${mailboxPath}/${id}`, headers, payload: { quota_bytes: quota * 1048576, revision, actor_id: 9 } });
      assert.equal((await updateMailbox(members.Alice.id, 1)).statusCode, 404);
      assert.equal((await updateMailbox(member.id, 1)).statusCode, 409);
      assert.equal((await updateMailbox(member.id, 8)).statusCode, 409);
      const changedMailbox = await updateMailbox(member.id, 6);
      assert.equal(changedMailbox.statusCode, 200, changedMailbox.body);
      assert.equal(changedMailbox.json().after.pending, true);
      assert.equal(changedMailbox.json().after.applied_quota_bytes, 7 * 1048576);
      assert.equal((await updateMailbox(member.id, 3)).statusCode, 409, "stale form cannot overwrite another change");
      extra = true;
      assert.equal((await app.inject({ url: path, headers })).statusCode, 409);
    } finally {
      globalThis.fetch = oldFetch;
      if (oldKey === undefined) delete process.env.STALWART_API_KEY_FILE;
      else process.env.STALWART_API_KEY_FILE = oldKey;
      if (oldUrl === undefined) delete process.env.STALWART_URL;
      else process.env.STALWART_URL = oldUrl;
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    if (oldToken === undefined) delete process.env.AXISMAIL_STORAGE_TOKEN;
    else process.env.AXISMAIL_STORAGE_TOKEN = oldToken;
    process.env.MAIL_MODE = oldMode;
  }
});


test("Workspace SSO does not require a Workspace mail budget; AxisMail retains its own limits",async()=>{
 const {syncWorkspaceProfile}=await import("../server/workspace.js");
 const oldToken=process.env.AXISMAIL_STORAGE_TOKEN,oldMode=process.env.MAIL_MODE;
 const oldDomain=process.env.WORKSPACE_MAIL_DOMAIN_BASE;
 process.env.WORKSPACE_MAIL_DOMAIN_BASE="teamspace.test";
 const org="734ba7d0-a0c8-47bb-8990-219cd06cc002";
 const profile={organization:{id:org,name:"Budget rollout",slug:"budget-rollout",status:"active",owner_id:987654},user:{id:987654,username:"budget-rollout",first_name:"Budget",last_name:"Rollout",is_active:true,organization_id:org}};
 try{
  delete process.env.AXISMAIL_STORAGE_TOKEN;
  const legacy=await syncWorkspaceProfile(profile);assert.ok(legacy.memberId);
  process.env.AXISMAIL_STORAGE_TOKEN="test-storage-budget-secret-32-characters";
  assert.equal((await syncWorkspaceProfile(profile)).tenantId,legacy.tenantId);
  process.env.MAIL_MODE="stalwart";
  const result=await app.inject({method:"PUT",url:`/api/internal/workspace/organizations/${org}/storage`,headers:{authorization:`Bearer ${process.env.AXISMAIL_STORAGE_TOKEN}`},payload:{quota_bytes:6*1024*1048576,revision:0}});
  assert.equal(result.statusCode,200,result.body);
  assert.equal((await syncWorkspaceProfile(profile)).tenantId,legacy.tenantId);
  const [tenant]=await query("SELECT quota_mb FROM tenants WHERE id=$1",[legacy.tenantId]);assert.equal(tenant.quota_mb,6144);
  const [member]=await query("SELECT quota_mb FROM memberships WHERE id=$1",[legacy.memberId]);assert.equal(member.quota_mb,5120);
  const newcomer={...profile,user:{...profile.user,id:987655,username:"new-mailbox"}};
  await assert.rejects(syncWorkspaceProfile(newcomer),{code:"TENANT_QUOTA"});
  await query("UPDATE memberships SET quota_mb=4096 WHERE id=$1",[legacy.memberId]);
  await syncWorkspaceProfile(profile);
  const [preserved]=await query("SELECT quota_mb FROM memberships WHERE id=$1",[legacy.memberId]);assert.equal(preserved.quota_mb,4096);
 }finally{
  if(oldToken===undefined)delete process.env.AXISMAIL_STORAGE_TOKEN;else process.env.AXISMAIL_STORAGE_TOKEN=oldToken;
  process.env.MAIL_MODE=oldMode;
  if(oldDomain===undefined)delete process.env.WORKSPACE_MAIL_DOMAIN_BASE;else process.env.WORKSPACE_MAIL_DOMAIN_BASE=oldDomain;
 }
});
