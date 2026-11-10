import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { context, type Context } from "./auth.js";
import { fail, query, ApiError } from "./db.js";
import { digest } from "./security.js";
import { jmap } from "./mail.js";
import { queueCalendarMail, type SchedulingMethod } from "./calendar-mail.js";

const cap = "urn:ietf:params:jmap:calendars";
const idSchema = z.string().min(1).max(300);
export const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/)
  .refine((v) => {
    const d = new Date(v + "Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 19) === v;
  }, "Некорректная дата или время");
const timeZone = z
  .string()
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Неизвестный часовой пояс");
export const eventInput = z
  .object({
    calendarId: idSchema,
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10000).default(""),
    location: z.string().max(500).default(""),
    start: localDateTime,
    timeZone,
    durationMinutes: z.number().int().min(5).max(10080),
    allDay: z.boolean().default(false),
    attendees: z
      .array(
        z
          .string()
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
      )
      .max(19)
      .default([]),
  })
  .strict()
  .refine(
    (v) =>
      !v.allDay ||
      (v.start.endsWith("T00:00:00") && v.durationMinutes % 1440 === 0),
    "Событие на весь день должно начинаться в полночь и длиться целое число дней",
  );
const props = [
  "id",
  "baseEventId",
  "uid",
  "calendarIds",
  "title",
  "description",
  "descriptionContentType",
  "start",
  "timeZone",
  "duration",
  "showWithoutTime",
  "utcStart",
  "utcEnd",
  "locations",
  "participants",
  "organizerCalendarAddress",
  "isOrigin",
  "status",
  "recurrenceId",
  "recurrenceRule",
  "updated",
  "sequence",
];
async function call(ctx: Context, method: string, args: any) {
  if (ctx.member.mail_backend !== "stalwart")
    fail(
      503,
      "CALENDAR_NOT_CONNECTED",
      "Для календаря подключите рабочий почтовый ящик в настройках",
    );
  const { result } = await jmap(
    ctx,
    [[method, { ...args, accountId: ctx.member.mail_account_id }, "calendar"]],
    [cap],
    ["stateMismatch"],
  );
  if (
    result.methodResponses?.some(
      (r: any) => r[0] === "error" && r[1].type === "stateMismatch",
    )
  )
    fail(
      409,
      "CALENDAR_CONFLICT",
      "Календарь изменился. Закройте встречу и откройте её снова, чтобы загрузить актуальные данные.",
    );
  const response = result.methodResponses?.find(
    (r: any) => r[0] === method,
  )?.[1];
  if (!response)
    fail(502, "CALENDAR_UPSTREAM", "Календарь временно недоступен");
  return response;
}
export async function calendarList(ctx: Context) {
  return (await call(ctx, "Calendar/get", {})).list;
}
export async function calendarEvents(
  ctx: Context,
  after: string,
  before: string,
  zone: string,
) {
  const calendars = await calendarList(ctx);
  const q = await call(ctx, "CalendarEvent/query", {
    filter: { after, before },
    timeZone: zone,
    expandRecurrences: true,
    sort: [{ property: "start", isAscending: true }],
    limit: 500,
    calculateTotal: true,
  });
  const r = await call(ctx, "CalendarEvent/get", {
    ids: q.ids,
    properties: props,
    timeZone: zone,
  });
  const baseIds = [
    ...new Set(r.list.map((e: any) => e.baseEventId).filter(Boolean)),
  ];
  const bases = baseIds.length
    ? (
        await call(ctx, "CalendarEvent/get", {
          ids: baseIds,
          properties: [
            "id",
            "recurrenceRule",
            "recurrenceOverrides",
            "showWithoutTime",
            "start",
            "timeZone",
            "duration",
          ],
        })
      ).list
    : [];
  const items = r.list.map((e: any) => {
    const base = bases.find((b: any) => b.id === e.baseEventId);
    return base &&
      !base.recurrenceRule &&
      !Object.keys(base.recurrenceOverrides ?? {}).length
      ? { ...e, ...base, id: base.id, baseEventId: null }
      : e;
  });
  return {
    calendars,
    items,
    state: r.state,
    truncated: (q.total ?? 0) > q.ids.length || q.ids.length === 500,
  };
}
export async function calendarEvent(ctx: Context, id: string) {
  const r = await call(ctx, "CalendarEvent/get", {
    ids: [id],
    properties: props,
  });
  if (!r.list?.length) fail(404, "CALENDAR_NOT_FOUND", "Встреча не найдена");
  const e = r.list[0];
  if (e.baseEventId) {
    const base = await call(ctx, "CalendarEvent/get", {
      ids: [e.baseEventId],
      properties: [
        ...props.filter((p) => !["utcStart", "utcEnd"].includes(p)),
        "recurrenceOverrides",
      ],
    });
    const b = base.list?.[0];
    if (
      b &&
      !b.recurrenceRule &&
      !Object.keys(b.recurrenceOverrides ?? {}).length
    )
      return calendarEvent(ctx, e.baseEventId);
  }
  return { event: e, state: r.state };
}
export function isOrganizer(event: any, email: string) {
  return (
    !event.organizerCalendarAddress ||
    (event.isOrigin &&
      event.organizerCalendarAddress.toLowerCase() ===
        "mailto:" + email.toLowerCase())
  );
}
function assertEditable(event: any, email: string) {
  if (event.baseEventId || event.recurrenceRule)
    fail(
      409,
      "CALENDAR_RECURRING",
      "Повторяющуюся встречу измените в календарном клиенте с поддержкой серий",
    );
  if (!isOrganizer(event, email))
    fail(
      403,
      "CALENDAR_ORGANIZER",
      "Изменять встречу может только организатор",
    );
}
async function recipientsAllowed(ctx: Context, addresses: string[]) {
  if (process.env.ALLOW_EXTERNAL_MAIL === "true" || !addresses.length) return;
  const local = await query(
    "SELECT m.email FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE lower(m.email)=ANY($1) AND m.status='active' AND t.status='active'",
    [addresses],
  );
  if (addresses.some((a) => !local.some((m) => m.email.toLowerCase() === a)))
    fail(
      409,
      "EXTERNAL_MAIL_UNAVAILABLE",
      "Внешняя отправка приглашений отключена",
    );
}
export function makeEvent(
  input: z.infer<typeof eventInput>,
  email: string,
  name: string,
  old?: any,
) {
  const participants: Record<string, any> = {};
  const prior = Object.entries(old?.participants ?? {}) as [string, any][];
  for (const address of [
    ...new Set([email.toLowerCase(), ...input.attendees]),
  ]) {
    const match = prior.find(
      ([, p]) => p.calendarAddress?.toLowerCase() === "mailto:" + address,
    );
    const owner = address === email.toLowerCase();
    participants[match?.[0] ?? randomUUID()] = match?.[1] ?? {
      "@type": "Participant",
      name: owner ? name : address,
      calendarAddress: "mailto:" + address,
      roles: owner ? { owner: true, attendee: true } : { attendee: true },
      participationStatus: owner ? "accepted" : "needs-action",
      expectReply: !owner,
    };
  }
  return {
    title: input.title,
    description: input.description,
    descriptionContentType: "text/plain",
    start: input.start,
    timeZone: input.allDay ? null : input.timeZone,
    duration: input.allDay
      ? `P${input.durationMinutes / 1440}D`
      : `PT${input.durationMinutes}M`,
    showWithoutTime: input.allDay,
    calendarIds: { [input.calendarId]: true },
    locations: input.location
      ? { place: { "@type": "Location", name: input.location } }
      : null,
    participants,
    organizerCalendarAddress: "mailto:" + email.toLowerCase(),
  };
}
export async function saveCalendarEvent(
  ctx: Context,
  input: z.infer<typeof eventInput>,
  id?: string,
  state?: string,
) {
  const old = id ? (await calendarEvent(ctx, id)).event : undefined;
  if (old) {
    assertEditable(old, ctx.member.email);
    id = old.id;
  }
  const calendars = await calendarList(ctx);
  if (
    !calendars.some(
      (c: any) =>
        c.id === input.calendarId &&
        (c.myRights?.mayWriteAll || c.myRights?.mayWriteOwn),
    )
  )
    fail(403, "CALENDAR_READONLY", "Календарь недоступен для записи");
  const previous = (Object.values(old?.participants ?? {}) as any[])
    .map((p) => p.calendarAddress?.replace(/^mailto:/i, "").toLowerCase())
    .filter(Boolean);
  await recipientsAllowed(
    ctx,
    [...new Set([...input.attendees, ...previous])].filter(
      (a) => a !== ctx.member.email.toLowerCase(),
    ),
  );
  const data = makeEvent(
    input,
    ctx.member.email,
    ctx.user.full_name ?? ctx.user.name ?? ctx.member.email,
    old,
  );
  const r = await call(ctx, "CalendarEvent/set", {
    ...(state ? { ifInState: state } : {}),
    sendSchedulingMessages: false,
    ...(id
      ? { update: { [id]: { ...data, sequence: (old.sequence ?? 0) + 1 } } }
      : {
          create: { event: { "@type": "Event", uid: randomUUID(), ...data } },
        }),
  });
  const savedId = id ?? r.created.event.id;
  try {
    const saved = (await calendarEvent(ctx, savedId)).event;
    await queueCalendarMail(ctx, saved, "REQUEST", input.attendees);
    const removed = previous.filter(
      (a) =>
        !input.attendees.includes(a) && a !== ctx.member.email.toLowerCase(),
    );
    if (old && removed.length)
      await queueCalendarMail(
        ctx,
        { ...old, sequence: saved.sequence, status: "cancelled" },
        "CANCEL",
        removed,
      );
  } catch {
    // The event is already committed. Do not treat a subsequent get/queue
    // failure as a rejected create and permit a duplicate invitation on retry.
    fail(
      502,
      "CALENDAR_SAVED_DELIVERY",
      "Встреча сохранена, но подготовка приглашений не подтверждена. Проверьте календарь и обратитесь к администратору перед повторной отправкой.",
    );
  }
  return { id: savedId, state: r.newState };
}
export async function deleteCalendarEvent(
  ctx: Context,
  id: string,
  state: string,
) {
  const { event } = await calendarEvent(ctx, id);
  assertEditable(event, ctx.member.email);
  id = event.id;
  await recipientsAllowed(
    ctx,
    (Object.values(event.participants ?? {}) as any[])
      .map((p) => p.calendarAddress?.replace(/^mailto:/i, "").toLowerCase())
      .filter((a: string) => a && a !== ctx.member.email.toLowerCase()),
  );
  await call(ctx, "CalendarEvent/set", {
    ifInState: state,
    destroy: [id],
    sendSchedulingMessages: false,
  });
  await queueCalendarMail(
    ctx,
    { ...event, sequence: (event.sequence ?? 0) + 1, status: "cancelled" },
    "CANCEL",
    participantAddresses(event),
  );
  return { ok: true };
}
function participantAddresses(event: any): string[] {
  return (Object.values(event.participants ?? {}) as any[])
    .map((p) => p.calendarAddress?.replace(/^mailto:/i, "").toLowerCase())
    .filter(Boolean);
}
export async function rsvpCalendarEvent(
  ctx: Context,
  id: string,
  status: string,
  state: string,
) {
  const { event } = await calendarEvent(ctx, id);
  id = event.id;
  const own = (
    Object.entries(event.participants ?? {}) as [string, any][]
  ).find(
    ([, p]) =>
      p.calendarAddress?.toLowerCase() ===
      "mailto:" + ctx.member.email.toLowerCase(),
  );
  if (!own || isOrganizer(event, ctx.member.email))
    fail(403, "CALENDAR_RSVP", "Вы не приглашены на эту встречу");
  if (event.baseEventId || event.recurrenceRule)
    fail(
      409,
      "CALENDAR_RECURRING",
      "Ответьте на повторяющееся приглашение в календарном клиенте",
    );
  await recipientsAllowed(ctx, [
    event.organizerCalendarAddress.replace(/^mailto:/i, "").toLowerCase(),
  ]);
  const key = own[0].replace(/~/g, "~0").replace(/\//g, "~1");
  await call(ctx, "CalendarEvent/set", {
    ifInState: state,
    update: {
      [id]: {
        [`participants/${key}/participationStatus`]: status,
        [`participants/${key}/expectReply`]: false,
      },
    },
    sendSchedulingMessages: false,
  });
  await queueCalendarMail(
    ctx,
    {
      ...event,
      participants: {
        [own[0]]: {
          ...own[1],
          participationStatus: status,
          expectReply: false,
        },
      },
    },
    "REPLY",
    [event.organizerCalendarAddress.replace(/^mailto:/i, "")],
  );
  return { ok: true };
}
// Export an occurrence as an RFC 5545 event. UTC avoids ambiguous timezone definitions.
export function eventIcs(e: any, method?: SchedulingMethod) {
  const escape = (v: any) =>
    String(v ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  const stamp = (v: string) => v.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  if (!e.utcStart || !e.utcEnd)
    fail(502, "CALENDAR_EXPORT", "Сервер не вернул время встречи");
  const allDay = !!e.showWithoutTime;
  const date = (v: string) => v.slice(0, 10).replace(/-/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TeamSpace//Calendar//RU",
    "CALSCALE:GREGORIAN",
    ...(method ? [`METHOD:${method}`] : []),
    "BEGIN:VEVENT",
    `SEQUENCE:${Number.isSafeInteger(e.sequence) && e.sequence >= 0 ? e.sequence : 0}`,
    `UID:${escape(e.baseEventId ? e.uid + "-" + e.id : e.uid)}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `SUMMARY:${escape(e.title)}`,
  ];
  if (allDay) {
    lines.push(
      "DTSTART;VALUE=DATE:" + date(e.start),
      "DTEND;VALUE=DATE:" +
        date(
          new Date(
            Date.parse(e.start.slice(0, 10) + "T00:00:00Z") +
              Math.round(
                (Date.parse(e.utcEnd) - Date.parse(e.utcStart)) / 86400000,
              ) *
                86400000,
          ).toISOString(),
        ),
    );
  } else lines.push("DTSTART:" + stamp(e.utcStart), "DTEND:" + stamp(e.utcEnd));
  if (e.description) lines.push("DESCRIPTION:" + escape(e.description));
  const location = (Object.values(e.locations ?? {}) as any[])
    .map((l) => l.name)
    .filter(Boolean)
    .join(", ");
  if (location) lines.push("LOCATION:" + escape(location));
  // Addresses are validated before use to prevent property injection from imported events.
  const address = (v: any) =>
    typeof v === "string" && /^mailto:[^\s:;,"<>]+@[^\s:;,"<>]+$/i.test(v)
      ? v
      : null;
  if (address(e.organizerCalendarAddress))
    lines.push("ORGANIZER:" + e.organizerCalendarAddress);
  for (const p of Object.values(e.participants ?? {}) as any[]) {
    const a = address(p.calendarAddress);
    if (!a || p.roles?.owner) continue;
    const status = ["accepted", "declined", "tentative"].includes(
      p.participationStatus,
    )
      ? p.participationStatus.toUpperCase()
      : "NEEDS-ACTION";
    lines.push(
      `ATTENDEE;PARTSTAT=${status}${method === "REQUEST" ? ";RSVP=TRUE" : ""}:${a}`,
    );
  }
  lines.push(
    "STATUS:" + (e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"),
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return (
    lines
      .map((line) => {
        let out = "",
          size = 0;
        for (const ch of line) {
          const n = Buffer.byteLength(ch);
          if (size + n > 75) {
            out += "\r\n ";
            size = 1;
          }
          out += ch;
          size += n;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
}
// Store the attempt before contacting Stalwart: a timed-out request must not
// create another meeting and send duplicate invitations when retried.
export async function createCalendarEvent(
  ctx: Context,
  input: z.infer<typeof eventInput>,
  requestId: string,
) {
  const key = "calendar:" + requestId,
    hash = digest(JSON.stringify(input));
  const [inserted] = await query(
    "INSERT INTO idempotency(mailbox_id,key,request_hash,response) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key",
    [ctx.member.id, key, hash, { status: "processing" }],
  );
  if (!inserted) {
    const [old] = await query(
      "SELECT * FROM idempotency WHERE mailbox_id=$1 AND key=$2",
      [ctx.member.id, key],
    );
    if (old.request_hash !== hash)
      fail(
        409,
        "CALENDAR_REQUEST_CONFLICT",
        "Предыдущая попытка сохранения уже отправлена. Проверьте календарь перед изменением встречи.",
      );
    if (old.response.status === "processing")
      fail(
        409,
        "CALENDAR_UNCERTAIN",
        "Результат сохранения ещё не подтверждён. Закройте форму и обновите календарь перед повторной попыткой.",
      );
    return old.response;
  }
  try {
    const result = await saveCalendarEvent(ctx, input);
    await query(
      "UPDATE idempotency SET response=$1 WHERE mailbox_id=$2 AND key=$3",
      [result, ctx.member.id, key],
    );
    return result;
  } catch (error) {
    // Only a definite rejection is safe to retry. Network/HTTP errors may occur
    // after the upstream server committed the event.
    if (
      error instanceof ApiError &&
      (error.status < 500 ||
        [
          "CALENDAR_NOT_CONNECTED",
          "MAIL_NOT_CONFIGURED",
          "MAIL_METHOD",
          "MAIL_AUTH",
        ].includes(error.code))
    )
      await query("DELETE FROM idempotency WHERE mailbox_id=$1 AND key=$2", [
        ctx.member.id,
        key,
      ]);
    throw error;
  }
}

export function calendarRoutes(app: FastifyInstance) {
  app.get("/api/calendar/events", async (req) => {
    const ctx = await context(req);
    const b = z
      .object({
        after: z.string().datetime(),
        before: z.string().datetime(),
        timeZone: timeZone.default("Asia/Almaty"),
      })
      .parse(req.query);
    if (
      Date.parse(b.before) <= Date.parse(b.after) ||
      Date.parse(b.before) - Date.parse(b.after) > 93 * 86400000
    )
      fail(400, "CALENDAR_RANGE", "Выберите период до трёх месяцев");
    return calendarEvents(ctx, b.after, b.before, b.timeZone);
  });
  app.get("/api/calendar/events/:id", async (req) =>
    calendarEvent(await context(req), idSchema.parse((req.params as any).id)),
  );
  app.post("/api/calendar/events", async (req) => {
    const ctx = await context(req);
    return createCalendarEvent(
      ctx,
      eventInput.parse(req.body),
      z.string().uuid().parse(req.headers["idempotency-key"]),
    );
  });
  app.put("/api/calendar/events/:id", async (req) => {
    const ctx = await context(req);
    const { state, event } = z
      .object({ state: z.string().min(1).max(500), event: eventInput })
      .parse(req.body);
    return saveCalendarEvent(
      ctx,
      event,
      idSchema.parse((req.params as any).id),
      state,
    );
  });
  app.delete("/api/calendar/events/:id", async (req) => {
    const ctx = await context(req);
    const { state } = z
      .object({ state: z.string().min(1).max(500) })
      .parse(req.body);
    return deleteCalendarEvent(
      ctx,
      idSchema.parse((req.params as any).id),
      state,
    );
  });
  app.post("/api/calendar/events/:id/rsvp", async (req) => {
    const ctx = await context(req);
    const b = z
      .object({
        status: z.enum(["accepted", "tentative", "declined"]),
        state: z.string().min(1).max(500),
      })
      .parse(req.body);
    return rsvpCalendarEvent(
      ctx,
      idSchema.parse((req.params as any).id),
      b.status,
      b.state,
    );
  });
  app.get("/api/calendar/events/:id/ics", async (req, reply) => {
    const { event } = await calendarEvent(
      await context(req),
      idSchema.parse((req.params as any).id),
    );
    return reply
      .header("Cache-Control", "no-store")
      .header("Content-Disposition", 'attachment; filename="meeting.ics"')
      .type("text/calendar; charset=utf-8")
      .send(eventIcs(event));
  });
}
