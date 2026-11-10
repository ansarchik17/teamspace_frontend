import { query, tx, fail, ApiError } from "./db.js";
import { encrypt, decrypt, hashPassword, token } from "./security.js";
import { liveState } from "./mail-budget.js";
import { withProvisioningLock, management } from "./stalwart.js";
import { suggestedEmployeeLogin } from "../shared/companyMailNaming.js";
import type { PoolClient } from "pg";

type WorkspaceUser = {
  id: number;
  username: string;
  email?: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  organization_id: string | null;
};
type WorkspaceOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_id: number | null;
};
export type WorkspaceProfile = { user: WorkspaceUser; organization: WorkspaceOrganization };
type WorkspaceMember = { id: number; username: string; email?: string; full_name: string; first_name?: string; last_name?: string; is_active: boolean };

function workspaceUrl(path: string) {
  const base = process.env.WORKSPACE_API_URL;
  if (!base) fail(503, "WORKSPACE_CONFIG", "Связь с Workspace не настроена");
  let origin: URL;
  try { origin = new URL(base); }
  catch { fail(503, "WORKSPACE_CONFIG", "Некорректный адрес Workspace"); }
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
    fail(503, "WORKSPACE_CONFIG", "Для Workspace требуется HTTPS");
  return new URL(path, origin);
}

