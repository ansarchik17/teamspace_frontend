import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { suggestedEmployeeLogin } from "../shared/companyMailNaming.js";

// A private schema permits running alongside the existing mail security suite.
const url = new URL(process.env.DATABASE_URL!);
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.endsWith("_test"), "A disposable loopback *_test database is required");
const root = new pg.Pool({ connectionString: url.toString() });
const schema = "mail_names_" + randomUUID().replaceAll("-", "");
await root.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
process.env.MAIL_MODE = "local";
process.env.WORKSPACE_MAIL_DOMAIN_BASE = "teamspace.test";
const { pool, query } = await import("../server/db.js");
const { migrate } = await import("../server/migrate.js");
const { syncWorkspaceProfile, syncWorkspaceDirectory } = await import("../server/workspace.js");
await migrate();
after(async () => { await pool.end(); await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); });
let nextId = 100;
function profile(first = "Султан", last = "Кыдыр", slug = "axis") {
  const id = ++nextId, company = randomUUID();
  return { organization: { id: company, name: "Synthetic company", slug, status: "active", owner_id: id },
    user: { id, first_name: first, last_name: last, username: `external.login${id}@example.invalid`, email: `personal${id}@example.invalid`, is_active: true, organization_id: company } };
}
async function member(id: string) { return (await query("SELECT * FROM memberships WHERE id=$1", [id]))[0]; }
async function eventually<T>(fn: () => Promise<T>): Promise<T> {
  for (let n = 0; ; n++) { try { return await fn(); } catch (error: any) {
    if (error.code !== "MAIL_BUSY" || n >= 50) throw error;
    await new Promise(resolve => setTimeout(resolve, 20));
  } }
}

