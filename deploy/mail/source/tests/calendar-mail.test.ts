import { test, after } from "node:test";
import assert from "node:assert/strict";
import { invitationMail } from "../server/calendar-mail.js";
import { pool } from "../server/db.js";
after(() => pool.end());
const event = {
  uid: "stable-uid",
  sequence: 3,
  title: "<img src=x onerror=alert(1)>",
  description: "<script>bad</script>",
  locations: { p: { name: "<unsafe>" } },
  utcStart: "2026-09-25T10:00:00Z",
  utcEnd: "2026-09-25T11:00:00Z",
  timeZone: "Asia/Almaty",
  organizerCalendarAddress: "mailto:a@example.test",
  participants: {
    a: { calendarAddress: "mailto:a@example.test", roles: { owner: true } },
    b: {
      calendarAddress: "mailto:b@example.test",
      participationStatus: "needs-action",
    },
  },
};
test("branded invite escapes untrusted content and uses local time with native iCalendar RSVP", () => {
  const m = invitationMail(event, "REQUEST", "a@example.test");
  assert.ok(m.html.includes("Mail"));
  assert.ok(!m.html.includes("Stalwart"));
  assert.ok(!m.html.includes("<script>"));
  assert.ok(!m.html.includes("<img"));
  assert.ok(m.body.includes("15:00"));
  assert.ok(m.ics.includes("METHOD:REQUEST"));
  assert.ok(m.ics.includes("RSVP=TRUE"));
  assert.ok(m.ics.includes("SEQUENCE:3"));
  assert.ok(m.ics.includes("UID:stable-uid"));
});
test("cancellations retain UID/sequence and explicitly cancel the event", () => {
  const m = invitationMail(
    { ...event, status: "cancelled" },
    "CANCEL",
    "a@example.test",
  );
  assert.ok(m.ics.includes("METHOD:CANCEL"));
  assert.ok(m.ics.includes("STATUS:CANCELLED"));
  assert.ok(m.ics.includes("UID:stable-uid"));
  assert.ok(!m.ics.includes("RSVP=TRUE"));
  assert.ok(m.subject.startsWith("Встреча отменена:"));
});
test("all day invitations preserve calendar date", () => {
  const m = invitationMail(
    {
      ...event,
      start: "2026-09-25T00:00:00",
      showWithoutTime: true,
      utcStart: "2026-09-24T19:00:00Z",
      utcEnd: "2026-09-25T19:00:00Z",
    },
    "REQUEST",
    "a@example.test",
  );
  assert.ok(m.body.includes("25 сентября"));
  assert.ok(m.body.includes("весь день"));
  assert.ok(m.ics.includes("DTSTART;VALUE=DATE:20260925"));
  assert.ok(m.ics.includes("DTEND;VALUE=DATE:20260926"));
});
