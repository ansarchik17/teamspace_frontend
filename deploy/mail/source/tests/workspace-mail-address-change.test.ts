import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL!);
assert.ok(url.hostname === "127.0.0.1" && url.pathname.endsWith("_test"));
const root = new pg.Pool({ connectionString: url.toString() });
const schema = "address_change_" + randomUUID().replaceAll("-", "");
await root.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
process.env.MAIL_MODE = "local";
process.env.WORKSPACE_MAIL_DOMAIN_BASE = "teamspace.test";
process.env.WORKSPACE_API_URL = "https://workspace.example.invalid";
const { query, pool } = await import("../server/db.js");
const { migrate } = await import("../server/migrate.js");
const { syncWorkspaceProfile } = await import("../server/workspace.js");
const { encrypt, decrypt, digest } = await import("../server/security.js");
const { buildApp } = await import("../server/app.js");
await migrate();
const dir = await mkdtemp(join(tmpdir(), "mail-address-change-"));
const key = join(dir, "key"); await writeFile(key, "synthetic-management-key");
process.env.STALWART_API_KEY_FILE = key;
process.env.STALWART_URL = "http://127.0.0.1:9";
const app = await buildApp();
after(async () => { await app.close(); await pool.end(); await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); await rm(dir, { recursive: true, force: true }); });
let nextId = 90000;
async function fixture() {
  const id = ++nextId, org = randomUUID(), slug = "rename-" + id;
  const profile = { user: { id, first_name: "Test", last_name: "Employee", username: "test.employee", email: `correct@${slug}.teamspace.test`, is_active: true, organization_id: org }, organization: { id: org, name: "Synthetic", slug, status: "active", owner_id: id } };
  const old = `legacy@${slug}.teamspace.test`;
  const link = await syncWorkspaceProfile({ ...profile, user: { ...profile.user, email: old } });
  const credential = { type: "basic", login: old, password: "preserved-test-password" };
  await query("UPDATE memberships SET mail_backend='stalwart',mail_object_id='owned-object',mail_account_id='owned-account',mail_secret=$1 WHERE id=$2", [encrypt(JSON.stringify(credential)), link.memberId]);
  await query("UPDATE domains SET stalwart_id='owned-domain' WHERE tenant_id=$1", [link.tenantId]);
  await query("INSERT INTO consents(tenant_id,user_id,version,text_hash,document_text,accepted) VALUES($1,$2,1,'test','test',true)", [link.tenantId, link.userId]);
  const raw = randomUUID(), csrf = "synthetic-csrf";
  await query("INSERT INTO sessions(id_hash,user_id,tenant_id,csrf,expires_at,workspace_token,workspace_checked_at) VALUES($1,$2,$3,$4,now()+interval '1 hour',$5,now())", [digest(raw), link.userId, link.tenantId, csrf, encrypt("synthetic-workspace-token")]);
  const [message] = await query("INSERT INTO messages(tenant_id,mailbox_id,sender,recipients,subject,body,size_bytes) VALUES($1,$2,$3,'[]','Preserved original','Original content',16) RETURNING id", [link.tenantId, link.memberId, old]);
  const state = { name: "legacy", renameWrites: 0, failDiscovery: false, foreignAccount: false, occupied: false };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/auth/me")) return Response.json(profile.user);
    if (path.endsWith("/organizations/current/users")) return Response.json([{ ...profile.user, full_name: "Test Employee" }]);
    if (path.endsWith("/organizations/current")) return Response.json(profile.organization);
    if (path === "/.well-known/jmap") {
      if (state.failDiscovery && state.name === "correct") return new Response("retry", { status: 503 });
      const auth = Buffer.from(String((init?.headers as any)?.Authorization).slice(6), "base64").toString();
      assert.equal(auth, (state.name === "legacy" ? old : profile.user.email) + ":" + credential.password);
      return Response.json({ primaryAccounts: { "urn:ietf:params:jmap:mail": state.foreignAccount ? "foreign-account" : "owned-account" }, accounts: { "owned-account": {} } });
    }
    assert.equal(path, "/jmap/");
    const [method, args, callId] = JSON.parse(String(init?.body)).methodCalls[0];
    let result: any;
    if (method === "x:Domain/get") result = { list: [{ id: "owned-domain", name: slug + ".teamspace.test" }] };
    else if (method === "x:Account/get") result = { list: [{ id: "owned-object", name: state.name, domainId: "owned-domain" }, ...(state.occupied ? [{ id: "foreign-object", name: "another", domainId: "owned-domain", aliases: { "0": { name: "correct", domainId: "owned-domain" } } }] : [])] };
    else {
      assert.equal(method, "x:Account/set");
      assert.equal(args.create, undefined, "Renaming must never create or replace an account");
      assert.equal(args.destroy, undefined);
      assert.deepEqual(Object.keys(args.update), ["owned-object"]);
      const patch = args.update["owned-object"];
      if (Object.keys(patch).length === 1) { assert.deepEqual(Object.keys(patch), ["name"]); state.renameWrites++; }
      else assert.equal(patch.credentials["0"].secret, credential.password, "The existing password must be preserved");
      state.name = patch.name; result = { updated: { "owned-object": null } };
    }
    return Response.json({ methodResponses: [[method, result, callId]] });
  };
  const member = async () => (await query("SELECT * FROM memberships WHERE id=$1", [link.memberId]))[0];
  const call = (method: any, body?: any, path = `/api/members/${link.memberId}/address`) => app.inject({ method, url: path, headers: { cookie: `axis_session=${raw}`, "x-csrf-token": csrf }, payload: body });
  const restore = () => { globalThis.fetch = originalFetch; process.env.MAIL_MODE = "local"; };
  return { profile, link, credential, old, state, member, call, restore, message };
}

