import type { Context } from "./auth.js";
import { query, tx } from "./db.js";
import { eventIcs } from "./calendar.js";
import { sendCalendarMail, type CalendarMail } from "./mail.js";

export type SchedulingMethod = CalendarMail["method"];
const labels = {
  REQUEST: "Приглашение на встречу",
  CANCEL: "Встреча отменена",
  REPLY: "Ответ на приглашение",
};
const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function invitationMail(
  event: any,
  method: SchedulingMethod,
  sender: string,
) {
  const zone = event.timeZone || "Etc/UTC";
  const date = event.showWithoutTime
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(event.start.slice(0, 10) + "T00:00:00Z")) +
      " · весь день"
    : new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(event.utcStart)) +
      " (" +
      zone +
      ")";
  const location = Object.values(event.locations ?? {})
    .map((l: any) => l.name)
    .filter(Boolean)
    .join(", ");
  const participants = (Object.values(event.participants ?? {}) as any[])
    .map((p) => p.calendarAddress?.replace(/^mailto:/i, ""))
    .filter(Boolean);
  const own = (Object.values(event.participants ?? {}) as any[]).find(
    (p) =>
      p.calendarAddress?.toLowerCase() === "mailto:" + sender.toLowerCase(),
  );
  const response =
    method === "REPLY"
      ? ({ accepted: "Принято", declined: "Отклонено", tentative: "Возможно" }[
          own?.participationStatus as string
        ] ?? "Ответ обновлён")
      : "";
  const heading = response ? `${labels[method]}: ${response}` : labels[method];
  const instructions =
    method === "REQUEST"
      ? "Ответьте на приглашение в вашем почтовом приложении или откройте файл meeting.ics в календаре."
      : "";
  const text = [
    heading,
    event.title,
    date,
    location,
    event.description,
    `Участники: ${participants.join(", ")}`,
    instructions,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html lang="ru"><body style="margin:0;background:#f3f6fb;font-family:Arial,sans-serif;color:#202124"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:600px;margin:auto;background:white;border-radius:16px;border:1px solid #e4e9f0" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 32px;border-bottom:1px solid #e4e9f0;color:#0b57d0;font-size:22px;font-weight:bold">TeamSpace Mail</td></tr><tr><td style="padding:28px 32px"><p style="color:#5f6368;margin:0 0 12px">${escapeHtml(heading)}</p><h1 style="font-size:24px;line-height:1.3;margin:0 0 24px">${escapeHtml(event.title)}</h1><div style="padding:18px;background:#eff5ff;border-radius:10px"><strong>Когда</strong><p style="margin:8px 0 0">${escapeHtml(date)}</p></div>${location ? `<p><strong>Место</strong><br>${escapeHtml(location)}</p>` : ""}${event.description ? `<p style="line-height:1.6;white-space:pre-wrap">${escapeHtml(event.description)}</p>` : ""}<p style="line-height:1.6"><strong>Участники</strong><br>${participants.map(escapeHtml).join("<br>")}</p>${instructions ? `<p style="color:#5f6368;font-size:14px;line-height:1.5">${escapeHtml(instructions)}</p>` : ""}</td></tr></table></td></tr></table></body></html>`;
  return {
    subject: `${heading}: ${event.title}`,
    body: text,
    html,
    ics: eventIcs(event, method),
    method,
  };
}
export async function queueCalendarMail(
  ctx: Context,
  event: any,
  method: SchedulingMethod,
  recipients: string[],
) {
  const to = [...new Set(recipients.map((a) => a.toLowerCase()))].filter(
    (a) => a !== ctx.member.email.toLowerCase(),
  );
  if (!to.length) return;
  const message = invitationMail(event, method, ctx.member.email);
  await query(
    `INSERT INTO calendar_outbox(mailbox_id,event_uid,method,payload) VALUES($1,$2,$3,$4)`,
    [ctx.member.id, event.uid, method, { ...message, to }],
  );
}
// Claim before I/O. An uncertain submission is never automatically sent twice.
export async function calendarMailTick() {
  await query(
    `UPDATE calendar_outbox SET status='uncertain' WHERE status='sending' AND updated_at<now()-interval '5 minutes'`,
  );
  // Expose delivery problems to the sender instead of silently losing invitations.
  await query(`INSERT INTO notifications(tenant_id,user_id,title,body,kind,dedup_key)
    SELECT m.tenant_id,m.user_id,'Проверьте отправку приглашения','Доставка приглашения не подтверждена. Проверьте папку «Отправленные» и обратитесь к администратору перед повторной отправкой.','calendar','calendar-delivery:'||o.id
    FROM calendar_outbox o JOIN memberships m ON m.id=o.mailbox_id WHERE o.status IN ('failed','uncertain') ON CONFLICT DO NOTHING`);
  const job = await tx(async (c) => {
    const r = (
      await c.query(
        `SELECT o.* FROM calendar_outbox o WHERE o.status='pending' AND o.next_attempt_at<=now() AND NOT EXISTS (SELECT 1 FROM calendar_outbox earlier WHERE earlier.mailbox_id=o.mailbox_id AND earlier.event_uid=o.event_uid AND (earlier.created_at,earlier.id)<(o.created_at,o.id) AND earlier.status NOT IN ('accepted','failed')) ORDER BY o.created_at,o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1`,
      )
    ).rows[0];
    if (r)
      await c.query(
        `UPDATE calendar_outbox SET status='sending',attempts=attempts+1,updated_at=now() WHERE id=$1`,
        [r.id],
      );
    return r;
  });
  if (!job) return;
  try {
    const [member] = await query(
      `SELECT m.* FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN identities u ON u.id=m.user_id WHERE m.id=$1 AND m.status='active' AND t.status='active' AND u.active=true`,
      [job.mailbox_id],
    );
    if (!member) throw new Error("Отправитель недоступен");
    const [user] = await query("SELECT * FROM identities WHERE id=$1", [
      member.user_id,
    ]);
    const [tenant] = await query("SELECT * FROM tenants WHERE id=$1", [
      member.tenant_id,
    ]);
    const p = job.payload;
    await sendCalendarMail(
      { member, user, tenant, session: null },
      {
        to: p.to,
        cc: [],
        bcc: [],
        subject: p.subject,
        body: p.body,
        attachmentIds: [],
      },
      "calendar-mail:" + job.id,
      { html: p.html, ics: p.ics, method: p.method },
    );
    await query(
      `UPDATE calendar_outbox SET status='accepted',updated_at=now() WHERE id=$1`,
      [job.id],
    );
  } catch (error: any) {
    const [attempt] = await query(
      "SELECT response FROM idempotency WHERE mailbox_id=$1 AND key=$2",
      [job.mailbox_id, "calendar-mail:" + job.id],
    );
    const status =
      attempt?.response?.status === "processing"
        ? "uncertain"
        : job.attempts >= 4
          ? "failed"
          : "pending";
    await query(
      `UPDATE calendar_outbox SET status=$1,last_error=$2,next_attempt_at=now()+interval '30 seconds',updated_at=now() WHERE id=$3`,
      [status, "Не удалось подтвердить отправку приглашения", job.id],
    );
  }
}
