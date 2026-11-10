import { liveState, registerStorageBudgetRoutes } from "./mail-budget.js";
import { registerWorkspaceMailboxRoutes } from "./workspace-mailboxes.js";
import { registerMailboxAddressRoutes } from "./mail-address.js";
import { registerAIReadRoutes } from "./ai-context.js";
import { aiAccountingAvailable } from "./ai-accounting.js";
import Fastify from "fastify";
import { calendarRoutes } from "./calendar.js";
import { meetingSettings, sendComposeMeeting } from "./compose-meeting.js";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveTxt } from "node:dns/promises";
import { z } from "zod";
import { query, tx, ApiError, fail } from "./db.js";
import {
  token,
  digest,
  hashPassword,
  verifyPassword,
  validatePassword,
  encrypt,
} from "./security.js";
import { context, sessionView, setSession, audit } from "./auth.js";
import { workspaceProfile, syncWorkspaceDirectory, syncWorkspaceProfile, encryptedWorkspaceToken } from "./workspace.js";
import {
  withProvisioningLock,
  provisionMemberNow,
  mailboxStatus,
} from "./stalwart.js";
import { verifyMailboxConnection, mailboxChanges } from "./mail-integration.js";
import {
  listMail,
  getMail,
  quota,
  sendMail,
  jmap,
  jmapDraft,
  jmapDelete,
  downloadRemoteAttachment,
  mailboxForRole,
} from "./mail.js";

const uuid = z.string().uuid();
const email = z
  .string()
  .email()
  .max(254)
  .transform((x) => x.toLowerCase());
const compose = z.object({
  to: z.array(email).max(50),
  cc: z.array(email).max(50).default([]),
  bcc: z.array(email).max(50).default([]),
  subject: z.string().max(998),
  body: z.string().max(2_000_000),
  attachmentIds: z.array(z.string().min(1).max(1000)).max(20).default([]),
  draftId: z.string().min(1).max(200).optional(),
});
const domainName = z
  .string()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/);
