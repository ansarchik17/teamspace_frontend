import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { query, tx, fail } from "./db.js";
import { checkStorageToken, liveState } from "./mail-budget.js";
import { withProvisioningLock } from "./stalwart.js";

const MiB = 1048576;
const change = z.object({ quota_bytes: z.number().int().min(MiB).max(2 ** 50).refine(n => n % MiB === 0), revision: z.number().int().nonnegative(), actor_id: z.number().int().positive() }).strict();
function mailbox(member: any, remote: Map<string, any>) {
  const account = remote.get(member.mail_object_id);
  return { id: member.id, full_name: member.name, email: member.email, quota_bytes: Number(member.quota_mb) * MiB, used_bytes: account?.usedDiskQuota ?? 0, applied_quota_bytes: account?.quotas?.maxDiskQuota ?? null, pending: !account || account.quotas.maxDiskQuota !== Number(member.quota_mb) * MiB };
}
export function registerWorkspaceMailboxRoutes(app: FastifyInstance) {
  const path = "/api/internal/workspace/organizations/:organization_id/mailboxes";
  app.get(path, async (req, reply) => {
    checkStorageToken(req.headers.authorization);
    const org = z.string().uuid().parse((req.params as any).organization_id);
    const { limit, offset } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().nonnegative().default(0) }).parse(req.query);
    reply.header("Cache-Control", "no-store");
    return withProvisioningLock(async () => {
      const [tenant] = await query("SELECT * FROM tenants WHERE workspace_org_id=$1", [org]);
      if (!tenant || tenant.workspace_storage_bytes == null) return { items: [], total: 0, limit, offset, revision: 0, quota_bytes: 0, allocated_bytes: 0, used_bytes: 0, enabled: false };
      if (tenant.status !== "active") fail(409, "TENANT_SUSPENDED", "Компания приостановлена");
      const state = await liveState(tenant);
      const remote = new Map<string, any>(state.accounts.map(account => [account.id, account]));
      const members = await query("SELECT m.*,u.name FROM memberships m JOIN identities u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.name,m.id LIMIT $2 OFFSET $3", [tenant.id, limit, offset]);
      return { items: members.map(member => mailbox(member, remote)), total: state.members.length, limit, offset, revision: Number(tenant.workspace_storage_revision), quota_bytes: Number(tenant.workspace_storage_bytes), allocated_bytes: state.allocated, used_bytes: state.used, enabled: true };
    });
  });
  app.put(path + "/:mailbox_id", async (req, reply) => {
    checkStorageToken(req.headers.authorization);
    const org = z.string().uuid().parse((req.params as any).organization_id), id = z.string().uuid().parse((req.params as any).mailbox_id);
    const body = change.parse(req.body);
    reply.header("Cache-Control", "no-store");
    return withProvisioningLock(() => tx(async db => {
      const tenant = (await db.query("SELECT * FROM tenants WHERE workspace_org_id=$1 FOR UPDATE", [org])).rows[0];
      if (!tenant || tenant.workspace_storage_bytes == null) fail(409, "MAIL_BUDGET_REQUIRED", "Почтовый бюджет не настроен");
      if (tenant.status !== "active") fail(409, "TENANT_SUSPENDED", "Компания приостановлена");
      if (Number(tenant.workspace_storage_revision) !== body.revision) fail(409, "REVISION", "Квоты изменились. Обновите данные");
      const member = (await db.query("SELECT m.*,u.name FROM memberships m JOIN identities u ON u.id=m.user_id WHERE m.id=$1 AND m.tenant_id=$2 FOR UPDATE OF m", [id, tenant.id])).rows[0];
      if (!member) fail(404, "NOT_FOUND", "Почтовый ящик не найден");
      const state = await liveState(tenant), remote = new Map<string, any>(state.accounts.map(account => [account.id, account]));
      const before = mailbox(member, remote);
      if (body.quota_bytes < before.used_bytes) fail(409, "MAIL_QUOTA_USED", "Квота меньше занятого объёма ящика");
      const projected = state.members.reduce((sum, item) => sum + Math.max(item.id === id ? body.quota_bytes : Number(item.quota_mb) * MiB, remote.get(item.mail_object_id)?.quotas?.maxDiskQuota ?? 0), 0);
      if (projected > Number(tenant.workspace_storage_bytes)) fail(409, "TENANT_QUOTA", "Почтовая доля бюджета исчерпана");
      await db.query("UPDATE memberships SET quota_mb=$1,mail_sync_hash=CASE WHEN quota_mb<>$1 THEN NULL ELSE mail_sync_hash END WHERE id=$2", [body.quota_bytes / MiB, id]);
      await db.query("UPDATE tenants SET workspace_storage_revision=workspace_storage_revision+1 WHERE id=$1", [tenant.id]);
      const after = mailbox({ ...member, quota_mb: body.quota_bytes / MiB }, remote);
      await db.query("INSERT INTO audit_events(tenant_id,action,resource_id,detail) VALUES($1,'workspace.mailbox.quota',$2,$3)", [tenant.id, id, { workspace_actor_id: body.actor_id, before: { quota_bytes: before.quota_bytes }, after: { quota_bytes: after.quota_bytes } }]);
      return { before, after, revision: body.revision + 1 };
    }));
  });
}