test("mail and employee form use the same Cyrillic/Kazakh/Latin naming rule", () => {
  for (const [first, last, expected] of [["Султан", "Кыдыр", "s.kydyr"], ["Әлия", "Қасымова", "a.qasymova"], ["Жан", "Ёлкин", "z.yolkin"], [" Émile ", "O'Neil", "e.o-neil"], ["", "Name", ""]])
    assert.equal(suggestedEmployeeLogin(first, last), expected);
});
test("invitation's external email and login never become the work address", async () => {
  const p = profile();
  const result = await syncWorkspaceProfile(p);
  assert.equal((await member(result.memberId)).email, "s.kydyr@axis.teamspace.test");
  assert.equal(p.user.email.startsWith("personal"), true);
});
test("namesakes get numeric suffixes; another company has its own namespace", async () => {
  const p = profile("Әлия", "Қасымова", "namesakes");
  const results = await Promise.all([1, 2, 3].map(n => eventually(() => syncWorkspaceProfile({ ...p, user: { ...p.user, id: 1000 + n } }))));
  const emails = await Promise.all(results.map(async r => (await member(r.memberId)).email));
  assert.deepEqual(emails.sort(), ["a.qasymova2@namesakes.teamspace.test", "a.qasymova3@namesakes.teamspace.test", "a.qasymova@namesakes.teamspace.test"].sort());
  const other = await syncWorkspaceProfile(profile("Әлия", "Қасымова", "other-company"));
  assert.equal((await member(other.memberId)).email, "a.qasymova@other-company.teamspace.test");
});
test("a reassigned preferred email creates a separate mailbox and reserves colleagues' addresses", async () => {
  const legacy = profile("Old", "Owner", "reassigned");
  legacy.user.email = "d.company@reassigned.teamspace.test";
  const old = await syncWorkspaceProfile(legacy);
  await query("UPDATE memberships SET mail_secret='unchanged-owner-secret',mail_object_id='original-object',mail_account_id='original-account' WHERE id=$1", [old.memberId]);
  const before = await member(old.memberId);
  const replacement = { ...legacy, user: { ...legacy.user, id: ++nextId, first_name: "New", last_name: "Owner" } };
  const reserved = new Set(["d.company2@reassigned.teamspace.test"]);
  const created = await syncWorkspaceProfile(replacement, reserved);
  assert.equal((await member(created.memberId)).email, "d.company3@reassigned.teamspace.test");
  assert.notEqual(created.userId, old.userId);
  assert.equal((await member(created.memberId)).mail_secret, null);
  assert.deepEqual(await member(old.memberId), before, "A reused profile email must not transfer an existing mailbox");
  assert.equal((await syncWorkspaceProfile(replacement)).memberId, created.memberId);
});
test("suffix allocation keeps a maximal preferred local part within 64 characters", async () => {
  const p = profile("Long", "Address", "long-address");
  p.user.email = "a".repeat(64) + "@long-address.teamspace.test";
  await syncWorkspaceProfile(p);
  const second = await syncWorkspaceProfile({ ...p, user: { ...p.user, id: ++nextId } });
  assert.equal((await member(second.memberId)).email, "a".repeat(63) + "2@long-address.teamspace.test");
});
test("repeated/concurrent sign-in and renamed profiles preserve pending and real mailboxes", async () => {
  for (const real of [false, true]) {
    const p = profile("Legacy", "Employee", real ? "real-existing" : "pending-existing");
    p.user.email = `legacy-${p.user.id}@${p.organization.slug}.teamspace.test`;
    const initial = await syncWorkspaceProfile(p);
    await query("UPDATE memberships SET mail_secret='persisted-test-secret',mail_object_id=$1,mail_account_id=$2,quota_mb=777 WHERE id=$3", [real ? "existing-object" : null, real ? "existing-account" : null, initial.memberId]);
    const before = await member(initial.memberId);
    const changed = { ...p, user: { ...p.user, first_name: "Different", last_name: "Surname", username: "changed.login", email: "changed@example.invalid" } };
    const retries = await Promise.all([1, 2, 3].map(() => eventually(() => syncWorkspaceProfile(changed))));
    for (const retry of retries) assert.equal(retry.memberId, initial.memberId);
    assert.deepEqual(await member(initial.memberId), before, "Existing addresses, secrets, IDs and quotas must remain unchanged");
    await assert.rejects(syncWorkspaceProfile({ ...changed, organization: { ...p.organization, slug: "renamed-company" } }), { code: "MAIL_ADDRESS_CHANGED" });
    assert.deepEqual(await member(initial.memberId), before);
  }
});
test("directory reserves form-assigned addresses and uses separate names, not display-name order", async () => {
  const p = profile("Test", "Person", "directory");
  process.env.WORKSPACE_API_URL = "https://workspace.example.invalid";
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([
    { ...p.user, full_name: "Person Test" },
    { id: 7001, username: "form-user", email: "t.person@directory.teamspace.test", first_name: "Test", last_name: "Person", full_name: "Person Test", is_active: true },
    { id: 7002, username: "legacy-missing-names", email: "legacy@example.invalid", full_name: "Unsplit legacy name", is_active: true },
  ]);
  try {
    await syncWorkspaceDirectory(p, "synthetic-token");
    const own = await syncWorkspaceProfile(p);
    assert.equal((await member(own.memberId)).email, "t.person2@directory.teamspace.test");
    const form = (await query("SELECT m.email FROM memberships m JOIN identities u ON u.id=m.user_id WHERE u.workspace_user_id=7001"))[0];
    assert.equal(form.email, "t.person@directory.teamspace.test");
    assert.equal((await query("SELECT id FROM identities WHERE workspace_user_id=7002")).length, 0);
  } finally { globalThis.fetch = oldFetch; }
});
test("remote occupied addresses are skipped; management failure rolls back without taking over mail", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mail-names-"));
  const key = join(dir, "key"); await writeFile(key, "synthetic-test-key");
  process.env.STALWART_API_KEY_FILE = key; process.env.STALWART_URL = "http://127.0.0.1:9"; process.env.MAIL_MODE = "stalwart";
  const oldFetch = globalThis.fetch; let unavailable = false;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)), method = request.methodCalls[0][0];
    assert.ok(["x:Domain/get", "x:Account/get"].includes(method), "Allocation must never change an existing remote account");
    if (unavailable) return new Response("unavailable", { status: 503 });
    const list = method === "x:Domain/get" ? [{ id: "remote-domain", name: "remote.teamspace.test" }] : [{ id: "untouched", domainId: "remote-domain", name: "s.kydyr" }];
    return Response.json({ methodResponses: [[method, { list }, "names"]] });
  };
  try {
    const p = profile("Султан", "Кыдыр", "remote");
    p.user.email = "s.kydyr@remote.teamspace.test";
    const result = await syncWorkspaceProfile(p);
    assert.equal((await member(result.memberId)).email, "s.kydyr2@remote.teamspace.test");
    const next = { ...p, user: { ...p.user, id: ++nextId } }; unavailable = true;
    await assert.rejects(syncWorkspaceProfile(next));
    assert.equal((await query("SELECT id FROM identities WHERE workspace_user_id=$1", [next.user.id])).length, 0);
    unavailable = false;
    assert.equal((await member((await syncWorkspaceProfile(next)).memberId)).email, "s.kydyr3@remote.teamspace.test");
  } finally {
    globalThis.fetch = oldFetch; process.env.MAIL_MODE = "local";
    delete process.env.STALWART_API_KEY_FILE; delete process.env.STALWART_URL;
    await rm(dir, { recursive: true, force: true });
  }
});
test("directory defers a colleague's exhausted namespace but rejects the caller's own conflict", async () => {
  const p = profile("Existing", "Employee", "exhausted");
  const own = await syncWorkspaceProfile(p);
  const colleague = { ...p.user, id: ++nextId, first_name: "New", last_name: "Employee", email: "taken@exhausted.teamspace.test" };
  const dir = await mkdtemp(join(tmpdir(), "mail-exhausted-"));
  const key = join(dir, "key"); await writeFile(key, "synthetic-test-key");
  process.env.STALWART_API_KEY_FILE = key; process.env.STALWART_URL = "http://127.0.0.1:9";
  process.env.MAIL_MODE = "stalwart"; process.env.WORKSPACE_API_URL = "https://workspace.example.invalid";
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    if (!init?.body) return Response.json([p.user, colleague].map(user => ({ ...user, full_name: `${user.last_name} ${user.first_name}` })));
    const method = JSON.parse(String(init.body)).methodCalls[0][0];
    assert.ok(["x:Domain/get", "x:Account/get"].includes(method));
    const list = method === "x:Domain/get" ? [{ id: "remote-domain", name: "exhausted.teamspace.test" }] : Array.from({ length: 2000 }, (_, n) => ({ id: String(n), domainId: "remote-domain", name: `taken${n ? n + 1 : ""}` }));
    return Response.json({ methodResponses: [[method, { list }, "names"]] });
  };
  try {
    await syncWorkspaceDirectory(p, "synthetic-token");
    assert.equal((await syncWorkspaceProfile(p)).memberId, own.memberId);
    assert.equal((await query("SELECT id FROM identities WHERE workspace_user_id=$1", [colleague.id])).length, 0);
    const [event] = await query("SELECT detail FROM audit_events WHERE tenant_id=$1 AND action='workspace.directory.deferred'", [own.tenantId]);
    assert.deepEqual(event.detail.members, [{ user_id: colleague.id, code: "MAIL_ADDRESS_CONFLICT" }]);
    await assert.rejects(syncWorkspaceDirectory({ ...p, user: colleague }, "synthetic-token"), { code: "MAIL_ADDRESS_CONFLICT" });
    globalThis.fetch = async () => Response.json([]);
    await assert.rejects(syncWorkspaceDirectory(p, "synthetic-token"), { code: "WORKSPACE_ACCESS" });
  } finally {
    globalThis.fetch = oldFetch; process.env.MAIL_MODE = "local";
    delete process.env.STALWART_API_KEY_FILE; delete process.env.STALWART_URL;
    await rm(dir, { recursive: true, force: true });
  }
});
test("directory quota exhaustion of a colleague does not block an existing employee", async () => {
  const p = profile("Existing", "Employee", "quota-deferred");
  const own = await syncWorkspaceProfile(p);
  await query("UPDATE tenants SET workspace_storage_bytes=$1 WHERE id=$2", [5120 * 1048576, own.tenantId]);
  const colleague = { ...p.user, id: ++nextId, email: "new@quota-deferred.teamspace.test" };
  process.env.MAIL_MODE = "stalwart"; process.env.WORKSPACE_API_URL = "https://workspace.example.invalid";
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([colleague, p.user].map(user => ({ ...user, full_name: `${user.last_name} ${user.first_name}` })));
  try {
    await syncWorkspaceDirectory(p, "synthetic-token");
    assert.equal((await syncWorkspaceProfile(p)).memberId, own.memberId);
    const [event] = await query("SELECT detail FROM audit_events WHERE tenant_id=$1 AND action='workspace.directory.deferred'", [own.tenantId]);
    assert.deepEqual(event.detail.members, [{ user_id: colleague.id, code: "TENANT_QUOTA" }]);
    await assert.rejects(syncWorkspaceDirectory({ ...p, user: colleague }, "synthetic-token"), { code: "TENANT_QUOTA" });
  } finally { globalThis.fetch = oldFetch; process.env.MAIL_MODE = "local"; }
});