async function workspaceGet(path: string, accessToken: string) {
  let response: Response;
  try {
    response = await fetch(workspaceUrl(path), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    fail(503, "WORKSPACE_UNAVAILABLE", "Workspace временно недоступен");
  }
  if (response.status === 401 || response.status === 403 || response.status === 404)
    fail(401, "WORKSPACE_AUTH", "Сессия Workspace недействительна или доступ к компании отозван");
  if (!response.ok) fail(503, "WORKSPACE_UNAVAILABLE", "Workspace временно недоступен");
  try {
    return await response.json();
  } catch {
    fail(502, "WORKSPACE_RESPONSE", "Некорректный ответ Workspace");
  }
}

export async function workspaceProfile(accessToken: string): Promise<WorkspaceProfile> {
  const [user, organization] = await Promise.all([
    workspaceGet("/api/v1/auth/me", accessToken),
    workspaceGet("/api/v1/organizations/current", accessToken),
  ]) as [WorkspaceUser, WorkspaceOrganization];
  if (!Number.isSafeInteger(user?.id) || user.id <= 0 || !user.is_active ||
      !organization || user.organization_id !== organization.id || organization.status !== "active" ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(organization.slug) ||
      typeof organization.name !== "string" || typeof user.username !== "string")
    fail(403, "WORKSPACE_ACCESS", "Нет активного доступа к компании Workspace");
  return { user, organization };
}

function mailDomain(profile: WorkspaceProfile) {
  const base = process.env.WORKSPACE_MAIL_DOMAIN_BASE?.trim().toLowerCase();
  if (!base || !/^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(base))
    fail(503, "WORKSPACE_CONFIG", "Не настроен домен почты компаний Workspace");
  const domain = `${profile.organization.slug}.${base}`;
  if (domain.length > 253) fail(503, "WORKSPACE_CONFIG", "Почтовый домен компании слишком длинный");
  return domain;
}

function preferredAddress(email: string | undefined, domain: string) {
  const preferred = email?.trim().toLowerCase();
  const [mailLocal, mailDomain, extra] = preferred?.split("@") ?? [];
  const validLocal = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(mailLocal || "") && !mailLocal?.includes("..") && (mailLocal?.length ?? 0) <= 64;
  return validLocal && mailDomain === domain && !extra ? preferred : undefined;
}

// Called only for a new membership, under the existing global provisioning lock.
// Pending/suspended memberships and accounts outside Workspace also reserve names.
async function allocateMailAddress(db: PoolClient, profile: WorkspaceProfile, domain: string, reserved: Set<string>) {
  const preferred = preferredAddress(profile.user.email, domain);
  const local = suggestedEmployeeLogin(profile.user.first_name, profile.user.last_name);
  if (!preferred && !local) fail(400, "MAIL_NAME_REQUIRED", "Для создания рабочей почты укажите имя и фамилию сотрудника");
  // An address in a Workspace profile is a preference, not proof of ownership
  // of a mailbox created for another immutable user ID. Allocate a fresh name
  // on collision; never move that mailbox or reuse its credentials.
  const base = preferred?.split("@")[0] || local;
  const candidates = Array.from({ length: 2000 }, (_, n) => {
    const suffix = n ? String(n + 1) : "";
    const stem = base.slice(0, 64 - suffix.length).replace(/[^a-z0-9]+$/g, "");
    return `${stem}${suffix}@${domain}`;
  });
  const used = new Set<string>((await db.query("SELECT lower(address) AS email FROM memberships CROSS JOIN LATERAL unnest(ARRAY[email,mail_pending_email]) AS address WHERE lower(address)=ANY($1::text[])", [candidates])).rows.map(row => row.email));
  if (process.env.MAIL_MODE === "stalwart") {
    const domains = (await management([["x:Domain/get", { properties: ["id", "name"] }, "names"]]))?.[0]?.[1]?.list;
    if (!Array.isArray(domains)) fail(503, "MAIL_RESPONSE", "Не удалось проверить домен почты");
    const remoteDomain = domains.find((d: any) => d.name.toLowerCase() === domain);
    if (remoteDomain) {
      const accounts = (await management([["x:Account/get", { properties: ["id", "name", "domainId"] }, "names"]]))?.[0]?.[1]?.list;
      if (!Array.isArray(accounts)) fail(503, "MAIL_RESPONSE", "Не удалось проверить занятые адреса почты");
      for (const account of accounts) if (account.domainId === remoteDomain.id) used.add(`${account.name}@${domain}`.toLowerCase());
    }
  }
  const email = candidates.find(candidate => !used.has(candidate) && (candidate === preferred || !reserved.has(candidate)));
  if (!email) fail(409, "MAIL_ADDRESS_CONFLICT", "Не удалось подобрать свободный рабочий адрес почты");
  return email;
}

export async function syncWorkspaceProfile(profile: WorkspaceProfile, reserved = new Set<string>()) {
  const { user, organization } = profile;
  const domain = mailDomain(profile);
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username;
  const role = organization.owner_id === user.id ? "tenant_admin" : "user";
  const quotaMb = 5120; // Standard 5 GiB; only administrators change individual quotas.
  return withProvisioningLock(() => tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(90210,hashtext($1))", [organization.id]);
    let tenant = (await db.query("SELECT * FROM tenants WHERE workspace_org_id=$1 FOR UPDATE", [organization.id])).rows[0];
    if (!tenant) {
      const consentText = process.env.WORKSPACE_MAIL_CONSENT_TEXT?.trim() ||
        "Корпоративная почта предоставляется вашей организацией. Для работы сервиса обрабатываются данные учётной записи, адреса и содержимое переписки. Продолжая, вы подтверждаете ознакомление с этим уведомлением.";
      tenant = (await db.query(
        "INSERT INTO tenants(name,slug,workspace_org_id,quota_mb,consent_text) VALUES($1,$2,$3,1000000,$4) RETURNING *",
        [organization.name, `ws-${organization.id}`, organization.id, consentText],
      )).rows[0];
    } else {
      await db.query("UPDATE tenants SET name=$1,status='active' WHERE id=$2", [organization.name, tenant.id]);
    }
    const existingDomain = (await db.query("SELECT tenant_id FROM domains WHERE name=$1", [domain])).rows[0];
    if (existingDomain && existingDomain.tenant_id !== tenant.id)
      fail(409, "MAIL_DOMAIN_CONFLICT", "Домен почты уже закреплён за другой компанией");
    await db.query(
      "INSERT INTO domains(tenant_id,name,verification_token,verified) VALUES($1,$2,$3,true) ON CONFLICT(name) DO NOTHING",
      [tenant.id, domain, token()],
    );
    await db.query("UPDATE domains SET verified=true WHERE tenant_id=$1 AND name=$2", [tenant.id, domain]);
    let identity = (await db.query("SELECT * FROM identities WHERE workspace_user_id=$1 FOR UPDATE", [user.id])).rows[0];
    if (!identity) {
      identity = (await db.query(
        "INSERT INTO identities(login,name,password_hash,must_change,workspace_user_id) VALUES($1,$2,$3,false,$4) RETURNING *",
        [`workspace:${user.id}`, displayName, await hashPassword(token()), user.id],
      )).rows[0];
    } else {
      await db.query("UPDATE identities SET name=$1,active=true WHERE id=$2", [displayName, identity.id]);
    }
    await db.query(
      "UPDATE memberships SET status='suspended' WHERE user_id=$1 AND tenant_id<>$2 AND tenant_id IN (SELECT id FROM tenants WHERE workspace_org_id IS NOT NULL)",
      [identity.id, tenant.id],
    );
    let member = (await db.query("SELECT * FROM memberships WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE", [tenant.id, identity.id])).rows[0];
    if (!member) {
      if (tenant.workspace_storage_bytes != null) {
        const state = await liveState(tenant);
        if (state.allocated + quotaMb * 1048576 > Number(tenant.workspace_storage_bytes))
          fail(409, "TENANT_QUOTA", "В почтовом бюджете компании недостаточно места для стартовой квоты 5 ГиБ. Обратитесь к администратору.");
      }
      const email = await allocateMailAddress(db, profile, domain, reserved);
      member = (await db.query(
        "INSERT INTO memberships(tenant_id,user_id,role,email,quota_mb) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [tenant.id, identity.id, role, email, quotaMb],
      )).rows[0];
    } else {
      if (member.email.split("@")[1] !== domain)
        fail(409, "MAIL_ADDRESS_CHANGED", "Адрес ящика изменился; требуется миграция почты");
      // A membership may already hold a persisted secret or an upstream account
      // whose creation response was lost. Never rename even an unfinished one.
      await db.query("UPDATE memberships SET role=$1,status='active' WHERE id=$2", [role, member.id]);
    }
    return { tenantId: tenant.id as string, userId: identity.id as string, memberId: member.id as string };
  }));
}