test("admin uses the same immutable Workspace user; foreign scope, HR, tampering and occupied aliases are rejected", async () => {
  const f = await fixture();
  try {
    const preview = await f.call("GET"); assert.equal(preview.statusCode, 200); assert.equal(preview.json().workspace_email, f.profile.user.email);
    assert.equal((await f.call("GET", undefined, `/api/members/${randomUUID()}/address`)).statusCode, 404);
    await query("UPDATE memberships SET role='hr' WHERE id=$1", [f.link.memberId]);
    assert.equal((await f.call("GET")).statusCode, 403);
    await query("UPDATE memberships SET role='tenant_admin' WHERE id=$1", [f.link.memberId]);
    assert.equal((await f.call("POST", { expected_email: f.old, email: "foreign@another.test" })).json().code, "WORKSPACE_ADDRESS_CHANGED");
    f.state.occupied = true;
    assert.equal((await f.call("POST", { expected_email: f.old, email: f.profile.user.email })).json().code, "MAIL_ADDRESS_CONFLICT");
    assert.equal((await f.member()).email, f.old); assert.equal((await f.member()).mail_pending_email, null);
    assert.equal(f.state.renameWrites, 0);
  } finally { f.restore(); }
});
test("address repair preserves mailbox IDs, password and message; a repeat is idempotent", async () => {
  const f = await fixture(); process.env.MAIL_MODE = "stalwart";
  try {
    const response = await f.call("POST", { expected_email: f.old, email: f.profile.user.email });
    assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().pending_email, null);
    const m = await f.member();
    assert.equal(m.email, f.profile.user.email); assert.equal(m.mail_object_id, "owned-object"); assert.equal(m.mail_account_id, "owned-account"); assert.equal(m.user_id, f.link.userId);
    assert.equal(JSON.parse(decrypt(m.mail_secret)).password, f.credential.password);
    assert.equal((await query("SELECT body FROM messages WHERE id=$1 AND mailbox_id=$2", [f.message.id, m.id]))[0].body, "Original content");
    assert.equal((await f.call("POST", { expected_email: f.old, email: f.profile.user.email })).statusCode, 200);
    assert.equal(f.state.renameWrites, 1);
  } finally { f.restore(); }
});
test("a lost remote response is recoverable and a pending address is reserved against other writers", async () => {
  const f = await fixture(); process.env.MAIL_MODE = "stalwart";
  try {
    f.state.failDiscovery = true;
    const response = await f.call("POST", { expected_email: f.old, email: f.profile.user.email });
    assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().pending_email, f.profile.user.email);
    assert.equal((await f.member()).email, f.old); assert.equal(f.state.name, "correct");
    assert.equal((await f.call("GET", undefined, "/api/mail/messages")).json().code, "MAIL_ADDRESS_UPDATING");
    const other = await syncWorkspaceProfile({ ...f.profile, user: { ...f.profile.user, id: ++nextId, email: `different@${f.profile.organization.slug}.teamspace.test` } });
    await assert.rejects(query("UPDATE memberships SET email=$1 WHERE id=$2", [f.profile.user.email, other.memberId]), { code: "23505" });
    f.state.failDiscovery = false;
    const retried = await f.call("POST", { expected_email: f.old, email: f.profile.user.email });
    assert.equal(retried.json().pending_email, null, retried.body); assert.equal(f.state.renameWrites, 1);
  } finally { f.restore(); }
});
test("an upstream account ID mismatch never commits a different mailbox", async () => {
  const f = await fixture(); process.env.MAIL_MODE = "stalwart";
  try {
    f.state.foreignAccount = true;
    const response = await f.call("POST", { expected_email: f.old, email: f.profile.user.email });
    assert.equal(response.json().pending_email, f.profile.user.email);
    assert.equal((await f.member()).email, f.old); assert.equal((await f.member()).mail_account_id, "owned-account");
    f.state.foreignAccount = false;
    assert.equal((await f.call("POST", { expected_email: f.old, email: f.profile.user.email })).json().pending_email, null);
  } finally { f.restore(); }
});
