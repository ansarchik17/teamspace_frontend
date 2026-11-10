import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { query, tx, fail } from "./db.js";
import { management, withProvisioningLock } from "./stalwart.js";

const bodySchema = z
  .object({
    quota_bytes: z
      .number()
      .int()
      .min(0)
      .max(2 ** 50),
    revision: z.number().int().min(0),
  })
  .strict();
export function checkStorageToken(
  authorization: string | undefined,
  secret = process.env.AXISMAIL_STORAGE_TOKEN,
) {
  if (!secret || secret.length < 32)
    fail(503, "STORAGE_CONFIG", "Связь с бюджетом Workspace не настроена");
  const expected = Buffer.from(`Bearer ${secret}`),
    actual = Buffer.from(authorization ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    fail(401, "UNAUTHORIZED", "Требуется серверная авторизация");
}
export async function liveState(tenant: any, extraObjectId?: string) {
  const members = await query("SELECT * FROM memberships WHERE tenant_id=$1", [
    tenant.id,
  ]);
  if (members.length && process.env.MAIL_MODE !== "stalwart")
    fail(503, "MAIL_CONFIG", "Общий бюджет требует почтовый сервер Stalwart");
  const allocated = members.reduce(
    (sum, m) => sum + Number(m.quota_mb) * 1048576,
    0,
  );
  if (
    members.some(
      (m) =>
        !m.mail_managed || (m.mail_backend !== "stalwart" && m.mail_object_id),
    )
  )
    fail(
      409,
      "UNMANAGED_MAILBOX",
      "Для общего бюджета все ящики должны управляться TeamSpace",
    );
  const known = new Set(members.map((m) => m.mail_object_id).filter(Boolean));
  if (extraObjectId) known.add(extraObjectId);
  const domains = await query(
    "SELECT stalwart_id FROM domains WHERE tenant_id=$1 AND stalwart_id IS NOT NULL",
    [tenant.id],
  );
  if (!known.size && !domains.length)
    return { allocated, used: 0, accounts: [] as any[], members };
  const response = await management([
    [
      "x:Account/get",
      { properties: ["id", "domainId", "quotas", "usedDiskQuota"] },
      "budget",
    ],
  ]);
  const accounts = response?.[0]?.[1]?.list;
  if (!Array.isArray(accounts))
    fail(503, "MAIL_RESPONSE", "Не удалось проверить почтовые квоты");
  const domainIds = new Set(domains.map((d) => d.stalwart_id));
  if (accounts.some((a) => domainIds.has(a.domainId) && !known.has(a.id)))
    fail(
      409,
      "UNMANAGED_MAILBOX",
      "В домене есть ящики вне управления TeamSpace",
    );
  const own = accounts.filter((a) => known.has(a.id));
  if (own.length !== known.size)
    fail(503, "MAIL_RESPONSE", "Не удалось проверить все почтовые ящики");
  let used = 0;
  for (const account of own) {
    const quota = account.quotas?.maxDiskQuota;
    if (
      !Number.isSafeInteger(quota) ||
      quota <= 0 ||
      !Number.isSafeInteger(account.usedDiskQuota) ||
      account.usedDiskQuota < 0
    )
      fail(
        409,
        "MAIL_QUOTA_UNMANAGED",
        "Ящик не имеет проверяемого ограничения",
      );
    used += account.usedDiskQuota;
  }
  const remote = new Map(own.map((account) => [account.id, account]));
  const reserved = members.reduce(
    (sum, member) => sum + Math.max(
      Number(member.quota_mb) * 1048576,
      Number(remote.get(member.mail_object_id)?.quotas?.maxDiskQuota ?? 0),
    ), 0,
  );
  const extra = extraObjectId && !members.some((member) => member.mail_object_id === extraObjectId)
    ? Number(remote.get(extraObjectId)?.quotas?.maxDiskQuota ?? 0)
    : 0;
  return {
    allocated: reserved + extra,
    used,
    accounts: own,
    members,
  };
}
export async function guardWorkspaceMailboxQuota(
  tenantId: string,
  objectId: string | undefined,
  nextBytes: number,
  memberId?: string,
) {
  const [tenant] = await query("SELECT * FROM tenants WHERE id=$1", [tenantId]);
  if (tenant?.workspace_storage_bytes == null) return;
  const state = await liveState(tenant, objectId);
  const remote = new Map(state.accounts.map((account) => [account.id, account]));
  const other = memberId
    ? state.members.filter((member) => member.id !== memberId).reduce(
      (sum, member) => sum + Math.max(Number(member.quota_mb) * 1048576, Number(remote.get(member.mail_object_id)?.quotas?.maxDiskQuota ?? 0)), 0,
    )
    : state.accounts.filter((account) => account.id !== objectId).reduce((sum, account) => sum + account.quotas.maxDiskQuota, 0);
  if (other + nextBytes > Number(tenant.workspace_storage_bytes))
    fail(409, "TENANT_QUOTA", "Почтовая доля бюджета исчерпана");
}
export function registerStorageBudgetRoutes(app: FastifyInstance) {
  const path = "/api/internal/workspace/organizations/:organization_id/storage";
  app.get(path, async (req, reply) => {
    checkStorageToken(req.headers.authorization);
    const org = z
      .string()
      .uuid()
      .parse((req.params as { organization_id: string }).organization_id);
    const [tenant] = await query(
      "SELECT * FROM tenants WHERE workspace_org_id=$1",
      [org],
    );
    reply.header("Cache-Control", "no-store");
    if (!tenant)
      return { quota_bytes: 0, allocated_bytes: 0, used_bytes: 0, revision: 0 };
    const state = await withProvisioningLock(() => liveState(tenant));
    return {
      quota_bytes: Number(
        tenant.workspace_storage_bytes ?? tenant.quota_mb * 1048576,
      ),
      allocated_bytes: state.allocated,
      used_bytes: state.used,
      revision: Number(tenant.workspace_storage_revision),
    };
  });
  app.put(path, async (req, reply) => {
    checkStorageToken(req.headers.authorization);
    const org = z
      .string()
      .uuid()
      .parse((req.params as { organization_id: string }).organization_id);
    const body = bodySchema.parse(req.body);
    return withProvisioningLock(() =>
      tx(async (db) => {
        await db.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,731825))",
          [org],
        );
        let tenant = (
          await db.query(
            "SELECT * FROM tenants WHERE workspace_org_id=$1 FOR UPDATE",
            [org],
          )
        ).rows[0];
        if (!tenant) {
          if (body.revision !== 0) fail(409, "REVISION", "Бюджет изменился");
          tenant = (
            await db.query(
              "INSERT INTO tenants(name,slug,workspace_org_id,quota_mb,workspace_storage_bytes,consent_text) VALUES($1,$2,$3,1,0,$4) RETURNING *",
              [
                `Workspace ${org}`,
                `ws-${org}`,
                org,
                process.env.WORKSPACE_MAIL_CONSENT_TEXT?.trim() ||
                  "Корпоративная почта предоставляется вашей организацией. Для работы сервиса обрабатываются данные учётной записи, адреса и содержимое переписки. Продолжая, вы подтверждаете ознакомление с этим уведомлением.",
              ],
            )
          ).rows[0];
        }
        if (Number(tenant.workspace_storage_revision) !== body.revision)
          fail(409, "REVISION", "Бюджет изменился");
        const state = await liveState(tenant);
        if (state.allocated > body.quota_bytes || state.used > body.quota_bytes)
          fail(409, "TENANT_QUOTA", "Бюджет меньше квот или объёма ящиков");
        await db.query(
          "UPDATE tenants SET workspace_storage_bytes=$1,workspace_storage_revision=workspace_storage_revision+1,quota_mb=$2 WHERE id=$3",
          [
            body.quota_bytes,
            Math.max(1, Math.floor(body.quota_bytes / 1048576)),
            tenant.id,
          ],
        );
        await db.query(
          "INSERT INTO audit_events(tenant_id,action,detail) VALUES($1,'workspace.storage.budget',$2)",
          [tenant.id, JSON.stringify({ quota_bytes: body.quota_bytes })],
        );
        reply.header("Cache-Control", "no-store");
        return {
          quota_bytes: body.quota_bytes,
          allocated_bytes: state.allocated,
          used_bytes: state.used,
          revision: body.revision + 1,
        };
      }),
    );
  });
}
