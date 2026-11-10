import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fail, query } from "./db.js";
import type { Context } from "./auth.js";
import { workspaceProfile } from "./workspace.js";
import { downloadRemoteAttachment, listMail, getMail } from "./mail.js";

export async function workspaceReadContext(
  accessToken: string,
  deps = { profile: workspaceProfile, query },
): Promise<Context> {
  const profile = await deps.profile(accessToken);
  // Immutable Workspace identity and current organization, never email/name.
  const [binding] = await deps.query(
    `SELECT i.id AS user_id,m.id AS member_id,t.id AS tenant_id
    FROM identities i JOIN memberships m ON m.user_id=i.id JOIN tenants t ON t.id=m.tenant_id
    WHERE i.workspace_user_id=$1 AND t.workspace_org_id=$2 AND i.active=true
      AND m.status='active' AND t.status='active'`,
    [profile.user.id, profile.organization.id],
  );
  if (!binding)
    fail(403, "MAIL_ACCESS", "Нет действующего почтового ящика пользователя");
  const [[user], [member], [tenant]] = await Promise.all([
    deps.query(
      "SELECT * FROM identities WHERE id=$1 AND workspace_user_id=$2 AND active=true",
      [binding.user_id, profile.user.id],
    ),
    deps.query(
      "SELECT * FROM memberships WHERE id=$1 AND user_id=$2 AND tenant_id=$3 AND status='active'",
      [binding.member_id, binding.user_id, binding.tenant_id],
    ),
    deps.query(
      "SELECT * FROM tenants WHERE id=$1 AND workspace_org_id=$2 AND status='active'",
      [binding.tenant_id, profile.organization.id],
    ),
  ]);
  if (!user || !member || !tenant)
    fail(403, "MAIL_ACCESS", "Доступ к почте отозван");
  const [consent] = await deps.query(
    "SELECT accepted FROM consents WHERE tenant_id=$1 AND user_id=$2 AND version=$3 ORDER BY created_at DESC LIMIT 1",
    [tenant.id, user.id, tenant.consent_version],
  );
  if (!consent?.accepted)
    fail(
      403,
      "CONSENT_REQUIRED",
      "Необходимо ознакомиться с условиями обработки данных",
    );
  if (
    process.env.MAIL_MODE === "stalwart" &&
    member.mail_backend !== "stalwart"
  )
    fail(503, "MAIL_PROVISIONING", "Почтовый ящик ещё не подготовлен");
  return { user, member, tenant, session: {} };
}

export async function readAIMailAttachment(
  ctx: Context,
  id: string,
): Promise<{ filename: string; data: Buffer }> {
  if (id.startsWith("jmap.") && ctx.member.mail_backend === "stalwart")
    return downloadRemoteAttachment(ctx, id);
  z.string().uuid().parse(id);
  const [item] = await query(
    "SELECT filename,data FROM attachments WHERE id=$1 AND mailbox_id=$2 AND tenant_id=$3",
    [id, ctx.member.id, ctx.tenant.id],
  );
  if (!item) fail(404, "NOT_FOUND", "Вложение не найдено в вашем ящике");
  return item;
}

const page = z.coerce.number().int().min(1).max(10000).default(1);
const folder = z.enum([
  "inbox",
  "sent",
  "drafts",
  "spam",
  "trash",
  "starred",
  "archive",
]);
const listQuery = z
  .object({
    folder: folder.default("inbox"),
    search: z.string().max(200).default(""),
    page,
  })
  .strict();
const detailQuery = z.object({ page }).strict();

type Readers = {
  context: typeof workspaceReadContext;
  list: typeof listMail;
  get: typeof getMail;
  attachment?: typeof readAIMailAttachment;
};
export function registerAIReadRoutes(
  app: FastifyInstance,
  readers: Readers = {
    context: workspaceReadContext,
    list: listMail,
    get: getMail,
  },
) {
  async function identity(authorization: string | undefined) {
    const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "");
    if (!match) fail(401, "UNAUTHENTICATED", "Требуется сессия Workspace");
    return readers.context(match[1]);
  }
  app.get("/api/internal/workspace/ai/messages", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const args = listQuery.parse(req.query);
    const ctx = await identity(req.headers.authorization);
    const result = await readers.list(ctx, args.folder, args.search, args.page);
    return {
      ...result,
      page: args.page,
      page_size: 40,
      has_more: args.page * 40 < result.total,
      next_page: args.page + 1,
    };
  });
  app.get("/api/internal/workspace/ai/messages/:id", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const { page: part } = detailQuery.parse(req.query);
    const { id } = z
      .object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) })
      .parse(req.params);
    const ctx = await identity(req.headers.authorization);
    const message = await readers.get(ctx, id);
    // Expose only user-facing message fields, no mail credentials or storage keys.
    const body = [...String(message.body ?? "")];
    return {
      id: message.id,
      subject: message.subject,
      sender: message.sender,
      recipients: message.recipients,
      created_at: message.created_at,
      folder: message.folder,
      attachments: message.attachments,
      text: body.slice((part - 1) * 3500, part * 3500).join(""),
      page: part,
      has_more: part * 3500 < body.length,
      next_page: part + 1,
      total_chars: body.length,
    };
  });
  app.get("/api/internal/workspace/ai/attachments/:id", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    z.object({}).strict().parse(req.query);
    const { id } = z
      .object({
        id: z
          .string()
          .max(1024)
          .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/),
      })
      .parse(req.params);
    const ctx = await identity(req.headers.authorization);
    const attachment = await (readers.attachment ?? readAIMailAttachment)(
      ctx,
      id,
    );
    return reply
      .header(
        "Content-Disposition",
        "attachment; filename*=UTF-8''" +
          encodeURIComponent(attachment.filename),
      )
      .type("application/octet-stream")
      .send(attachment.data);
  });
}
