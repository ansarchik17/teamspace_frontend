import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { buildApp } from "../server/app.js";
import { query, pool } from "../server/db.js";
import { token, digest } from "../server/security.js";
import { management } from "../server/stalwart.js";
import { listMail, sendMail } from "../server/mail.js";
if (
  process.env.STALWART_URL !== "http://127.0.0.1:28083" ||
  process.env.ALLOW_EXTERNAL_MAIL === "true"
)
  throw Error(
    "Only the isolated local Stalwart with external mail disabled is supported",
  );
process.env.MAIL_MODE = "stalwart";
process.env.STALWART_PROVISIONING_ENABLED = "true";
const app = await buildApp();
const marker = randomUUID().slice(0, 8);
const login = "881" + String(randomInt(100000000, 999999999));
const password = "E2e-temporary-password-123";
let userId: string | undefined;
let memberId: string | undefined;
const raw = token(),
  csrf = token();
let cookie = `axis_session=${raw}`;
let currentCsrf = csrf;
async function call(
  url: string,
  method: any = "GET",
  payload?: any,
  headers: any = {},
) {
  const r = await app.inject({
    url: "/api" + url,
    method,
    payload,
    headers: { cookie, "x-csrf-token": currentCsrf, ...headers },
  });
  assert.equal(r.statusCode, 200, `${method} ${url}: ${r.body}`);
  return { data: r.json(), headers: r.headers };
}
try {
  const [admin] = await query(
    "SELECT * FROM memberships WHERE email='platform@axis.test'",
  );
  const [tenant] = await query("SELECT * FROM tenants WHERE id=$1", [
    admin.tenant_id,
  ]);
  // A fixture session avoids changing the existing administrator's credentials.
  const [qa] = await query(
    "SELECT m.* FROM memberships m JOIN identities u ON u.id=m.user_id WHERE m.tenant_id=$1 AND u.active=true AND m.status='active' AND u.must_change=false AND m.role='tenant_admin' AND EXISTS(SELECT 1 FROM consents c WHERE c.user_id=u.id AND c.tenant_id=m.tenant_id AND c.accepted=true AND c.version=$2) LIMIT 1",
    [tenant.id, tenant.consent_version],
  );
  assert.ok(qa, "An onboarded local QA administrator is required");
  await query(
    "INSERT INTO sessions(id_hash,user_id,tenant_id,csrf,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",
    [digest(raw), qa.user_id, tenant.id, csrf],
  );
  const created = (
    await call("/members", "POST", {
      login,
      name: "Сквозная проверка " + marker,
      email: `flow-${marker}@axis.test`,
      password,
      role: "user",
      quota_mb: 10,
    })
  ).data;
  memberId = created.id;
  const [member] = await query("SELECT * FROM memberships WHERE id=$1", [
    memberId,
  ]);
  userId = member.user_id;
  assert.equal(
    created.mailbox.status,
    "ready",
    "Mailbox must exist before create response, without a worker tick",
  );
  assert.ok(member.mail_account_id);
  const remoteId = member.mail_object_id;
  assert.equal(
    (await call(`/members/${memberId}/provision`, "POST", {})).data.mailbox
      .status,
    "ready",
  );
  assert.equal(
    (
      await query("SELECT mail_object_id FROM memberships WHERE id=$1", [
        memberId,
      ])
    )[0].mail_object_id,
    remoteId,
    "Retry must not create another account",
  );
  const signIn = await call("/auth/login", "POST", { login, password });
  cookie = String(signIn.headers["set-cookie"]).split(";")[0];
  currentCsrf = (await call("/session")).data.csrf;
  await call("/auth/password", "POST", {
    currentPassword: password,
    password: "E2e-new-password-456",
  });
  await call("/consent", "POST", {
    version: tenant.consent_version,
    accepted: true,
  });
  assert.equal((await call("/session")).data.member.mail_connected, true);
  const cursor = (await call("/mail/changes")).data;
  const subject = "Immediate provisioning " + marker;
  const message = {
    to: [admin.email],
    subject,
    body: "Письмо от только что созданного сотрудника",
    cc: [],
    bcc: [],
    attachmentIds: [],
  };
  const headers = { "idempotency-key": randomUUID() };
  assert.equal(
    (await call("/mail/send", "POST", message, headers)).data.status,
    "accepted",
  );
  await call("/mail/send", "POST", message, headers);
  const ctx = {
    member: admin,
    tenant,
    user: { id: admin.user_id },
    session: null,
  };
  let delivered: any;
  for (let i = 0; i < 15; i++) {
    delivered = (await listMail(ctx, "inbox", subject, 1)).items[0];
    if (delivered) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(delivered, "Outgoing message delivered");
  await sendMail(
    ctx,
    {
      ...message,
      to: [member.email],
      subject: "Re: " + subject,
      body: "Ответ новому сотруднику",
    },
    randomUUID(),
  );
  let incoming: any;
  for (let i = 0; i < 15; i++) {
    incoming = (
      await call(
        "/mail/messages?folder=inbox&search=" + encodeURIComponent(subject),
      )
    ).data.items[0];
    if (incoming) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(
    incoming,
    "Reply appears through the same API used by the frontend",
  );
  assert.equal(
    (
      await call(
        `/mail/changes?emailState=${encodeURIComponent(cursor.emailState)}&mailboxState=${encodeURIComponent(cursor.mailboxState)}`,
      )
    ).data.changed,
    true,
  );
  const sent = (
    await call(
      "/mail/messages?folder=sent&search=" + encodeURIComponent(subject),
    )
  ).data;
  assert.equal(sent.total, 1, "Idempotent send creates one sent message");
  console.log(
    "PASS: create user → immediate Stalwart account → first login/onboarding → send → actual delivery → reply → inbox/change sync → safe retry.",
  );
} finally {
  if (memberId) {
    await query(
      "UPDATE memberships SET status='suspended',mail_managed=false WHERE id=$1",
      [memberId],
    );
    const [m] = await query(
      "SELECT mail_object_id FROM memberships WHERE id=$1",
      [memberId],
    );
    if (m?.mail_object_id)
      await management([
        ["x:Account/set", { destroy: [m.mail_object_id] }, "cleanup"],
      ]);
    await query("DELETE FROM idempotency WHERE mailbox_id=$1", [memberId]);
    await query("DELETE FROM quota_states WHERE mailbox_id=$1", [memberId]);
    await query("DELETE FROM memberships WHERE id=$1", [memberId]);
  }
  if (userId) {
    await query("DELETE FROM consents WHERE user_id=$1", [userId]);
    await query("UPDATE audit_events SET actor_id=null WHERE actor_id=$1", [
      userId,
    ]);
    await query("DELETE FROM identities WHERE id=$1", [userId]);
  }
  await query("DELETE FROM sessions WHERE id_hash=$1", [digest(raw)]);
  await app.close();
  await pool.end();
}
