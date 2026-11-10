import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { query, tx, fail } from "./db.js";
import { digest } from "./security.js";
import { audit, type Context } from "./auth.js";
import { mailAuthorization, discoverSession } from "./stalwart.js";
export type Compose = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachmentIds: string[];
  draftId?: string;
};
export async function listMail(
  ctx: Context,
  folder: string,
  search: string,
  page: number,
) {
  if (ctx.member.mail_backend === "stalwart")
    return jmapList(ctx, folder, search, page);
  const base =
    "FROM messages WHERE mailbox_id=$1 AND tenant_id=$2 AND " +
    (folder === "starred" ? "starred=true AND folder<>'trash'" : "folder=$3");
  const params: any[] = [ctx.member.id, ctx.tenant.id];
  if (folder !== "starred") params.push(folder);
  const filter = search
    ? ` AND (subject ILIKE $${params.length + 1} OR body ILIKE $${params.length + 1} OR sender ILIKE $${params.length + 1})`
    : "";
  if (search) params.push("%" + search + "%");
  const [count] = await query(
    `SELECT count(*)::int AS total ${base}${filter}`,
    params,
  );
  const items = await query(
    `SELECT id,folder,sender,recipients,subject,left(body,180) AS preview,read,starred,size_bytes,attachments,delivery_status,created_at ${base}${filter} ORDER BY created_at DESC LIMIT 40 OFFSET $${params.length + 1}`,
    [...params, (page - 1) * 40],
  );
  const counts = await query(
    "SELECT folder,count(*)::int AS total,count(*) FILTER(WHERE NOT read)::int AS unread FROM messages WHERE mailbox_id=$1 AND tenant_id=$2 GROUP BY folder",
    [ctx.member.id, ctx.tenant.id],
  );
  return { items, total: count.total, counts };
}
export async function getMail(ctx: Context, id: string) {
  if (ctx.member.mail_backend === "stalwart") return jmapGet(ctx, id);
  const [m] = await query(
    "SELECT * FROM messages WHERE id=$1 AND mailbox_id=$2 AND tenant_id=$3",
    [id, ctx.member.id, ctx.tenant.id],
  );
  if (!m) fail(404, "NOT_FOUND", "Письмо не найдено");
  return m;
}
export async function quota(ctx: Context) {
  if (ctx.member.mail_backend === "stalwart") {
    const { result } = await jmap(
      ctx,
      [["Quota/get", { accountId: ctx.member.mail_account_id }, "quota"]],
      ["urn:ietf:params:jmap:quota"],
    );
    const q = result.methodResponses[0]?.[1]?.list?.find(
      (x: any) => x.resourceType === "octets",
    );
    if (!q) fail(502, "MAIL_QUOTA", "Почтовый сервер не вернул квоту");
    return {
      used: Number(q.used) * (q.scale ?? 1),
      limit: Number(q.hardLimit) * (q.scale ?? 1),
      updatedAt: new Date().toISOString(),
    };
  }
  const [q] = await query(
    "SELECT coalesce(sum(size_bytes),0)::text AS used FROM messages WHERE mailbox_id=$1 AND tenant_id=$2",
    [ctx.member.id, ctx.tenant.id],
  );
  return {
    used: Number(q.used),
    limit: ctx.member.quota_mb * 1048576,
    updatedAt: new Date().toISOString(),
  };
}
export async function sendMail(ctx: Context, data: Compose, key: string) {
  if (ctx.member.mail_backend === "stalwart") return jmapSend(ctx, data, key);
  const requestHash = digest(JSON.stringify(data));
  const response = await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "axis-mail-delivery",
    ]);
    const old = (
      await c.query(
        "SELECT * FROM idempotency WHERE mailbox_id=$1 AND key=$2",
        [ctx.member.id, key],
      )
    ).rows[0];
    if (old) {
      if (old.request_hash !== requestHash)
        fail(409, "IDEMPOTENCY_CONFLICT", "Ключ запроса уже использован");
      return old.response;
    }
    const active = (
      await c.query(
        "SELECT m.*,t.status AS tenant_status FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.id=$1 FOR UPDATE OF m",
        [ctx.member.id],
      )
    ).rows[0];
    if (active.status !== "active" || active.tenant_status !== "active")
      fail(403, "TENANT_ACCESS_DENIED", "Отправитель заблокирован");
    const recipients = [
      ...new Set(
        [...data.to, ...data.cc, ...data.bcc].map((x) => x.toLowerCase()),
      ),
    ];
    const local = (
      await c.query(
        "SELECT m.*,t.status AS tenant_status FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE lower(email)=ANY($1) ORDER BY m.id FOR UPDATE OF m",
        [recipients],
      )
    ).rows;
    const unknown = recipients.filter(
      (x) => !local.some((m) => m.email.toLowerCase() === x),
    );
    if (unknown.length) {
      const localDomains = (
        await c.query("SELECT name FROM domains WHERE name=ANY($1)", [
          unknown.map((x) => x.split("@")[1]),
        ])
      ).rows;
      if (localDomains.length)
        fail(
          400,
          "RECIPIENT_UNKNOWN",
          "Один из локальных получателей не существует",
        );
      if (process.env.MAIL_MODE !== "smtp" || !process.env.SMTP_HOST)
        fail(
          409,
          "EXTERNAL_MAIL_UNAVAILABLE",
          "Внешняя доставка не подключена. Сейчас можно отправлять между локальными ящиками.",
        );
    }
    if (
      local.some((m) => m.status !== "active" || m.tenant_status !== "active")
    )
      fail(
        400,
        "RECIPIENT_UNAVAILABLE",
        "Один из получателей временно недоступен",
      );
    const attachments = (
      await c.query(
        "SELECT * FROM attachments WHERE id=ANY($1::uuid[]) AND mailbox_id=$2 AND tenant_id=$3",
        [data.attachmentIds, ctx.member.id, ctx.tenant.id],
      )
    ).rows;
    if (attachments.length !== data.attachmentIds.length)
      fail(404, "ATTACHMENT_NOT_FOUND", "Вложение недоступно");
    const size =
      Buffer.byteLength(data.body + data.subject) +
      attachments.reduce((n, a) => n + Number(a.size_bytes), 0);
    if (size > 25 * 1048576)
      fail(413, "MESSAGE_TOO_LARGE", "Размер письма превышает 25 МБ");
    let draft: any;
    if (data.draftId) {
      draft = (
        await c.query(
          "SELECT * FROM messages WHERE id=$1 AND mailbox_id=$2 AND tenant_id=$3 AND folder='drafts'",
          [data.draftId, ctx.member.id, ctx.tenant.id],
        )
      ).rows[0];
      if (!draft) fail(404, "DRAFT_NOT_FOUND", "Черновик недоступен");
    }
    for (const mailbox of [
      active,
      ...local.filter((x) => x.id !== active.id),
    ]) {
      const used = Number(
        (
          await c.query(
            "SELECT coalesce(sum(size_bytes),0) AS used FROM messages WHERE mailbox_id=$1",
            [mailbox.id],
          )
        ).rows[0].used,
      );
      const copies =
        (mailbox.id === active.id ? 1 : 0) +
        (local.some((x) => x.id === mailbox.id) ? 1 : 0);
      if (
        used +
          size * copies -
          (mailbox.id === active.id ? Number(draft?.size_bytes ?? 0) : 0) >
        mailbox.quota_mb * 1048576
      )
        fail(
          409,
          "QUOTA_EXCEEDED",
          "Недостаточно места в ящике отправителя или получателя",
        );
    }
    const ownAttachments = attachments.map((a) => ({
      id: a.id,
      name: a.filename,
      size: a.size_bytes,
      type: a.content_type,
    }));
    const sent = (
      await c.query(
        "INSERT INTO messages(tenant_id,mailbox_id,folder,sender,recipients,cc,bcc,subject,body,read,size_bytes,attachments,delivery_status) VALUES($1,$2,'sent',$3,$4,$5,$6,$7,$8,true,$9,$10,$11) RETURNING id",
        [
          ctx.tenant.id,
          ctx.member.id,
          ctx.member.email,
          JSON.stringify(data.to),
          JSON.stringify(data.cc),
          JSON.stringify(data.bcc),
          data.subject,
          data.body,
          size,
          JSON.stringify(ownAttachments),
          unknown.length ? "queued" : "delivered",
        ],
      )
    ).rows[0];
    for (const m of local) {
      const files = [];
      for (const a of attachments) {
        const copy = (
          await c.query(
            "INSERT INTO attachments(tenant_id,mailbox_id,filename,content_type,data,size_bytes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              m.tenant_id,
              m.id,
              a.filename,
              a.content_type,
              a.data,
              a.size_bytes,
            ],
          )
        ).rows[0];
        files.push({
          id: copy.id,
          name: a.filename,
          size: a.size_bytes,
          type: a.content_type,
        });
      }
      await c.query(
        "INSERT INTO messages(tenant_id,mailbox_id,sender,recipients,cc,subject,body,size_bytes,attachments) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          m.tenant_id,
          m.id,
          ctx.member.email,
          JSON.stringify(data.to),
          JSON.stringify(data.cc),
          data.subject,
          data.body,
          size,
          JSON.stringify(files),
        ],
      );
    }
    if (draft) await c.query("DELETE FROM messages WHERE id=$1", [draft.id]);
    if (unknown.length)
      await c.query(
        "INSERT INTO outbox(tenant_id,mailbox_id,message_id,recipients) VALUES($1,$2,$3,$4)",
        [ctx.tenant.id, ctx.member.id, sent.id, JSON.stringify(unknown)],
      );
    const result = {
      id: sent.id,
      status: unknown.length ? "queued" : "delivered",
    };
    await c.query(
      "INSERT INTO idempotency(mailbox_id,key,request_hash,response) VALUES($1,$2,$3,$4)",
      [ctx.member.id, key, requestHash, result],
    );
    await c.query(
      "INSERT INTO audit_events(tenant_id,actor_id,action,resource_id) VALUES($1,$2,'mail.sent',$3)",
      [ctx.tenant.id, ctx.user.id, sent.id],
    );
    return result;
  });
  return response;
}
export async function jmap(
  ctx: Context,
  calls: any[],
  capabilities: string[] = ["urn:ietf:params:jmap:mail"],
  allowedErrors: string[] = [],
) {
  const base = process.env.STALWART_URL;
  if (!base || !ctx.member.mail_secret)
    fail(503, "MAIL_NOT_CONFIGURED", "Stalwart не подключён");
  if (ctx.member.mail_auth_failed)
    fail(
      502,
      "MAIL_AUTH",
      "Почтовый сервер отклонил доступ. Обновите подключение ящика или обратитесь к администратору.",
    );
  const checkAuthentication = async (response: Response) => {
    if (response.status !== 401) return;
    // Stop repeated attempts with a revoked password: upstream may ban the
    // entire application IP. A newly saved credential must not be invalidated.
    await query(
      "UPDATE memberships SET mail_auth_failed=true,mail_error=$1 WHERE id=$2 AND mail_secret=$3",
      [
        "Почтовый сервер отклонил сохранённые данные входа",
        ctx.member.id,
        ctx.member.mail_secret,
      ],
    );
    fail(
      502,
      "MAIL_AUTH",
      "Почтовый сервер отклонил доступ. Обновите подключение ящика или обратитесь к администратору.",
    );
  };
  const auth = mailAuthorization(ctx.member.mail_secret);
  const res = await discoverSession(ctx.member.mail_secret);
  await checkAuthentication(res);
  if (!res.ok) fail(502, "MAIL_AUTH", "Ошибка авторизации почтового сервера");
  const session: any = await res.json();
  const api = safeMailUrl(session.apiUrl);
  if (!session.accounts?.[ctx.member.mail_account_id])
    fail(403, "MAIL_ACCOUNT", "Токен не имеет доступа к подключённому ящику");
  const response = await fetch(api, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", ...capabilities],
      methodCalls: calls,
    }),
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  await checkAuthentication(response);
  if (!response.ok)
    fail(502, "MAIL_UPSTREAM", "Почтовый сервис временно недоступен");
  const result: any = await response.json();
  if (
    result.methodResponses?.some(
      (x: any) =>
        (x[0] === "error" && !allowedErrors.includes(x[1].type)) ||
        Object.keys(x[1].notCreated ?? {}).length ||
        Object.keys(x[1].notUpdated ?? {}).length ||
        Object.keys(x[1].notDestroyed ?? {}).length,
    )
  )
    fail(
      502,
      "MAIL_METHOD",
      "Почтовый сервис отклонил операцию: " +
        JSON.stringify(
          result.methodResponses.map((x: any) => ({
            error: x[0] === "error" ? x[1] : undefined,
            notCreated: x[1].notCreated,
            notUpdated: x[1].notUpdated,
            notDestroyed: x[1].notDestroyed,
          })),
        ).slice(0, 350),
    );
  return { session, result };
}
async function jmapList(
  ctx: Context,
  folder: string,
  search: string,
  page: number,
) {
  const a = ctx.member.mail_account_id;
  const { result: folders } = await jmap(ctx, [
    ["Mailbox/get", { accountId: a }, "folders"],
  ]);
  const list = folders.methodResponses[0][1].list;
  const role = folder === "spam" ? "junk" : folder;
  const mailbox = list.find((x: any) => x.role === role);
  const filter: any = {};
  if (folder === "starred") filter.hasKeyword = "$flagged";
  else {
    if (!mailbox) return { items: [], total: 0, counts: [] };
    filter.inMailbox = mailbox.id;
  }
  if (search) filter.text = search;
  const { result } = await jmap(ctx, [
    [
      "Email/query",
      {
        accountId: a,
        filter,
        sort: [{ property: "receivedAt", isAscending: false }],
        position: (page - 1) * 40,
        limit: 40,
        calculateTotal: true,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId: a,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: [
          "id",
          "subject",
          "from",
          "to",
          "preview",
          "keywords",
          "receivedAt",
          "size",
          "hasAttachment",
          "mailboxIds",
        ],
      },
      "g",
    ],
  ]);
  return {
    items: result.methodResponses[1][1].list.map((m: any) =>
      normalizeJmap(m, list),
    ),
    total: result.methodResponses[0][1].total,
    counts: list.map((x: any) => ({
      folder:
        x.role === "draft" ? "drafts" : x.role === "junk" ? "spam" : x.role,
      total: x.totalEmails,
      unread: x.unreadEmails,
    })),
  };
}
function normalizeJmap(m: any, folders: any[] = []) {
  const role = folders.find((f) => m.mailboxIds?.[f.id])?.role;
  return {
    id: m.id,
    folder: role === "draft" ? "drafts" : role === "junk" ? "spam" : role,
    subject: m.subject,
    sender: m.from?.[0]?.email ?? "",
    recipients: m.to?.map((x: any) => x.email) ?? [],
    preview: m.preview,
    read: !!m.keywords?.["$seen"],
    starred: !!m.keywords?.["$flagged"],
    created_at: m.receivedAt,
    size_bytes: m.size,
    attachments: (m.attachments ?? []).map((a: any) => ({
      id: remoteAttachmentId(m.id, a.blobId),
      name: a.name ?? "attachment",
      size: a.size,
      type: a.type,
    })),
  };
}
function remoteAttachmentId(emailId: string, blobId: string) {
  return (
    "jmap." +
    Buffer.from(JSON.stringify({ emailId, blobId })).toString("base64url")
  );
}
async function mailboxes(ctx: Context) {
  const { result } = await jmap(ctx, [
    ["Mailbox/get", { accountId: ctx.member.mail_account_id }, "m"],
  ]);
  return result.methodResponses[0][1].list;
}
async function jmapGet(ctx: Context, id: string) {
  const { result } = await jmap(ctx, [
    [
      "Email/get",
      {
        accountId: ctx.member.mail_account_id,
        ids: [id],
        fetchTextBodyValues: true,
      },
      "get",
    ],
    ["Mailbox/get", { accountId: ctx.member.mail_account_id }, "m"],
  ]);
  const m = result.methodResponses[0][1].list[0];
  if (!m) fail(404, "NOT_FOUND", "Письмо не найдено");
  return {
    ...normalizeJmap(m, result.methodResponses[1][1].list),
    body:
      m.textBody
        ?.map((p: any) => m.bodyValues?.[p.partId]?.value ?? "")
        .join("\n") ?? "",
    cc: m.cc?.map((x: any) => x.email) ?? [],
    bcc: m.bcc?.map((x: any) => x.email) ?? [],
  };
}
export async function remoteAttachment(ctx: Context, id: string) {
  let ref: any;
  try {
    ref = JSON.parse(Buffer.from(id.slice(5), "base64url").toString());
  } catch {
    fail(404, "NOT_FOUND", "Вложение не найдено");
  }
  const { session, result } = await jmap(ctx, [
    [
      "Email/get",
      {
        accountId: ctx.member.mail_account_id,
        ids: [ref.emailId],
        properties: ["id", "attachments"],
      },
      "a",
    ],
  ]);
  const a = result.methodResponses[0][1].list[0]?.attachments?.find(
    (a: any) => a.blobId === ref.blobId,
  );
  if (!a) fail(404, "NOT_FOUND", "Вложение не найдено");
  return { a, session };
}
function safeMailUrl(path: string) {
  const base = process.env.STALWART_URL!;
  let u = new URL(path, base);
  if (
    process.env.STALWART_PUBLIC_URL &&
    u.origin === new URL(process.env.STALWART_PUBLIC_URL).origin
  )
    u = new URL(u.pathname + u.search, base);
  if (u.origin !== new URL(base).origin)
    fail(502, "MAIL_ORIGIN", "Недопустимый адрес");
  return u;
}
export async function downloadRemoteAttachment(ctx: Context, id: string) {
  const { a, session } = await remoteAttachment(ctx, id);
  const url = session.downloadUrl
    .replace("{accountId}", encodeURIComponent(ctx.member.mail_account_id))
    .replace("{blobId}", encodeURIComponent(a.blobId))
    .replace("{name}", encodeURIComponent(a.name ?? "attachment"))
    .replace("{type}", "application%2Foctet-stream");
  const r = await fetch(safeMailUrl(url), {
    headers: { Authorization: mailAuthorization(ctx.member.mail_secret) },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) fail(502, "DOWNLOAD", "Не удалось скачать вложение");
  if (a.size > 25 * 1048576)
    fail(413, "TOO_LARGE", "Вложение превышает лимит скачивания 25 МБ");
  return {
    filename: a.name ?? "attachment",
    data: Buffer.from(await r.arrayBuffer()),
  };
}
async function uploadedParts(ctx: Context, ids: string[]) {
  const parts = [];
  for (const id of ids) {
    if (id.startsWith("jmap.")) {
      const { a } = await remoteAttachment(ctx, id);
      parts.push({
        blobId: a.blobId,
        type: a.type,
        name: a.name,
        disposition: "attachment",
      });
      continue;
    }
    const [f] = await query(
      "SELECT * FROM attachments WHERE id=$1 AND tenant_id=$2 AND mailbox_id=$3",
      [id, ctx.tenant.id, ctx.member.id],
    );
    if (!f) fail(404, "ATTACHMENT_NOT_FOUND", "Вложение недоступно");
    const { session } = await jmap(ctx, []);
    const url = safeMailUrl(
      session.uploadUrl.replace(
        "{accountId}",
        encodeURIComponent(ctx.member.mail_account_id),
      ),
    );
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: mailAuthorization(ctx.member.mail_secret),
        "Content-Type": f.content_type,
      },
      body: f.data,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      fail(502, "MAIL_UPLOAD", "Не удалось загрузить вложение в Stalwart");
    const blob: any = await r.json();
    parts.push({
      blobId: blob.blobId,
      type: f.content_type,
      name: f.filename,
      disposition: "attachment",
    });
  }
  return parts;
}
export async function jmapDraft(ctx: Context, data: Compose) {
  const folders = await mailboxes(ctx);
  const draft = folders.find((f: any) => f.role === "drafts");
  if (!draft) fail(502, "NO_DRAFTS", "Не найдена папка черновиков");
  if (data.draftId) {
    const old = await getMail(ctx, data.draftId);
    if (old.folder !== "drafts")
      fail(404, "DRAFT_NOT_FOUND", "Черновик недоступен");
  }
  const attachments = await uploadedParts(ctx, data.attachmentIds);
  const addresses = (x: string[]) => x.map((email) => ({ email }));
  const message: any = {
    mailboxIds: { [draft.id]: true },
    keywords: { $draft: true, $seen: true },
    from: [
      {
        email: ctx.member.email,
        name: ctx.user.full_name ?? ctx.user.name ?? ctx.member.email,
      },
    ],
    to: addresses(data.to),
    cc: addresses(data.cc),
    bcc: addresses(data.bcc),
    subject: data.subject,
    textBody: [{ partId: "text", type: "text/plain" }],
    bodyValues: { text: { value: data.body } },
    attachments,
  };
  const { result } = await jmap(ctx, [
    [
      "Email/set",
      { accountId: ctx.member.mail_account_id, create: { draft: message } },
      "create",
    ],
  ]);
  const id = result.methodResponses[0][1].created.draft.id;
  if (data.draftId)
    await jmap(ctx, [
      [
        "Email/set",
        { accountId: ctx.member.mail_account_id, destroy: [data.draftId] },
        "delete",
      ],
    ]);
  return { id };
}
export async function jmapDelete(ctx: Context, id: string) {
  const m = await getMail(ctx, id);
  if (!["trash", "drafts"].includes(m.folder))
    fail(409, "TRASH_FIRST", "Сначала переместите письмо в корзину");
  await jmap(ctx, [
    [
      "Email/set",
      { accountId: ctx.member.mail_account_id, destroy: [id] },
      "delete",
    ],
  ]);
}
export type CalendarMail = {
  html: string;
  ics: string;
  method: "REQUEST" | "CANCEL" | "REPLY";
};
export async function sendCalendarMail(
  ctx: Context,
  data: Compose,
  key: string,
  calendar: CalendarMail,
) {
  return jmapSend(ctx, data, key, calendar);
}
async function calendarDraft(
  ctx: Context,
  data: Compose,
  key: string,
  calendar: CalendarMail,
) {
  const draft = await mailboxForRole(ctx, "drafts");
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows",
  });
  const message = await transport.sendMail({
    from: {
      name: ctx.user.full_name ?? ctx.user.name ?? ctx.member.email,
      address: ctx.member.email,
    },
    to: data.to,
    subject: data.subject,
    text: data.body,
    html: calendar.html,
    messageId: `<${digest(key)}@${ctx.member.email.split("@")[1]}>`,
    icalEvent: {
      method: calendar.method,
      filename: "meeting.ics",
      content: calendar.ics,
    },
  });
  const a = ctx.member.mail_account_id;
  const { result: uploaded } = await jmap(
    ctx,
    [
      [
        "Blob/upload",
        {
          accountId: a,
          create: {
            mime: {
              type: "message/rfc822",
              data: [
                {
                  "data:asBase64": (message.message as Buffer).toString(
                    "base64",
                  ),
                },
              ],
            },
          },
        },
        "b",
      ],
    ],
    ["urn:ietf:params:jmap:blob"],
  );
  const blobId = uploaded.methodResponses[0][1].created.mime.id;
  const { result: imported } = await jmap(ctx, [
    [
      "Email/import",
      {
        accountId: a,
        emails: {
          draft: {
            blobId,
            mailboxIds: { [draft.id]: true },
            keywords: { $draft: true, $seen: true },
          },
        },
      },
      "i",
    ],
  ]);
  if (!imported.methodResponses[0][1].created?.draft)
    fail(502, "MAIL_IMPORT", "Не удалось подготовить приглашение");
  return { id: imported.methodResponses[0][1].created.draft.id };
}
async function jmapSend(
  ctx: Context,
  data: Compose,
  key: string,
  calendar?: CalendarMail,
) {
  const requestHash = digest(
    JSON.stringify(calendar ? [data, calendar] : data),
  );
  const [created] = await query(
    "INSERT INTO idempotency(mailbox_id,key,request_hash,response) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key",
    [ctx.member.id, key, requestHash, { status: "processing" }],
  );
  if (!created) {
    const [old] = await query(
      "SELECT * FROM idempotency WHERE mailbox_id=$1 AND key=$2",
      [ctx.member.id, key],
    );
    if (old.request_hash !== requestHash)
      fail(409, "IDEMPOTENCY_CONFLICT", "Ключ запроса уже использован");
    if (old.response.status === "processing")
      fail(
        409,
        "SUBMISSION_UNCERTAIN",
        "Результат отправки ещё не подтверждён. Проверьте «Отправленные», не повторяйте отправку.",
      );
    return old.response;
  }
  let submitted = false;
  try {
    if (process.env.ALLOW_EXTERNAL_MAIL !== "true") {
      const recipients = [...data.to, ...data.cc, ...data.bcc].map((x) =>
        x.toLowerCase(),
      );
      const locals = await query(
        "SELECT email FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.email=ANY($1) AND m.status='active' AND t.status='active'",
        [recipients],
      );
      if (recipients.some((r) => !locals.some((m) => m.email === r)))
        fail(
          409,
          "EXTERNAL_MAIL_UNAVAILABLE",
          "Внешняя отправка отключена. Укажите действующий локальный ящик.",
        );
    }
    const draft = calendar
      ? await calendarDraft(ctx, data, key, calendar)
      : await jmapDraft(ctx, data);
    const folders = await mailboxes(ctx);
    const sent = folders.find((f: any) => f.role === "sent");
    if (!sent) fail(502, "MAIL_FOLDER", "Не найдена папка отправленных");
    const { result: identities } = await jmap(
      ctx,
      [["Identity/get", { accountId: ctx.member.mail_account_id }, "i"]],
      ["urn:ietf:params:jmap:submission"],
    );
    const identity = identities.methodResponses[0][1].list.find(
      (i: any) => i.email.toLowerCase() === ctx.member.email,
    );
    if (!identity)
      fail(502, "MAIL_IDENTITY", "Не найдена личность отправителя");
    submitted = true;
    const { result } = await jmap(
      ctx,
      [
        [
          "EmailSubmission/set",
          {
            accountId: ctx.member.mail_account_id,
            create: { send: { emailId: draft.id, identityId: identity.id } },
            onSuccessUpdateEmail: {
              "#send": {
                mailboxIds: { [sent.id]: true },
                "keywords/$draft": null,
              },
            },
          },
          "send",
        ],
      ],
      ["urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"],
    );
    const response = {
      id: draft.id,
      status: "accepted",
      submissionId: result.methodResponses[0][1].created.send.id,
    };
    await query(
      "UPDATE idempotency SET response=$1 WHERE mailbox_id=$2 AND key=$3",
      [response, ctx.member.id, key],
    );
    await audit(ctx.tenant.id, ctx.user.id, "mail.sent", draft.id);
    return response;
  } catch (e) {
    if (!submitted)
      await query("DELETE FROM idempotency WHERE mailbox_id=$1 AND key=$2", [
        ctx.member.id,
        key,
      ]);
    throw e;
  }
}

export async function mailboxForRole(ctx: Context, role: string) {
  const folders = await mailboxes(ctx);
  let f = folders.find((m: any) => m.role === role);
  if (!f && role === "archive") {
    const { result } = await jmap(ctx, [
      [
        "Mailbox/set",
        {
          accountId: ctx.member.mail_account_id,
          create: { archive: { name: "Архив", role: "archive" } },
        },
        "create",
      ],
    ]);
    f = result.methodResponses[0][1].created.archive;
  }
  if (!f) fail(400, "FOLDER_NOT_FOUND", "Папка не найдена");
  return f;
}