const roles = ["tenant_admin", "hr", "user"] as const;
const folder = z.enum([
  "inbox",
  "sent",
  "drafts",
  "archive",
  "trash",
  "spam",
  "starred",
]);
const params = (r: any) => r.params as Record<string, string>;

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "warn",
      redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.body.password",
        "req.body.currentPassword",
        "req.body.accessToken",
      ],
    },
    bodyLimit: 3 * 1048576,
    trustProxy: false,
  });
  await app.register(cookie);
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    const values = new URLSearchParams(body as string);
    done(null, Object.fromEntries(values));
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, { max: 250, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 15 * 1048576, files: 1 },
  });
  app.addHook("onRequest", async (req) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = (process.env.APP_ORIGIN ?? "http://localhost:5173").split(
        ",",
      );
      if (req.url !== "/api/auth/workspace" && origin && !allowed.includes(origin))
        fail(403, "ORIGIN", "Недопустимый источник запроса");
    }
  });
  app.setErrorHandler((error: any, _req, reply) => {
    if (error.code === "P7503") return reply.code(409).send({code:"TENANT_QUOTA",message:"Превышена почтовая доля бюджета компании"});
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        code: "VALIDATION",
        message: error.issues
          .map((x: any) => `${x.path.join(".")}: ${x.message}`)
          .join(";"),
      });
    if (error instanceof ApiError)
      return reply
        .code(error.status)
        .send({ code: error.code, message: error.message });
    if (error.code === "23505")
      return reply
        .code(409)
        .send({ code: "CONFLICT", message: "Такая запись уже существует" });
    if (error.code === "22P02")
      return reply
        .code(400)
        .send({ code: "VALIDATION", message: "Некорректный идентификатор" });
    if (error.statusCode === 429)
      return reply.code(429).send({
        code: "RATE_LIMIT",
        message: "Слишком много запросов. Повторите позже",
      });
    if (error.statusCode === 413)
      return reply.code(413).send({
        code: "TOO_LARGE",
        message: "Превышен допустимый размер файла",
      });
    app.log.error(
      { code: error.code, message: error.message },
      "Request failed",
    );
    reply
      .code(500)
      .send({ code: "INTERNAL", message: "Не удалось выполнить операцию" });
  });
  app.get("/api/health", async () => {
    await query("SELECT 1");
    return {
      status: "ok",
      mode: process.env.MAIL_MODE ?? "local",
      auth: process.env.WORKSPACE_API_URL ? "password,workspace" : "password",
    };
  });
  app.post(
    "/api/auth/workspace",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      if (process.env.MAIL_MODE !== "stalwart" || process.env.STALWART_PROVISIONING_ENABLED !== "true")
        fail(503, "MAIL_CONFIG", "Создание корпоративных почтовых ящиков не настроено");
      if (!process.env.STALWART_API_KEY_FILE && !process.env.STALWART_ADMIN_FILE)
        fail(503, "MAIL_CONFIG", "Не настроен доступ к Stalwart");
      const { accessToken } = z.object({ accessToken: z.string().min(50).max(8192) }).parse(req.body);
      const profile = await workspaceProfile(accessToken);
      const workspaceOrigin = process.env.WORKSPACE_ORIGIN;
      if (!workspaceOrigin) fail(503, "WORKSPACE_CONFIG", "Не настроен адрес Workspace");
      let baseOrigin: URL;
      try { baseOrigin = new URL(workspaceOrigin); }
      catch { fail(503, "WORKSPACE_CONFIG", "Некорректный адрес Workspace"); }
      const companyOrigin = `${baseOrigin.protocol}//${profile.organization.slug}.${baseOrigin.host}`;
      if (![baseOrigin.origin, companyOrigin].includes(req.headers.origin ?? ""))
        fail(403, "ORIGIN", "Недопустимый источник запроса");
      await syncWorkspaceDirectory(profile, accessToken);
      const linked = await syncWorkspaceProfile(profile);
      const mailbox = await provisionMemberNow(linked.memberId);
      if (mailbox.status !== "ready")
        fail(503, "MAIL_PROVISIONING", "Почтовый ящик пока не создан. Повторите через несколько секунд");
      const raw = token();
      let jwtExpiry = 0;
      try {
        jwtExpiry = Number(JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")).exp);
      } catch { fail(401, "WORKSPACE_AUTH", "Некорректная сессия Workspace"); }
      if (!Number.isFinite(jwtExpiry) || jwtExpiry * 1000 <= Date.now())
        fail(401, "WORKSPACE_AUTH", "Сессия Workspace истекла");
      await query(
        "INSERT INTO sessions(id_hash,user_id,tenant_id,csrf,expires_at,workspace_token,workspace_checked_at) VALUES($1,$2,$3,$4,to_timestamp($5),$6,now())",
        [digest(raw), linked.userId, linked.tenantId, token(), Math.min(jwtExpiry, Date.now()/1000 + Number(process.env.SESSION_HOURS ?? 8)*3600), encryptedWorkspaceToken(accessToken)],
      );
      setSession(reply, raw);
      await audit(linked.tenantId, linked.userId, "auth.workspace");
      return reply.code(303).header("Location", "/").send();
    },
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      const data = z
        .object({
          login: z.string().trim().min(1).max(128),
          password: z.string().max(128),
        })
        .parse(req.body);
      const [u] = await query("SELECT * FROM identities WHERE login=$1", [
        data.login,
      ]);
      const valid = await verifyPassword(
        data.password,
        u?.password_hash ??
          "00000000000000000000000000000000:" + "0".repeat(128),
      );
      if (!u || !u.active || !!u.workspace_user_id || !valid) {
        await audit(null, null, "auth.failed");
        fail(401, "INVALID_CREDENTIALS", "Неверный логин или пароль");
      }
      const [m] = await query(
        "SELECT m.tenant_id FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.status='active' AND t.status='active' ORDER BY m.created_at LIMIT 1",
        [u.id],
      );
      if (!m && !u.platform_admin)
        fail(403, "NO_MEMBERSHIP", "Нет активного доступа к компании");
      const raw = token(),
        csrf = token();
      await query(
        "INSERT INTO sessions(id_hash,user_id,tenant_id,csrf,expires_at) VALUES($1,$2,$3,$4,now()+($5||' hours')::interval)",
        [
          digest(raw),
          u.id,
          m?.tenant_id ?? null,
          csrf,
          process.env.SESSION_HOURS ?? "8",
        ],
      );
      setSession(reply, raw);
      await audit(m?.tenant_id ?? null, u.id, "auth.login");
      return { ok: true };
    },
  );
  app.get("/api/session", async (req) =>
    sessionView(await context(req, { onboarding: true })),
  );
  app.post("/api/auth/logout", async (req, reply) => {
    const c = await context(req, { onboarding: true });
    await query("DELETE FROM sessions WHERE id_hash=$1", [c.session.id_hash]);
    reply.clearCookie("axis_session", { path: "/" });
    return { ok: true };
  });
  app.post("/api/auth/password", async (req) => {
    const c = await context(req, { onboarding: true });
    const b = z
      .object({
        currentPassword: z.string().max(128),
        password: z.string().max(128),
      })
      .parse(req.body);
    validatePassword(b.password);
    if (!(await verifyPassword(b.currentPassword, c.user.password_hash)))
      fail(400, "PASSWORD_WRONG", "Текущий пароль указан неверно");
    for (const old of [c.user.password_hash, ...c.user.password_history])
      if (await verifyPassword(b.password, old))
        fail(400, "PASSWORD_REUSED", "Нельзя повторять последние пять паролей");
    await tx(async (db) => {
      await db.query(
        "UPDATE identities SET password_hash=$1,password_history=$2,must_change=false,password_changed_at=now() WHERE id=$3",
        [
          await hashPassword(b.password),
          JSON.stringify(
            [c.user.password_hash, ...c.user.password_history].slice(0, 4),
          ),
          c.user.id,
        ],
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1 AND id_hash<>$2", [
        c.user.id,
        c.session.id_hash,
      ]);
    });
    await audit(c.session.tenant_id, c.user.id, "auth.password_changed");
    return { ok: true };
  });
  app.post("/api/session/tenant", async (req) => {
    const c = await context(req, { onboarding: true });
    const b = z.object({ tenantId: uuid }).parse(req.body);
    const [m] = await query(
      "SELECT m.id FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.tenant_id=$2 AND m.status='active' AND t.status='active'",
      [c.user.id, b.tenantId],
    );
    if (!m) fail(403, "TENANT_ACCESS_DENIED", "Нет доступа к компании");
    await query("UPDATE sessions SET tenant_id=$1 WHERE id_hash=$2", [
      b.tenantId,
      c.session.id_hash,
    ]);
    return { ok: true };
  });
  app.post("/api/consent", async (req) => {
    const c = await context(req, { onboarding: true });
    if (!c.member || c.tenant.status !== "active")
      fail(403, "TENANT_ACCESS_DENIED", "Нет доступа к компании");
    if (c.user.must_change)
      fail(403, "PASSWORD_CHANGE_REQUIRED", "Сначала смените пароль");
    const b = z
      .object({ version: z.number().int(), accepted: z.boolean() })
      .parse(req.body);
    if (b.version !== c.tenant.consent_version)
      fail(
        409,
        "CONSENT_CHANGED",
        "Текст согласия обновился. Обновите страницу",
      );
    await query(
      "INSERT INTO consents(tenant_id,user_id,version,text_hash,document_text,accepted) VALUES($1,$2,$3,$4,$5,$6)",
      [
        c.tenant.id,
        c.user.id,
        b.version,
        digest(c.tenant.consent_text),
        c.tenant.consent_text,
        b.accepted,
      ],
    );
    await audit(
      c.tenant.id,
      c.user.id,
      b.accepted ? "consent.accepted" : "consent.declined",
    );
    return { ok: true };
  });
  app.get("/api/platform/tenants", async (req) => {
    await context(req, { platform: true });
    return query(
      "SELECT t.*,count(m.id)::int AS users,coalesce(sum(m.quota_mb),0)::int AS allocated_mb FROM tenants t LEFT JOIN memberships m ON m.tenant_id=t.id GROUP BY t.id ORDER BY t.name",
    );
  });
  app.post("/api/platform/tenants", async (req) => {
    const c = await context(req, { platform: true });
    const b = z
      .object({
        name: z.string().trim().min(2).max(100),
        slug: z.string().regex(/^[a-z0-9-]{2,50}$/),
        quota_mb: z.number().int().min(100).max(100000000),
      })
      .parse(req.body);
    const [t] = await query(
      "INSERT INTO tenants(name,slug,quota_mb) VALUES($1,$2,$3) RETURNING *",
      [b.name, b.slug, b.quota_mb],
    );
    await audit(t.id, c.user.id, "tenant.created", t.id);
    return t;
  });
  app.patch("/api/platform/tenants/:id", async (req) => {
    const c = await context(req, { platform: true });
    const id = uuid.parse(params(req).id);
    const b = z
      .object({ status: z.enum(["active", "suspended"]) })
      .parse(req.body);
    const [t] = await query(
      "UPDATE tenants SET status=$1 WHERE id=$2 RETURNING id",
      [b.status, id],
    );
    if (!t) fail(404, "NOT_FOUND", "Компания не найдена");
    await query("DELETE FROM sessions WHERE tenant_id=$1", [id]);
    await audit(id, c.user.id, "tenant." + b.status, id);
    return { ok: true };
  });
  app.get("/api/platform/tenants/:id/members", async (req) => {
    await context(req, { platform: true });
    return query(
      "SELECT m.id,m.user_id,m.email,m.role,m.status,u.name FROM memberships m JOIN identities u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.name",
      [uuid.parse(params(req).id)],
    );
  });
  app.post("/api/platform/identities/:id/reset-password", async (req) => {
    const c = await context(req, { platform: true });
    const id = uuid.parse(params(req).id);
    const b = z.object({ password: z.string().max(128) }).parse(req.body);
    validatePassword(b.password);
    if (id === c.user.id)
      fail(409, "SELF_MODIFY", "Для своего аккаунта используйте смену пароля");
    const [u] = await query(
      "SELECT id,password_hash,password_history FROM identities WHERE id=$1",
      [id],
    );
    if (!u) fail(404, "NOT_FOUND", "Пользователь не найден");
    for (const old of [u.password_hash, ...u.password_history])
      if (await verifyPassword(b.password, old))
        fail(400, "PASSWORD_REUSED", "Нельзя повторять последние пять паролей");
    await tx(async (db) => {
      await db.query(
        "UPDATE identities SET password_hash=$1,password_history=$2,must_change=true WHERE id=$3",
        [
          await hashPassword(b.password),
          JSON.stringify([u.password_hash, ...u.password_history].slice(0, 4)),
          id,
        ],
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      const memberships = (
        await db.query("SELECT tenant_id FROM memberships WHERE user_id=$1", [
          id,
        ])
      ).rows;
      for (const m of memberships)
        await db.query(
          "INSERT INTO audit_events(tenant_id,actor_id,action,resource_id) VALUES($1,$2,'identity.password_reset',$3)",
          [m.tenant_id, c.user.id, id],
        );
    });
    return { ok: true };
  });
  app.post("/api/platform/tenants/:id/admin", async (req) => {
    const c = await context(req, { platform: true });
    const tid = uuid.parse(params(req).id);
    const b = z
      .object({
        login: z.string().regex(/^\d{12}$/),
        name: z.string().min(2).max(100),
        email,
        password: z.string().max(128),
        quota_mb: z.number().int().positive(),
      })
      .parse(req.body);
    validatePassword(b.password);
    return createMember(
      tid,
      { ...b, role: "tenant_admin", department: "" },
      c.user.id,
    );
  });
  app.get("/api/domains", async (req) => {
    const c = await context(req, { roles: ["tenant_admin"] });
    return query("SELECT * FROM domains WHERE tenant_id=$1 ORDER BY name", [
      c.tenant.id,
    ]);
  });
  app.get("/api/platform/tenants/:id/domains", async (req) => {
    await context(req, { platform: true });
    return query("SELECT * FROM domains WHERE tenant_id=$1", [
      uuid.parse(params(req).id),
    ]);
  });
  async function addDomain(tid: string, name: string, actor: string) {
    const [d] = await query(
      "INSERT INTO domains(tenant_id,name,verification_token,verified) VALUES($1,$2,$3,$4) RETURNING *",
      [
        tid,
        name,
        token(),
        name.endsWith(".test") && process.env.ALLOW_TEST_DOMAINS === "true",
      ],
    );
    await audit(tid, actor, "domain.created", d.id);
    return d;
  }
  app.post("/api/domains", async (req) => {
    const c = await context(req, { roles: ["tenant_admin"] });
    return addDomain(
      c.tenant.id,
      z.object({ name: domainName }).parse(req.body).name,
      c.user.id,
    );
  });
  app.post("/api/platform/tenants/:id/domains", async (req) => {
    const c = await context(req, { platform: true });
    return addDomain(
      uuid.parse(params(req).id),
      z.object({ name: domainName }).parse(req.body).name,
      c.user.id,
    );
  });
  async function verifyDomain(tid: string, id: string, actor: string) {
    const [d] = await query(
      "SELECT * FROM domains WHERE id=$1 AND tenant_id=$2",
      [uuid.parse(id), tid],
    );
    if (!d) fail(404, "NOT_FOUND", "Домен не найден");
    const checks = [
      ["_teamspace-verify.", "teamspace-verification="],
      ["_axis-verify.", "axis-verification="],
    ] as const;
    let recordsFound = false;
    let verified = false;
    for (const [host, prefix] of checks) {
      try {
        const records = await resolveTxt(host + d.name);
        recordsFound = true;
        if (records.some((x) => x.join("") === prefix + d.verification_token)) {
          verified = true;
          break;
        }
      } catch {
        // Keep accepting DNS records issued before the TeamSpace rename.
      }
    }
    if (!recordsFound) fail(400, "DNS_NOT_FOUND", "TXT-запись _teamspace-verify не найдена");
    if (!verified) fail(400, "DNS_MISMATCH", "Значение TXT-записи не совпадает");
    await query("UPDATE domains SET verified=true WHERE id=$1", [d.id]);
    await audit(tid, actor, "domain.verified", d.id);
    return { ok: true };
  }
  app.post("/api/domains/:id/verify", async (req) => {
    const c = await context(req, { roles: ["tenant_admin"] });
    return verifyDomain(c.tenant.id, params(req).id, c.user.id);
  });
  app.post(
    "/api/platform/tenants/:id/domains/:domainId/verify",
    async (req) => {
      const c = await context(req, { platform: true });
      return verifyDomain(
        uuid.parse(params(req).id),
        params(req).domainId,
        c.user.id,
      );
    },
  );
  app.get("/api/members", async (req) => {
    const c = await context(req, { roles: ["tenant_admin", "hr"] });
    const rows = await query(
      "SELECT m.id,m.role,m.status,m.email,m.mail_pending_email,u.workspace_user_id,m.quota_mb,m.department,m.created_at,u.name,u.must_change,u.password_changed_at,m.mail_backend,m.mail_error,m.mail_account_id,(m.mail_secret IS NOT NULL) AS mail_secret,m.mail_managed,(m.mail_managed AND m.mail_backend='stalwart' AND m.mail_sync_hash IS NULL) AS quota_pending,CASE WHEN m.mail_backend='stalwart' THEN m.mail_used_bytes ELSE coalesce((SELECT sum(size_bytes) FROM messages WHERE mailbox_id=m.id),0) END::text AS used_bytes FROM memberships m JOIN identities u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.name",
      [c.tenant.id],
    );
    return rows.map(({ mail_secret, mail_account_id, ...m }) => ({
      ...m,
      mailbox: {
        status: mailboxStatus({ ...m, mail_secret, mail_account_id }),
      },
    }));
  });
  app.post(
    "/api/members/:id/provision",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const c = await context(req, { roles: ["tenant_admin", "hr"] });
      const [m] = await query(
        "SELECT id,mail_managed FROM memberships WHERE id=$1 AND tenant_id=$2",
        [uuid.parse(params(req).id), c.tenant.id],
      );
      if (!m) fail(404, "NOT_FOUND", "Сотрудник не найден");
      if (!m.mail_managed)
        fail(409, "MAIL_EXTERNAL", "Этот ящик управляется на почтовом сервере");
      const mailbox = await provisionMemberNow(m.id);
      await audit(c.tenant.id, c.user.id, "member.mail_provision", m.id);
      return { mailbox };
    },
  );
  app.post("/api/members", async (req) => {
    const c = await context(req, { roles: ["tenant_admin", "hr"] });
    const b = z
      .object({
        login: z.string().regex(/^\d{12}$/),
        name: z.string().trim().min(2).max(100),
        email,
        password: z.string().max(128),
        role: z.enum(roles),
        quota_mb: z.number().int().positive(),
        department: z.string().max(100).default(""),
      })
      .parse(req.body);
    validatePassword(b.password);
    if (c.member.role === "hr" && b.role !== "user")
      fail(
        403,
        "ROLE_ESCALATION",
        "Кадровик может создавать только пользователей",
      );
    return createMember(c.tenant.id, b, c.user.id);
  });
  app.patch("/api/members/:id", async (req) => {
    const c = await context(req, { roles: ["tenant_admin", "hr"] });
    const id = uuid.parse(params(req).id);
    const b = z
      .object({
        status: z.enum(["active", "suspended"]).optional(),
        role: z.enum(roles).optional(),
        quota_mb: z.number().int().positive().optional(),
        department: z.string().max(100).optional(),
      })
      .parse(req.body);
    const nextQuotaMb = b.quota_mb;
    const update = () => tx(async (db) => {
      const tenant = (await db.query("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [
        c.tenant.id,
      ])).rows[0];
      const m = (
        await db.query(
          "SELECT * FROM memberships WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
          [id, c.tenant.id],
        )
      ).rows[0];
      if (!m) fail(404, "NOT_FOUND", "Сотрудник не найден");
      if (c.member.role === "hr" && (m.role !== "user" || b.role || b.quota_mb))
        fail(403, "FORBIDDEN", "Недостаточно прав");
      if (
        m.id === c.member.id &&
        ((b.role && b.role !== m.role) || b.status === "suspended")
      )
        fail(
          409,
          "SELF_MODIFY",
          "Нельзя изменить собственные полномочия или заблокировать себя",
        );
      if (nextQuotaMb) {
        if (tenant.workspace_storage_bytes != null) {
          const state = await liveState(tenant);
          const remote = new Map<string, any>(state.accounts.map((account: any) => [account.id, account]));
          const used = Number(remote.get(m.mail_object_id)?.usedDiskQuota ?? m.mail_used_bytes ?? 0);
          if (nextQuotaMb * 1048576 < used)
            fail(409, "MAIL_QUOTA_USED", "Квота меньше занятого объёма ящика");
          const projected = state.members.reduce((sum: number, member: any) => sum + Math.max(
            (member.id === id ? nextQuotaMb : Number(member.quota_mb)) * 1048576,
            Number(remote.get(member.mail_object_id)?.quotas?.maxDiskQuota ?? 0),
          ), 0);
          if (projected > Number(tenant.workspace_storage_bytes))
            fail(409, "TENANT_QUOTA", "Превышена почтовая доля бюджета компании");
        } else {
          const allocated = Number((await db.query(
            "SELECT coalesce(sum(quota_mb),0) AS total FROM memberships WHERE tenant_id=$1 AND id<>$2",
            [c.tenant.id, id],
          )).rows[0].total);
          if (allocated + nextQuotaMb > tenant.quota_mb)
            fail(409, "TENANT_QUOTA", "Превышен бюджет компании");
        }
      }
      await db.query(
        "UPDATE memberships SET status=coalesce($1,status),role=coalesce($2,role),quota_mb=coalesce($3,quota_mb),department=coalesce($4,department),mail_sync_hash=CASE WHEN $3::integer IS NOT NULL AND $3::integer<>quota_mb THEN NULL ELSE mail_sync_hash END WHERE id=$5",
        [b.status, b.role, nextQuotaMb, b.department, id],
      );
      if (nextQuotaMb && nextQuotaMb !== Number(m.quota_mb)) await db.query("UPDATE tenants SET workspace_storage_revision=workspace_storage_revision+1 WHERE id=$1", [c.tenant.id]);
      if (b.status === "suspended" || b.role)
        await db.query(
          "DELETE FROM sessions WHERE user_id=$1 AND tenant_id=$2",
          [m.user_id, c.tenant.id],
        );
      await db.query(
        "INSERT INTO audit_events(tenant_id,actor_id,action,resource_id,detail) VALUES($1,$2,'member.updated',$3,$4)",
        [c.tenant.id, c.user.id, id, {
          before: { status: m.status, role: m.role, quota_mb: m.quota_mb, department: m.department },
          after: { status: b.status ?? m.status, role: b.role ?? m.role, quota_mb: nextQuotaMb ?? m.quota_mb, department: b.department ?? m.department },
        }],
      );
    });
    if (nextQuotaMb) await withProvisioningLock(update);
    else await update();
    return { ok: true };
  });
  app.post("/api/members/:id/reset-password", async (req) => {
    const c = await context(req, { roles: ["tenant_admin", "hr"] });
    const id = uuid.parse(params(req).id);
    const b = z.object({ password: z.string().max(128) }).parse(req.body);
    validatePassword(b.password);
    const [m] = await query(
      "SELECT m.*,u.platform_admin FROM memberships m JOIN identities u ON u.id=m.user_id WHERE m.id=$1 AND m.tenant_id=$2",
      [id, c.tenant.id],
    );
    if (!m) fail(404, "NOT_FOUND", "Сотрудник не найден");
    if (
      m.platform_admin ||
      m.id === c.member.id ||
      (c.member.role === "hr" && m.role !== "user")
    )
      fail(403, "FORBIDDEN", "Нет прав сбросить этот пароль");
    const [count] = await query(
      "SELECT count(*)::int AS n FROM memberships WHERE user_id=$1",
      [m.user_id],
    );
    if (count.n > 1)
      fail(
        409,
        "GLOBAL_IDENTITY",
        "Сброс общей учётной записи выполняет администратор платформы",
      );
    await tx(async (db) => {
      await db.query(
        "UPDATE identities SET password_history=jsonb_build_array(password_hash)||jsonb_path_query_array(password_history,'$[0 to 3]'),password_hash=$1,must_change=true WHERE id=$2",
        [await hashPassword(b.password), m.user_id],
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [m.user_id]);
    });
    await audit(c.tenant.id, c.user.id, "member.password_reset", id);
    return { ok: true };
  });
  app.get("/api/settings", async (req) => {
    const c = await context(req, { roles: ["tenant_admin"] });
    return c.tenant;
  });
  app.patch("/api/settings", async (req) => {
    const c = await context(req, { roles: ["tenant_admin"] });
    const b = z
      .object({
        password_days: z.number().int().min(1).max(365),
        ai_enabled: z.boolean(),
        consent_text: z.string().min(30).max(20000),
      })
      .parse(req.body);
    await query(
      "UPDATE tenants SET password_days=$1,ai_enabled=$2,consent_text=$3,consent_version=consent_version+CASE WHEN consent_text<>$3 THEN 1 ELSE 0 END WHERE id=$4",
      [b.password_days, b.ai_enabled, b.consent_text, c.tenant.id],
    );
    await audit(c.tenant.id, c.user.id, "policy.updated", c.tenant.id);
    return { ok: true };
  });
  app.get("/api/audit", async (req) => {
    const c = await context(req, { roles: ["tenant_admin", "hr"] });
    return query(
      "SELECT a.*,u.name AS actor_name FROM audit_events a LEFT JOIN identities u ON u.id=a.actor_id WHERE a.tenant_id=$1 " +
        (c.member.role === "hr"
          ? "AND (a.action LIKE 'member.%' OR a.actor_id=$2) "
          : "") +
        "ORDER BY a.created_at DESC LIMIT 200",
      c.member.role === "hr" ? [c.tenant.id, c.user.id] : [c.tenant.id],
    );
  });
  app.get("/api/notifications", async (req) => {
    const c = await context(req);
    return query(
      "SELECT * FROM notifications WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100",
      [c.tenant.id, c.user.id],
    );
  });
  app.post("/api/notifications/read", async (req) => {
    const c = await context(req);
    await query(
      "UPDATE notifications SET read=true WHERE tenant_id=$1 AND user_id=$2",
      [c.tenant.id, c.user.id],
    );
    return { ok: true };
  });
  calendarRoutes(app);
  app.get("/api/mail/quota", async (req) => quota(await context(req)));
  app.get("/api/mail/changes", async (req) => {
    const c = await context(req);
    const cursor = z
      .object({
        emailState: z.string().min(1).max(2048).optional(),
        mailboxState: z.string().min(1).max(2048).optional(),
      })
      .parse(req.query);
    if (c.member.mail_backend !== "stalwart")
      return { changed: true, reset: true };
    return mailboxChanges(c, cursor);
  });
  registerAIReadRoutes(app);
  app.get("/api/mail/messages", async (req) => {
    const c = await context(req);
    const b = z
      .object({
        folder: folder.default("inbox"),
        search: z.string().max(200).default(""),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .parse(req.query);
    return listMail(c, b.folder, b.search, b.page);
  });
  app.get("/api/mail/messages/:id", async (req) => {
    const c = await context(req);
    const message = await getMail(c, params(req).id);
    const [meeting] = await query(
      "SELECT settings FROM compose_meetings WHERE mailbox_id=$1 AND draft_id=$2",
      [c.member.id, params(req).id],
    );
    return { ...message, meeting: meeting?.settings ?? null };
  });
  app.patch("/api/mail/messages/:id", async (req) => {
    const c = await context(req);
    const id = params(req).id;
    await getMail(c, id);
    const b = z
      .object({
        read: z.boolean().optional(),
        starred: z.boolean().optional(),
        folder: z
          .enum(["inbox", "sent", "archive", "trash", "spam"])
          .optional(),
      })
      .parse(req.body);
    if (c.member.mail_backend === "stalwart") {
      const update: any = {};
      if (b.read !== undefined) update["keywords/$seen"] = b.read ? true : null;
      if (b.starred !== undefined)
        update["keywords/$flagged"] = b.starred ? true : null;
      if (b.folder) {
        const f = await mailboxForRole(
          c,
          b.folder === "spam" ? "junk" : b.folder,
        );
        update.mailboxIds = { [f.id]: true };
      }
      await jmap(c, [
        [
          "Email/set",
          { accountId: c.member.mail_account_id, update: { [id]: update } },
          "set",
        ],
      ]);
    } else
      await query(
        "UPDATE messages SET read=coalesce($1,read),starred=coalesce($2,starred),folder=coalesce($3,folder),updated_at=now() WHERE id=$4 AND mailbox_id=$5 AND tenant_id=$6",
        [b.read, b.starred, b.folder, id, c.member.id, c.tenant.id],
      );
    return { ok: true };
  });
  app.delete("/api/mail/messages/:id", async (req) => {
    const c = await context(req);
    if (c.member.mail_backend === "stalwart") {
      await jmapDelete(c, params(req).id);
      await audit(c.tenant.id, c.user.id, "mail.deleted", params(req).id);
      return { ok: true };
    }
    const m = await getMail(c, uuid.parse(params(req).id));
    if (!["trash", "drafts"].includes(m.folder))
      fail(409, "TRASH_FIRST", "Сначала переместите письмо в корзину");
    await query(
      "DELETE FROM messages WHERE id=$1 AND mailbox_id=$2 AND tenant_id=$3",
      [m.id, c.member.id, c.tenant.id],
    );
    await audit(c.tenant.id, c.user.id, "mail.deleted", m.id);
    return { ok: true };
  });
  app.post("/api/mail/send", async (req) => {
    const c = await context(req);
    const b = compose.parse(req.body);
    if (!b.to.length && !b.cc.length && !b.bcc.length)
      fail(400, "NO_RECIPIENT", "Укажите получателя");
    const key = z
      .string()
      .min(8)
      .max(100)
      .parse(req.headers["idempotency-key"]);
    return sendMail(c, b, key);
  });
  app.post("/api/mail/meeting", async (req) => {
    const c = await context(req);
    const b = compose.extend({ meeting: meetingSettings }).parse(req.body);
    return sendComposeMeeting(
      c,
      b,
      b.meeting,
      z.string().uuid().parse(req.headers["idempotency-key"]),
    );
  });
  app.post("/api/mail/drafts", async (req) => {
    const c = await context(req);
    const b = compose
      .extend({ meeting: meetingSettings.nullable().optional() })
      .parse(req.body);
    if (c.member.mail_backend === "stalwart") {
      const result = await jmapDraft(c, b);
      if (b.meeting)
        await query(
          "INSERT INTO compose_meetings(mailbox_id,draft_id,settings) VALUES($1,$2,$3) ON CONFLICT(mailbox_id,draft_id) DO UPDATE SET settings=EXCLUDED.settings",
          [c.member.id, result.id, b.meeting],
        );
      if (b.draftId)
        await query(
          "DELETE FROM compose_meetings WHERE mailbox_id=$1 AND draft_id=$2",
          [c.member.id, b.draftId],
        );
      return result;
    }
    if (b.meeting)
      fail(
        409,
        "CALENDAR_NOT_CONNECTED",
        "Для встреч подключите почтовый ящик Stalwart",
      );
    const size = Buffer.byteLength(b.body + b.subject);
    return tx(async (db) => {
      await db.query("SELECT id FROM memberships WHERE id=$1 FOR UPDATE", [
        c.member.id,
      ]);
      const old = b.draftId
        ? (
            await db.query(
              "SELECT * FROM messages WHERE id=$1 AND mailbox_id=$2 AND tenant_id=$3 AND folder='drafts'",
              [b.draftId, c.member.id, c.tenant.id],
            )
          ).rows[0]
        : null;
      if (b.draftId && !old) fail(404, "NOT_FOUND", "Черновик не найден");
      const used = Number(
        (
          await db.query(
            "SELECT coalesce(sum(size_bytes),0) AS n FROM messages WHERE mailbox_id=$1",
            [c.member.id],
          )
        ).rows[0].n,
      );
      const files = (
        await db.query(
          "SELECT id,filename AS name,size_bytes AS size,content_type AS type FROM attachments WHERE id=ANY($1::uuid[]) AND mailbox_id=$2 AND tenant_id=$3",
          [b.attachmentIds, c.member.id, c.tenant.id],
        )
      ).rows;
      if (files.length !== b.attachmentIds.length)
        fail(404, "ATTACHMENT_NOT_FOUND", "Вложение недоступно");
      const total = size + files.reduce((n, a) => n + a.size, 0);
      if (
        used - Number(old?.size_bytes ?? 0) + total >
        c.member.quota_mb * 1048576
      )
        fail(409, "QUOTA_EXCEEDED", "Недостаточно места");
      if (old)
        return (
          await db.query(
            "UPDATE messages SET recipients=$1,cc=$2,bcc=$3,subject=$4,body=$5,size_bytes=$6,attachments=$7,updated_at=now() WHERE id=$8 RETURNING id",
            [
              JSON.stringify(b.to),
              JSON.stringify(b.cc),
              JSON.stringify(b.bcc),
              b.subject,
              b.body,
              total,
              JSON.stringify(files),
              old.id,
            ],
          )
        ).rows[0];
      return (
        await db.query(
          "INSERT INTO messages(tenant_id,mailbox_id,folder,sender,recipients,cc,bcc,subject,body,read,size_bytes,attachments) VALUES($1,$2,'drafts',$3,$4,$5,$6,$7,$8,true,$9,$10) RETURNING id",
          [
            c.tenant.id,
            c.member.id,
            c.member.email,
            JSON.stringify(b.to),
            JSON.stringify(b.cc),
            JSON.stringify(b.bcc),
            b.subject,
            b.body,
            total,
            JSON.stringify(files),
          ],
        )
      ).rows[0];
    });
  });
  app.post("/api/mail/attachments", async (req) => {
    const c = await context(req);
    const part = await req.file();
    if (!part) fail(400, "FILE_REQUIRED", "Выберите файл");
    const buffer = await part.toBuffer();
    return tx(async (db) => {
      await db.query("SELECT id FROM memberships WHERE id=$1 FOR UPDATE", [
        c.member.id,
      ]);
      const [usage] = (
        await db.query(
          "SELECT coalesce(sum(size_bytes),0)::text AS n FROM attachments WHERE mailbox_id=$1 AND created_at>now()-interval '1 day'",
          [c.member.id],
        )
      ).rows;
      if (Number(usage.n) + buffer.length > 100 * 1048576)
        fail(429, "UPLOAD_LIMIT", "Суточный лимит загрузки 100 МБ");
      const [a] = (
        await db.query(
          "INSERT INTO attachments(tenant_id,mailbox_id,filename,content_type,data,size_bytes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,filename AS name,size_bytes AS size,content_type AS type",
          [
            c.tenant.id,
            c.member.id,
            part.filename.replace(/[\r\n/\\]/g, "_").slice(0, 150),
            part.mimetype,
            buffer,
            buffer.length,
          ],
        )
      ).rows;
      return a;
    });
  });
  app.get("/api/mail/attachments/:id", async (req, reply) => {
    const c = await context(req);
    if (
      params(req).id.startsWith("jmap.") &&
      c.member.mail_backend === "stalwart"
    ) {
      const a = await downloadRemoteAttachment(c, params(req).id);
      return reply
        .header(
          "Content-Disposition",
          "attachment; filename*=UTF-8''" + encodeURIComponent(a.filename),
        )
        .type("application/octet-stream")
        .send(a.data);
    }
    const [a] = await query(
      "SELECT * FROM attachments WHERE id=$1 AND mailbox_id=$2 AND tenant_id=$3",
      [uuid.parse(params(req).id), c.member.id, c.tenant.id],
    );
    if (!a) fail(404, "NOT_FOUND", "Вложение не найдено");
    return reply
      .header(
        "Content-Disposition",
        "attachment; filename*=UTF-8''" + encodeURIComponent(a.filename),
      )
      .type("application/octet-stream")
      .send(a.data);
  });
  app.patch("/api/profile", async (req) => {
    const c = await context(req);
    const b = z.object({ signature: z.string().max(2000) }).parse(req.body);
    await query(
      "UPDATE memberships SET signature=$1 WHERE id=$2 AND tenant_id=$3",
      [b.signature, c.member.id, c.tenant.id],
    );
    return { ok: true };
  });
  app.get("/api/mail/contacts", async (req) => {
    const c = await context(req);
    return query(
      "SELECT u.name,m.email FROM memberships m JOIN identities u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.status='active' ORDER BY u.name",
      [c.tenant.id],
    );
  });
  app.post("/api/ai/jobs", async (req) => {
    const c = await context(req);
    if (!aiAccountingAvailable())
      fail(503, "AI_ACCOUNTING_UNAVAILABLE", "ИИ временно недоступен: общий учёт расхода не подключён");
    if (!c.tenant.ai_enabled)
      fail(403, "AI_DISABLED", "AI отключён администратором компании");
    if (!process.env.AI_BASE_URL || !process.env.AI_MODEL)
      fail(503, "AI_NOT_CONFIGURED", "AI-провайдер ещё не подключён");
    const b = z
      .object({
        messageId: z.string().max(200),
        kind: z.enum(["summary", "reply"]),
        instruction: z.string().max(2000).default(""),
      })
      .parse(req.body);
    await getMail(c, b.messageId);
    const [n] = await query(
      "SELECT count(*)::int AS n FROM ai_jobs WHERE user_id=$1 AND tenant_id=$2 AND created_at>now()-interval '1 day'",
      [c.user.id, c.tenant.id],
    );
    if (n.n >= 30)
      fail(429, "AI_LIMIT", "Достигнут лимит 30 AI-запросов в сутки");
    const [job] = await query(
      "INSERT INTO ai_jobs(tenant_id,user_id,mailbox_id,message_id,kind,instruction) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status",
      [c.tenant.id, c.user.id, c.member.id, b.messageId, b.kind, b.instruction],
    );
    await audit(c.tenant.id, c.user.id, "ai.requested", job.id);
    return job;
  });
  app.get("/api/ai/jobs/:id", async (req) => {
    const c = await context(req);
    if (!c.tenant.ai_enabled) fail(403, "AI_DISABLED", "AI отключён");
    const [j] = await query(
      "SELECT * FROM ai_jobs WHERE id=$1 AND tenant_id=$2 AND user_id=$3",
      [uuid.parse(params(req).id), c.tenant.id, c.user.id],
    );
    if (!j) fail(404, "NOT_FOUND", "Задание не найдено");
    await getMail(c, j.message_id);
    return j;
  });
  app.post(
    "/api/integrations/stalwart",
    { config: { rateLimit: { max: 5, timeWindow: "5 minutes" } } },
    async (req) => {
      // A shared lock prevents the provisioning worker claiming a mailbox during linking.
      await context(req);
      const b = z
        .object({
          password: z.string().min(1).max(1024).optional(),
          accessToken: z.string().min(10).max(10000).optional(),
          accountId: z.string().min(1).max(200).optional(),
        })
        .strict()
        .refine(
          (x) => (x.password !== undefined) !== (x.accessToken !== undefined),
          "Укажите пароль или access token",
        )
        .parse(req.body);
      if (!process.env.STALWART_URL)
        fail(
          503,
          "STALWART_NOT_CONFIGURED",
          "Адрес Stalwart не задан на сервере",
        );
      return withProvisioningLock(async () => {
        const c = await context(req);
        if (c.member.mail_object_id)
          fail(409, "MAIL_MANAGED", "Этот ящик уже управляется приложением");
        const [domain] = await query(
          "SELECT id FROM domains WHERE tenant_id=$1 AND name=$2 AND verified=true",
          [c.tenant.id, c.member.email.split("@")[1]],
        );
        if (!domain)
          fail(403, "DOMAIN_UNVERIFIED", "Сначала подтвердите домен компании");
        const { secret, accountId } = await verifyMailboxConnection(c, b);
        await query(
          "UPDATE memberships SET mail_backend='stalwart',mail_secret=$1,mail_account_id=$2,mail_managed=false,mail_sync_hash=null,mail_error=null,mail_auth_failed=false WHERE id=$3 AND tenant_id=$4",
          [secret, accountId, c.member.id, c.tenant.id],
        );
        await audit(
          c.tenant.id,
          c.user.id,
          "integration.stalwart_connected",
          c.member.id,
        );
        return { ok: true };
      });
    },
  );
  if (existsSync(resolve("dist"))) {
    await app.register(staticFiles, { root: resolve("dist") });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply
            .code(404)
            .send({ code: "NOT_FOUND", message: "Маршрут не найден" })
        : reply.sendFile("index.html"),
    );
  }
  registerStorageBudgetRoutes(app);
  registerWorkspaceMailboxRoutes(app);
  registerMailboxAddressRoutes(app);
  return app;
}

