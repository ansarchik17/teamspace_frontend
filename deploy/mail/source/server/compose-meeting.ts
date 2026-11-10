import { z } from "zod";
import type { Context } from "./auth.js";
import { fail, query } from "./db.js";
import {
  calendarList,
  createCalendarEvent,
  eventInput,
  localDateTime,
} from "./calendar.js";
import { jmapDelete, type Compose } from "./mail.js";
export const meetingSettings = z
  .object({
    start: localDateTime,
    timeZone: z.string().min(1).max(100),
    durationMinutes: z.number().int().min(5).max(10080),
    location: z.string().max(500).default(""),
  })
  .strict();
export function composeEvent(
  data: Compose,
  meeting: z.infer<typeof meetingSettings>,
  calendarId: string,
) {
  if (data.bcc.length)
    fail(
      400,
      "MEETING_BCC",
      "Для приглашения уберите скрытых получателей: список участников встречи виден всем участникам.",
    );
  if (data.attachmentIds.length)
    fail(
      400,
      "MEETING_ATTACHMENTS",
      "Вложения к встрече пока не поддерживаются. Укажите ссылку на материалы в тексте письма или отправьте файлы отдельным письмом.",
    );
  if (!data.to.length && !data.cc.length)
    fail(400, "NO_RECIPIENT", "Укажите участников в поле «Кому»");
  return eventInput.parse({
    ...meeting,
    calendarId,
    title: data.subject,
    description: data.body,
    attendees: [
      ...new Set([...data.to, ...data.cc].map((a) => a.toLowerCase())),
    ],
  });
}
export async function sendComposeMeeting(
  ctx: Context,
  data: Compose,
  meeting: z.infer<typeof meetingSettings>,
  key: string,
) {
  const calendars = await calendarList(ctx);
  const writable = calendars.filter(
    (c: any) => c.myRights?.mayWriteAll || c.myRights?.mayWriteOwn,
  );
  const calendar = writable.find((c: any) => c.isDefault) ?? writable[0];
  if (!calendar)
    fail(403, "CALENDAR_READONLY", "Нет календаря для создания встречи");
  const result = await createCalendarEvent(
    ctx,
    composeEvent(data, meeting, calendar.id),
    key,
  );
  // A branded iMIP invitation is queued by createCalendarEvent.
  let draftCleanupPending = false;
  if (data.draftId) {
    try {
      await jmapDelete(ctx, data.draftId);
      await query(
        "DELETE FROM compose_meetings WHERE mailbox_id=$1 AND draft_id=$2",
        [ctx.member.id, data.draftId],
      );
    } catch {
      draftCleanupPending = true;
    }
  }
  return { ...result, meeting: true, draftCleanupPending };
}
