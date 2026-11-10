import type { FastifyRequest, FastifyReply } from "fastify";
import { query, fail } from "./db.js";
import { digest } from "./security.js";
import { verifyWorkspaceSession } from "./workspace.js";
export type Context = { user: any; session: any; member: any; tenant: any };
export async function audit(
  tenant: string | null,
  actor: string | null,
  action: string,
  resource: string | null = null,
  detail: any = {},
) {
  await query(
    "INSERT INTO audit_events(tenant_id,actor_id,action,resource_id,detail) VALUES($1,$2,$3,$4,$5)",
    [tenant, actor, action, resource, detail],
  );
}
export async function context(
  req: FastifyRequest,
  options: { onboarding?: boolean; platform?: boolean; roles?: string[] } = {},
): Promise<Context> {
  const cookie = req.cookies.axis_session;
  if (!cookie) fail(401, "UNAUTHENTICATED", "Войдите в систему");
  const [s] = await query(
    "SELECT * FROM sessions WHERE id_hash=$1 AND expires_at>now() AND last_seen>now()-interval '30 minutes'",
    [digest(cookie)],
  );
  if (!s) fail(401, "UNAUTHENTICATED", "Сессия завершена. Войдите снова");
  await verifyWorkspaceSession(s);
  const [u] = await query(
    "SELECT * FROM identities WHERE id=$1 AND active=true",
    [s.user_id],
  );
  if (!u) fail(401, "UNAUTHENTICATED", "Учётная запись заблокирована");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers["x-csrf-token"] !== s.csrf
  )
    fail(403, "CSRF", "Обновите страницу и повторите запрос");
  await query("UPDATE sessions SET last_seen=now() WHERE id_hash=$1", [
    s.id_hash,
  ]);
  const [m] = s.tenant_id
    ? await query(
        "SELECT * FROM memberships WHERE user_id=$1 AND tenant_id=$2 AND status='active'",
        [u.id, s.tenant_id],
      )
    : [];
  const [t] = s.tenant_id
    ? await query("SELECT * FROM tenants WHERE id=$1", [s.tenant_id])
    : [];
  if (!options.onboarding) {
    const expired =
      Date.now() - new Date(u.password_changed_at).getTime() >
      (t?.password_days ?? 90) * 86400000;
    if (!s.workspace_token && (u.must_change || expired))
      fail(403, "PASSWORD_CHANGE_REQUIRED", "Необходимо сменить пароль");
    if (options.platform) {
      if (!u.platform_admin)
        fail(403, "FORBIDDEN", "Нет прав администратора платформы");
    } else {
      if (!m || !t || t.status !== "active")
        fail(403, "TENANT_ACCESS_DENIED", "Нет доступа к выбранной компании");
      if (req.url.startsWith("/api/mail/") && m.mail_pending_email)
        fail(503, "MAIL_ADDRESS_UPDATING", "Обновляется адрес ящика. Повторите через несколько секунд");
      const [c] = await query(
        "SELECT accepted FROM consents WHERE tenant_id=$1 AND user_id=$2 AND version=$3 ORDER BY created_at DESC LIMIT 1",
        [t.id, u.id, t.consent_version],
      );
      if (!c?.accepted)
        fail(
          403,
          "CONSENT_REQUIRED",
          "Необходимо ознакомиться с условиями обработки данных",
        );
      if (
        req.url.startsWith("/api/mail/") &&
        (process.env.MAIL_MODE === "stalwart" || t.workspace_storage_bytes != null) &&
        m.mail_backend !== "stalwart"
      )
        fail(
          503,
          "MAIL_PROVISIONING",
          "Почтовый ящик создаётся. Повторите через несколько секунд",
        );
      if (options.roles && !options.roles.includes(m.role))
        fail(403, "FORBIDDEN", "Недостаточно прав для этой операции");
    }
  }
  return { user: u, session: s, member: m, tenant: t };
}
export async function sessionView(ctx: Context) {
  const { user: u, session: s, member: m, tenant: t } = ctx;
  const memberships = await query(
    "SELECT m.id,m.role,m.email,m.tenant_id,t.name,t.status FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.status='active' ORDER BY t.name",
    [u.id],
  );
  const [consent] = t
    ? await query(
        "SELECT accepted FROM consents WHERE tenant_id=$1 AND user_id=$2 AND version=$3 ORDER BY created_at DESC LIMIT 1",
        [t.id, u.id, t.consent_version],
      )
    : [];
  const required =
    !s.workspace_token && (u.must_change ||
    Date.now() - new Date(u.password_changed_at).getTime() >
      (t?.password_days ?? 90) * 86400000);
  return {
    user: {
      id: u.id,
      name: u.name,
      login: u.login,
      platformAdmin: u.platform_admin,
    },
    csrf: s.csrf,
    tenant: t ?? null,
    member: m
      ? {
          id: m.id,
          email: m.email,
          role: m.role,
          quota_mb: m.quota_mb,
          signature: m.signature,
          mail_backend: m.mail_backend,
          mail_managed: m.mail_managed,
          mail_connected:
            m.mail_backend === "stalwart" &&
            !!m.mail_secret &&
            !m.mail_auth_failed,
          mail_link_available: !m.mail_object_id,
        }
      : null,
    memberships,
    passwordRequired: required,
    consentRequired: !!t && !consent?.accepted,
    authMode: s.workspace_token ? "workspace" : "password",
    mailMode: process.env.MAIL_MODE ?? "local",
    aiAvailable: !!process.env.AI_BASE_URL && !!process.env.AI_MODEL,
  };
}
export function setSession(reply: FastifyReply, raw: string) {
  reply.setCookie("axis_session", raw, {
    path: "/",
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    maxAge: Number(process.env.SESSION_HOURS ?? 8) * 3600,
  });
}