async function createMember(tid: string, b: any, actor: string) {
  const member = await tx(async (db) => {
    const t = (
      await db.query("SELECT * FROM tenants WHERE id=$1 FOR UPDATE", [tid])
    ).rows[0];
    if (!t) fail(404, "NOT_FOUND", "Компания не найдена");
    const domain = (
      await db.query(
        "SELECT id FROM domains WHERE tenant_id=$1 AND name=$2 AND verified=true",
        [tid, b.email.split("@")[1]],
      )
    ).rows[0];
    if (!domain)
      fail(400, "DOMAIN_UNVERIFIED", "Добавьте и подтвердите домен компании");
    const allocated = Number(
      (
        await db.query(
          "SELECT coalesce(sum(quota_mb),0) AS total FROM memberships WHERE tenant_id=$1",
          [tid],
        )
      ).rows[0].total,
    );
    if (allocated + b.quota_mb > t.quota_mb)
      fail(409, "TENANT_QUOTA", "Недостаточно бюджета квоты компании");
    let u = (
      await db.query("SELECT id FROM identities WHERE login=$1", [b.login])
    ).rows[0];
    if (!u)
      u = (
        await db.query(
          "INSERT INTO identities(login,name,password_hash) VALUES($1,$2,$3) RETURNING id",
          [b.login, b.name, await hashPassword(b.password)],
        )
      ).rows[0];
    const m = (
      await db.query(
        "INSERT INTO memberships(tenant_id,user_id,role,email,quota_mb,department) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,role,status",
        [tid, u.id, b.role, b.email, b.quota_mb, b.department],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO audit_events(tenant_id,actor_id,action,resource_id) VALUES($1,$2,'member.created',$3)",
      [tid, actor, m.id],
    );
    return {
      ...m,
      temporaryPasswordNotice:
        "Новый временный пароль применяется только при создании новой идентичности. Пароль существующего человека не изменяется.",
    };
  });
  return { ...member, mailbox: await provisionMemberNow(member.id) };
}
