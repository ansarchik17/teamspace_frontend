import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, tx, fail } from "./db.js";
import { context } from "./auth.js";
import { decrypt, encrypt } from "./security.js";
import { management, discoverSession, withProvisioningLock, syncStalwart } from "./stalwart.js";
import { workspaceMailboxAddress } from "./workspace.js";

// Management writes only the name of this already-owned object. Neither user
// IDs nor mailbox IDs, passwords, messages, roles or quotas are transferred.
async function remoteAccount(member: any, domain: any, target: string) {
  const list = (await management([["x:Account/get", { properties: ["id", "name", "domainId", "aliases"] }, "address"]]))?.[0]?.[1]?.list;
  if (!Array.isArray(list)) fail(503, "MAIL_RESPONSE", "Не удалось проверить адреса почтового сервера");
  const own = list.find((a: any) => a.id === member.mail_object_id);
  if (!own || own.domainId !== domain.stalwart_id) fail(409, "MAIL_OWNERSHIP", "Привязка существующего почтового ящика не подтверждена");
  const local = target.split("@")[0];
  if (list.some((a: any) => a.id !== own.id &&
      ((a.domainId === domain.stalwart_id && a.name?.toLowerCase() === local) ||
       Object.values(a.aliases ?? {}).some((alias: any) => alias.domainId === domain.stalwart_id && alias.name?.toLowerCase() === local))))
    fail(409, "MAIL_ADDRESS_CONFLICT", "Адрес занят другим ящиком. Сначала исправьте адрес его владельца");
  return own;
}

// Runs under the provisioning lock. A pending reservation survives a crash
// between the Stalwart change and the local commit, so the next tick resumes it.
export async function reconcileMailboxAddress(member: any, domains: any[]) {
  const target = member.mail_pending_email;
  const domain = domains.find(d => d.tenant_id === member.tenant_id && d.name === target.split("@")[1]);
  if (!domain || target.split("@")[1] !== member.email.split("@")[1]) fail(409, "MAIL_DOMAIN", "Смена домена требует отдельного переноса");
  const own = await remoteAccount(member, domain, target);
  const credential = JSON.parse(decrypt(member.mail_secret));
  if (typeof credential.password !== "string" || !credential.password) fail(409, "MAIL_CREDENTIAL", "Ящик не использует управляемое подключение");
  const secret = encrypt(JSON.stringify({ ...credential, login: target }));
  if (own.name !== target.split("@")[0]) {
    if (own.name !== member.email.split("@")[0]) fail(409, "MAIL_OWNERSHIP", "Адрес почтового объекта изменён вне приложения");
    const before = await discoverSession(member.mail_secret);
    if (!before.ok || (await before.json()).primaryAccounts?.["urn:ietf:params:jmap:mail"] !== member.mail_account_id)
      fail(409, "MAIL_OWNERSHIP", "Сохранённое подключение не подтверждает владельца ящика");
    await management([["x:Account/set", { update: { [own.id]: { name: target.split("@")[0] } } }, "address"]]);
  }
  const response = await discoverSession(secret);
  if (!response.ok) fail(503, "MAIL_ADDRESS_PENDING", "Адрес обновляется; подключение будет повторено автоматически");
  const session: any = await response.json();
  if (session.primaryAccounts?.["urn:ietf:params:jmap:mail"] !== member.mail_account_id)
    fail(409, "MAIL_OWNERSHIP", "После смены адреса изменился ID почтового ящика");
  await tx(async db => {
    const changed = await db.query("UPDATE memberships SET email=$1,mail_secret=$2,mail_pending_email=null,mail_sync_hash=null,mail_error=null,mail_auth_failed=false WHERE id=$3 AND email=$4 AND mail_pending_email=$1 RETURNING id", [target, secret, member.id, member.email]);
    if (changed.rowCount !== 1) fail(409, "MAIL_ADDRESS_CHANGED", "Состояние ящика изменилось; обновите страницу");
    await db.query("INSERT INTO audit_events(tenant_id,action,resource_id,detail) VALUES($1,'member.mail_address_changed',$2,$3)", [member.tenant_id, member.id, JSON.stringify({ from: member.email, to: target, mail_object_id: own.id })]);
  });
  Object.assign(member, { email: target, mail_secret: secret, mail_pending_email: null, mail_auth_failed: false });
}