export async function syncWorkspaceDirectory(profile: WorkspaceProfile, accessToken: string) {
  const raw = await workspaceGet("/api/v1/organizations/current/users", accessToken);
  if (!Array.isArray(raw) || raw.length > 100000 ||
      raw.some((m) => !Number.isSafeInteger(m?.id) || m.id <= 0 || typeof m.username !== "string" ||
        typeof m.full_name !== "string" || typeof m.is_active !== "boolean" ||
        (m.first_name !== undefined && typeof m.first_name !== "string") || (m.last_name !== undefined && typeof m.last_name !== "string")))
    fail(502, "WORKSPACE_DIRECTORY", "Список сотрудников Workspace некорректен");
  const members = raw as WorkspaceMember[];
  const currentMember = members.find((m) => m.id === profile.user.id && m.is_active);
  if (!currentMember)
    fail(403, "WORKSPACE_ACCESS", "Нет доступа к списку сотрудников компании");
  const ids = new Set<number>();
  for (const member of members) {
    if (ids.has(member.id)) fail(502, "WORKSPACE_DIRECTORY", "В списке сотрудников есть повторы");
    ids.add(member.id);
  }
  // The employee form may already have assigned a corporate address to someone
  // who has not opened Mail yet. Do not allocate it to a namesake invitation.
  const domain = mailDomain(profile);
  const reserved = new Set(members.map(m => preferredAddress(m.email, domain)).filter((email): email is string => Boolean(email)));
  const deferred: { user_id: number; code: string }[] = [];
  // Reserve the caller's quota before attempting new colleague mailboxes.
  for (const member of [currentMember, ...members.filter(m => m.id !== currentMember.id)]) {
    if (!member.is_active) continue;
    try { await syncWorkspaceProfile({
      organization: profile.organization,
      user: member.id === profile.user.id ? profile.user : {
        id: member.id, username: member.username, email: member.email, first_name: member.first_name ?? member.full_name,
        last_name: member.last_name ?? "", is_active: true, organization_id: profile.organization.id,
      },
    }, reserved); } catch (error) {
      // One unallocated colleague must not prevent an existing employee from
      // signing in. Keep access validation and infrastructure failures fatal,
      // and never suppress a failure for the employee who is signing in.
      if (!(error instanceof ApiError) ||
          !["MAIL_NAME_REQUIRED", "MAIL_ADDRESS_CONFLICT", "TENANT_QUOTA"].includes(error.code) ||
          member.id === profile.user.id) throw error;
      deferred.push({ user_id: member.id, code: error.code });
    }
  }
  const [tenant] = await query("SELECT id FROM tenants WHERE workspace_org_id=$1", [profile.organization.id]);
  if (deferred.length) await query(
    "INSERT INTO audit_events(tenant_id,action,detail) VALUES($1,'workspace.directory.deferred',$2)",
    [tenant.id, JSON.stringify({ members: deferred })],
  );
  await query(
    "UPDATE memberships SET status='suspended' WHERE tenant_id=$1 AND user_id IN (SELECT id FROM identities WHERE workspace_user_id IS NOT NULL AND NOT (workspace_user_id = ANY($2::bigint[])))",
    [tenant.id, members.filter((m) => m.is_active).map((m) => m.id)],
  );
  await query("UPDATE tenants SET workspace_directory_checked_at=now() WHERE id=$1", [tenant.id]);
}

