import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool, query } from "../server/db.js";
import {
  listMail,
  getMail,
  jmapDraft,
  sendMail,
  jmap,
  downloadRemoteAttachment,
  jmapDelete,
  mailboxForRole,
  quota,
} from "../server/mail.js";
import {
  mailboxChanges,
  verifyMailboxConnection,
} from "../server/mail-integration.js";
import { decrypt } from "../server/security.js";
import { syncStalwart } from "../server/stalwart.js";
if (process.env.STALWART_URL !== "http://127.0.0.1:28083")
  throw Error("This test only supports the isolated local Stalwart");
async function context(email: string) {
  const [member] = await query("SELECT * FROM memberships WHERE email=$1", [
    email,
  ]);
  const [tenant] = await query("SELECT * FROM tenants WHERE id=$1", [
    member.tenant_id,
  ]);
  const [user] = await query("SELECT * FROM identities WHERE id=$1", [
    member.user_id,
  ]);
  return { member, tenant, user, session: null };
}
try {
  await syncStalwart();
  const a = await context("platform@axis.test"),
    b = await context("admin@orbit.test");
  const linked = await verifyMailboxConnection(a, {
    password: JSON.parse(decrypt(a.member.mail_secret)).password,
  });
  assert.equal(linked.accountId, a.member.mail_account_id);
  const initialCursor = await mailboxChanges(b, {});
  const key = randomUUID(),
    subject = "JMAP integration " + key;
  const [file] = await query(
    "INSERT INTO attachments(tenant_id,mailbox_id,filename,content_type,data,size_bytes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
    [
      a.tenant.id,
      a.member.id,
      "проверка.txt",
      "text/plain",
      Buffer.from("Axis attachment"),
      15,
    ],
  );
  const data = {
    to: [b.member.email],
    cc: [],
    bcc: [a.member.email],
    subject,
    body: "Тестовое письмо через настоящий локальный Stalwart.",
    attachmentIds: [file.id],
  };
  const draft = await jmapDraft(a, data);
  assert.equal((await getMail(a, draft.id)).folder, "drafts");
  const saved = await jmapDraft(a, { ...data, draftId: draft.id });
  assert.notEqual(saved.id, draft.id);
  const sent = await sendMail(a, { ...data, draftId: saved.id }, key);
  assert.equal(sent.status, "accepted");
  assert.deepEqual(
    await sendMail(a, { ...data, draftId: saved.id }, key),
    sent,
  );
  let incoming: any;
  for (let i = 0; i < 15; i++) {
    const inbox = await listMail(b, "inbox", subject, 1);
    incoming = inbox.items[0];
    if (incoming) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(incoming, "Stalwart delivered mail to the second tenant");
  const delta = await mailboxChanges(b, initialCursor);
  assert.equal(
    delta.changed,
    true,
    "Incoming mail appears in incremental sync",
  );
  const steady = await mailboxChanges(b, delta);
  assert.equal(steady.changed, false, "Stable mailbox needs no list reload");
  await query(
    "UPDATE memberships SET mail_managed=false,mail_sync_hash=null WHERE id=$1",
    [a.member.id],
  );
  try {
    await syncStalwart();
    const [linkedRow] = await query(
      "SELECT mail_sync_hash,mail_secret FROM memberships WHERE id=$1",
      [a.member.id],
    );
    assert.equal(
      linkedRow.mail_sync_hash,
      null,
      "Worker skips linked mailboxes",
    );
    assert.equal(linkedRow.mail_secret, a.member.mail_secret);
  } finally {
    await query(
      "UPDATE memberships SET mail_managed=true,mail_sync_hash=$1 WHERE id=$2",
      [a.member.mail_sync_hash, a.member.id],
    );
  }
  const full = await getMail(b, incoming.id);
  assert.equal(full.body.trim(), data.body);
  assert.deepEqual(full.bcc, []);
  assert.equal(full.attachments.length, 1);
  const attachment = await downloadRemoteAttachment(b, full.attachments[0].id);
  assert.equal(attachment.data.toString(), "Axis attachment");
  const own = (await listMail(a, "sent", subject, 1)).items;
  assert.equal(own.length, 1, "Idempotent submission");
  const starred = await jmap(b, [
    [
      "Email/set",
      {
        accountId: b.member.mail_account_id,
        update: { [full.id]: { "keywords/$flagged": true } },
      },
      "u",
    ],
  ]);
  assert.ok(starred);
  assert.equal((await listMail(b, "starred", subject, 1)).total, 1);
  const archive = await mailboxForRole(b, "archive");
  await jmap(b, [
    [
      "Email/set",
      {
        accountId: b.member.mail_account_id,
        update: { [full.id]: { mailboxIds: { [archive.id]: true } } },
      },
      "u",
    ],
  ]);
  assert.equal((await getMail(b, full.id)).folder, "archive");
  const trash = await mailboxForRole(b, "trash");
  await jmap(b, [
    [
      "Email/set",
      {
        accountId: b.member.mail_account_id,
        update: { [full.id]: { mailboxIds: { [trash.id]: true } } },
      },
      "u",
    ],
  ]);
  await jmapDelete(b, full.id);
  await assert.rejects(getMail(b, full.id));
  const q = await quota(a);
  assert.ok(q.used > 0);
  assert.equal(q.limit, a.member.quota_mb * 1048576);
  // Asking a personal credential to operate on the other account must be rejected upstream.
  await assert.rejects(
    jmap(a, [
      ["Email/query", { accountId: b.member.mail_account_id }, "foreign"],
    ]),
  );
  await assert.rejects(
    sendMail(
      a,
      { ...data, to: ["never-send@example.org"], bcc: [], attachmentIds: [] },
      randomUUID(),
    ),
    (e: any) => e.code === "EXTERNAL_MAIL_UNAVAILABLE",
  );
  console.log(
    "PASS: real Stalwart provisioning, drafts, attachment upload/download, cross-tenant delivery, BCC privacy, idempotency, search, stars, archive, delete, quota and account isolation.",
  );
} finally {
  await pool.end();
}