export function registerMailboxAddressRoutes(app: FastifyInstance) {
  const path = "/api/members/:id/address";
  async function load(req: any) {
    const c = await context(req, { roles: ["tenant_admin"] });
    if (!c.session.workspace_token || !c.tenant.workspace_org_id) fail(409, "WORKSPACE_REQUIRED", "Войдите через Workspace компании");
    const [member] = await query("SELECT m.*,u.workspace_user_id FROM memberships m JOIN identities u ON u.id=m.user_id WHERE m.id=$1 AND m.tenant_id=$2", [z.string().uuid().parse(req.params.id), c.tenant.id]);
    if (!member || !member.workspace_user_id) fail(404, "NOT_FOUND", "Ящик сотрудника Workspace не найден");
    const address = await workspaceMailboxAddress(decrypt(c.session.workspace_token), c.tenant.workspace_org_id, Number(member.workspace_user_id));
    return { c, member, address };
  }
  app.get(path, async req => {
    const { member, address } = await load(req);
    return { email: member.email, workspace_email: address, pending_email: member.mail_pending_email };
  });
  app.post(path, async req => {
    const b = z.object({ expected_email: z.string().email(), email: z.string().email() }).strict().parse(req.body);
    const { c, member, address } = await load(req);
    if (b.email !== address) fail(409, "WORKSPACE_ADDRESS_CHANGED", "Адрес Workspace изменился. Выполните проверку повторно");
    await withProvisioningLock(() => tx(async db => {
      const m = (await db.query("SELECT * FROM memberships WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [member.id, c.tenant.id])).rows[0];
      if (m.email === address && !m.mail_pending_email) return;
      if (m.email !== b.expected_email || (m.mail_pending_email && m.mail_pending_email !== address)) fail(409, "MAIL_ADDRESS_CHANGED", "Адрес ящика изменился. Обновите страницу");
      if (!m.mail_managed || !m.mail_object_id || !m.mail_account_id || !m.mail_secret || m.status !== "active") fail(409, "MAIL_NOT_READY", "Сначала подключите действующий управляемый ящик");
      const domain = (await db.query("SELECT * FROM domains WHERE tenant_id=$1 AND name=$2 AND verified=true", [c.tenant.id, address.split("@")[1]])).rows[0];
      if (!domain || m.email.split("@")[1] !== domain.name) fail(409, "MAIL_DOMAIN", "Смена домена требует отдельного переноса");
      if ((await db.query("SELECT id FROM memberships WHERE id<>$1 AND (lower(email)=$2 OR lower(mail_pending_email)=$2)", [m.id, address])).rows.length) fail(409, "MAIL_ADDRESS_CONFLICT", "Адрес занят другим ящиком. Сначала исправьте адрес его владельца");
      await remoteAccount(m, domain, address);
      await db.query("UPDATE memberships SET mail_pending_email=$1,mail_sync_hash=null WHERE id=$2", [address, m.id]);
      await db.query("INSERT INTO audit_events(tenant_id,actor_id,action,resource_id,detail) VALUES($1,$2,'member.mail_address_requested',$3,$4)", [c.tenant.id, c.user.id, m.id, JSON.stringify({ from: m.email, to: address })]);
    }));
    await syncStalwart(member.id);
    const [updated] = await query("SELECT email,mail_pending_email,mail_error FROM memberships WHERE id=$1", [member.id]);
    return { email: updated.email, pending_email: updated.mail_pending_email, error: updated.mail_error };
  });
}