export async function verifyWorkspaceSession(session: any) {
  if (!session.workspace_token) return;
  if (session.workspace_checked_at && Date.now() - new Date(session.workspace_checked_at).getTime() < 60000) return;
  try {
    const accessToken = decrypt(session.workspace_token);
    const profile = await workspaceProfile(accessToken);
    const [link] = await query(
      "SELECT t.workspace_org_id,u.workspace_user_id FROM sessions s JOIN tenants t ON t.id=s.tenant_id JOIN identities u ON u.id=s.user_id WHERE s.id_hash=$1",
      [session.id_hash],
    );
    if (!link || link.workspace_org_id !== profile.organization.id || Number(link.workspace_user_id) !== profile.user.id)
      fail(403, "WORKSPACE_ACCESS", "Принадлежность к компании изменилась");
    await syncWorkspaceProfile(profile);
    const [tenant] = await query("SELECT workspace_directory_checked_at FROM tenants WHERE workspace_org_id=$1", [profile.organization.id]);
    if (!tenant?.workspace_directory_checked_at || Date.now() - new Date(tenant.workspace_directory_checked_at).getTime() > 300000)
      await syncWorkspaceDirectory(profile, accessToken);
    await query("UPDATE sessions SET workspace_checked_at=now() WHERE id_hash=$1", [session.id_hash]);
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status))
      await query("DELETE FROM sessions WHERE id_hash=$1", [session.id_hash]);
    throw error;
  }
}

export const encryptedWorkspaceToken = encrypt;

export async function workspaceMailboxAddress(accessToken: string, organizationId: string, userId: number) {
  const profile = await workspaceProfile(accessToken);
  if (profile.organization.id !== organizationId) fail(403, "WORKSPACE_ACCESS", "Компания Workspace изменилась");
  const raw = await workspaceGet("/api/v1/organizations/current/users", accessToken);
  if (!Array.isArray(raw)) fail(502, "WORKSPACE_DIRECTORY", "Некорректный список сотрудников Workspace");
  const matches = raw.filter(m => m?.id === userId && m.is_active === true);
  if (matches.length !== 1) fail(409, "WORKSPACE_MEMBER", "Нет единственного активного сотрудника Workspace для этого ящика");
  const address = preferredAddress(matches[0].email, mailDomain(profile));
  if (!address) fail(409, "WORKSPACE_ADDRESS", "У сотрудника Workspace нет корректного корпоративного адреса");
  return address;
}
