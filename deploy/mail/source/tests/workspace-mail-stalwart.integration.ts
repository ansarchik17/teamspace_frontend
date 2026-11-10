import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query, pool } from "../server/db.js";
import { migrate } from "../server/migrate.js";
import { syncWorkspaceProfile } from "../server/workspace.js";
import { provisionMemberNow } from "../server/stalwart.js";
import { jmapDraft, jmap } from "../server/mail.js";
import { decrypt } from "../server/security.js";

const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.ok(database.pathname.endsWith("_test"));
assert.equal(new URL(process.env.STALWART_URL!).hostname, "127.0.0.1");
assert.equal(process.env.STALWART_ISOLATED_TEST, "1");
assert.equal(process.env.ALLOW_EXTERNAL_MAIL, "false");
const company = randomUUID();
const organization = { id: company, name: "Isolated naming test", slug: "naming-" + randomUUID().slice(0, 8), status: "active", owner_id: 12001 };
const domain = organization.slug + ".teamspace.test";
const startId = 12000 + Math.floor(Math.random() * 1000000);
organization.owner_id = startId;
const user = { id: startId, username: "personal.login@example.invalid", email: "personal@example.invalid", first_name: "Әлия", last_name: "Қасымова", is_active: true, organization_id: company };
const load = async (id: string) => (await query("SELECT * FROM memberships WHERE id=$1", [id]))[0];
async function open(profile: { organization: typeof organization; user: typeof user }) {
  const link = await syncWorkspaceProfile(profile);
  const status = await provisionMemberNow(link.memberId);
  assert.equal(status.status, "ready", JSON.stringify(await query("SELECT mail_error FROM memberships WHERE id=$1", [link.memberId])));
  const member = await load(link.memberId);
  const tenant = (await query("SELECT * FROM tenants WHERE id=$1", [link.tenantId]))[0];
  const identity = (await query("SELECT * FROM identities WHERE id=$1", [link.userId]))[0];
  return { link, ctx: { member, tenant, user: identity, session: null } };
}
async function assertDraft(ctx: Awaited<ReturnType<typeof open>>["ctx"], id: string, email: string) {
  const { result } = await jmap(ctx, [["Email/get", { accountId: ctx.member.mail_account_id, ids: [id], properties: ["id", "from", "subject"] }, "check"]]);
  const message = result.methodResponses[0][1].list[0];
  assert.equal(message.id, id);
  assert.equal(message.from[0].email, email);
}
try {
  await migrate();
  const first = await open({ organization, user });
  assert.equal(first.ctx.member.email, `a.qasymova@${domain}`);
  const draft = await jmapDraft(first.ctx, { to: [first.ctx.member.email], cc: [], bcc: [], subject: "Synthetic corporate sender", body: "Local isolated draft", attachmentIds: [] });
  await assertDraft(first.ctx, draft.id, first.ctx.member.email);
  const second = await open({ organization, user: { ...user, id: startId + 1, email: "another@example.invalid" } });
  assert.equal(second.ctx.member.email, `a.qasymova2@${domain}`);

  // An actual legacy mailbox with a saved message must retain its address,
  // Stalwart IDs and credentials, even after its Workspace names/login change.
  const legacyProfile = { organization, user: { ...user, id: startId + 2, email: `legacy-12003@${domain}` } };
  const legacy = await open(legacyProfile);
  const saved = await jmapDraft(legacy.ctx, { to: [legacy.ctx.member.email], cc: [], bcc: [], subject: "Existing message must survive", body: "Keep this draft", attachmentIds: [] });
  const changed = await open({ organization, user: { ...legacyProfile.user, email: "changed@example.invalid", first_name: "New", last_name: "Name", username: "new.login" } });
  for (const field of ["id", "email", "mail_object_id", "mail_account_id", "mail_secret", "quota_mb"])
    assert.equal(changed.ctx.member[field], legacy.ctx.member[field], `Legacy ${field} changed`);
  await assertDraft(changed.ctx, saved.id, legacy.ctx.member.email);
  await assertDraft(first.ctx, draft.id, first.ctx.member.email);
  const correctedAddress = `corrected@${domain}`;
  await query("UPDATE memberships SET mail_pending_email=$1 WHERE id=$2", [correctedAddress, legacy.link.memberId]);
  const renamed = await provisionMemberNow(legacy.link.memberId);
  assert.equal(renamed.status, "ready", JSON.stringify(await query("SELECT mail_error FROM memberships WHERE id=$1", [legacy.link.memberId])));
  const corrected = await load(legacy.link.memberId);
  for (const field of ["id", "user_id", "mail_object_id", "mail_account_id", "quota_mb"])
    assert.equal(corrected[field], legacy.ctx.member[field], `Rename changed ${field}`);
  assert.equal(corrected.email, correctedAddress);
  assert.equal(JSON.parse(decrypt(corrected.mail_secret)).password, JSON.parse(decrypt(legacy.ctx.member.mail_secret)).password);
  const correctedCtx = { ...legacy.ctx, member: corrected };
  await assertDraft(correctedCtx, saved.id, legacy.ctx.member.email);
  const afterRename = await jmapDraft(correctedCtx, { to: [first.ctx.member.email], cc: [], bcc: [], subject: "Sender after rename", body: "Preserved mailbox with correct sender", attachmentIds: [] });
  await assertDraft(correctedCtx, afterRename.id, correctedAddress);
  const reused = await open({ organization, user: { ...legacyProfile.user, id: startId + 3 } });
  assert.equal(reused.ctx.member.email, legacy.ctx.member.email);
  assert.notEqual(reused.ctx.member.mail_object_id, corrected.mail_object_id);
  const { result: foreign } = await jmap(reused.ctx, [["Email/get", { accountId: reused.ctx.member.mail_account_id, ids: [saved.id], properties: ["id"] }, "foreign"]]);
  assert.equal(foreign.methodResponses[0][1].list.length, 0, "The new address owner must not receive old mailbox contents");
  console.log("Real isolated Stalwart passed: renamed primary address, unchanged account IDs/password, original saved message preserved, new sender correct, released address reused by a separate mailbox without access to original contents; no email sent.");
} finally { await pool.end(); }
