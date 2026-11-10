import { test, after, afterEach, mock as nodeMock } from "node:test";
import assert from "node:assert/strict";
import {
  eventInput,
  makeEvent,
  eventIcs,
  calendarEvents,
  saveCalendarEvent,
  rsvpCalendarEvent,
  deleteCalendarEvent,
} from "../server/calendar.js";
import { encrypt } from "../server/security.js";
import { pool } from "../server/db.js";
const originalFetch = globalThis.fetch,
  env = { ...process.env };
process.env.MAIL_CREDENTIAL_KEY = "aa".repeat(32);
process.env.STALWART_URL = "https://calendar.example.test";
process.env.ALLOW_EXTERNAL_MAIL = "true";
const ctx: any = {
  user: { name: "Alice" },
  member: {
    email: "alice@example.test",
    mail_backend: "stalwart",
    mail_secret: encrypt("personal-token"),
    mail_account_id: "own",
  },
};
const input = () =>
  eventInput.parse({
    calendarId: "cal",
    title: "Review",
    start: "2026-09-22T10:00:00",
    timeZone: "Asia/Almaty",
    durationMinutes: 30,
    attendees: ["bob@example.test"],
  });
function mock(handler: (m: string, a: any) => any) {
  globalThis.fetch = (async (url: any, init: any) => {
    assert.equal(new URL(url).origin, "https://calendar.example.test");
    assert.equal(init.headers.Authorization, "Bearer personal-token");
    if (new URL(url).pathname === "/.well-known/jmap")
      return Response.json({
        apiUrl: "https://calendar.example.test/jmap/",
        accounts: { own: {} },
      });
    const b = JSON.parse(init.body);
    assert.ok(b.using.includes("urn:ietf:params:jmap:calendars"));
    return Response.json({
      methodResponses: b.methodCalls.map(([m, a, t]: any) => {
        assert.equal(a.accountId, "own");
        return [m, handler(m, a), t];
      }),
    });
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  nodeMock.restoreAll();
});
after(async () => {
  process.env = env;
  await pool.end();
});
test("rejects invalid dates, unknown zones, too many participants and account injection", () => {
  const good = input();
  for (const bad of [
    { start: "2026-02-30T10:00:00" },
    { timeZone: "Fake/Zone" },
    { durationMinutes: 0 },
    { attendees: Array(20).fill("a@b.test") },
    { accountId: "other" },
    { allDay: true },
  ])
    assert.equal(eventInput.safeParse({ ...good, ...bad }).success, false);
});
test("updates preserve participant IDs and RSVP status, new participants need a reply", () => {
  const old = {
    participants: {
      existing: {
        calendarAddress: "mailto:bob@example.test",
        participationStatus: "accepted",
        roles: { attendee: true },
      },
    },
  };
  const e = makeEvent(input(), "alice@example.test", "Alice", old);
  assert.equal(e.participants.existing.participationStatus, "accepted");
  assert.equal(Object.keys(e.participants).length, 2);
  assert.equal(e.organizerCalendarAddress, "mailto:alice@example.test");
});
test("create is scoped to personal account and queues one branded invitation without server scheduling", async () => {
  const jobs: any[] = [];
  nodeMock.method(pool, "query", async (_sql: any, args: any) => {
    jobs.push(args);
    return { rows: [] };
  });
  mock((m, a) => {
    if (m === "Calendar/get")
      return { list: [{ id: "cal", myRights: { mayWriteOwn: true } }] };
    if (m === "CalendarEvent/get")
      return {
        list: [
          {
            id: "new",
            uid: "uid",
            title: "Review",
            utcStart: "2026-09-22T05:00:00Z",
            utcEnd: "2026-09-22T05:30:00Z",
            participants: {},
          },
        ],
      };
    assert.equal(m, "CalendarEvent/set");
    assert.equal(a.sendSchedulingMessages, false);
    assert.equal(a.create.event.timeZone, "Asia/Almaty");
    assert.equal(a.create.event.duration, "PT30M");
    return { created: { event: { id: "new" } }, newState: "s1" };
  });
  assert.equal((await saveCalendarEvent(ctx, input())).id, "new");
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0][2], "REQUEST");
  assert.deepEqual(jobs[0][3].to, ["bob@example.test"]);
  assert.ok(jobs[0][3].ics.includes("METHOD:REQUEST"));
});
test("cannot write unknown/read-only calendar", async () => {
  mock((m) => {
    assert.equal(m, "Calendar/get");
    return { list: [{ id: "other", myRights: { mayWriteAll: true } }] };
  });
  await assert.rejects(saveCalendarEvent(ctx, input()), {
    code: "CALENDAR_READONLY",
  });
});
test("cannot edit or delete another organizer event, even on writable calendar", async () => {
  mock((m) => {
    assert.equal(m, "CalendarEvent/get");
    return {
      list: [
        {
          id: "invite",
          isOrigin: false,
          organizerCalendarAddress: "mailto:bob@example.test",
        },
      ],
      state: "s1",
    };
  });
  await assert.rejects(saveCalendarEvent(ctx, input(), "invite", "s1"), {
    code: "CALENDAR_ORGANIZER",
  });
  await assert.rejects(deleteCalendarEvent(ctx, "invite", "s1"), {
    code: "CALENDAR_ORGANIZER",
  });
});
test("RSVP changes only the authenticated participant and preserves optimistic state", async () => {
  const jobs: any[] = [];
  nodeMock.method(pool, "query", async (_sql: any, args: any) => {
    jobs.push(args);
    return { rows: [] };
  });
  mock((m, a) => {
    if (m === "CalendarEvent/get")
      return {
        list: [
          {
            id: "invite",
            uid: "meeting",
            utcStart: "2026-09-22T05:00:00Z",
            utcEnd: "2026-09-22T05:30:00Z",
            isOrigin: false,
            organizerCalendarAddress: "mailto:bob@example.test",
            participants: {
              "a/b": { calendarAddress: "mailto:alice@example.test" },
              bob: { calendarAddress: "mailto:bob@example.test" },
            },
          },
        ],
        state: "s1",
      };
    assert.equal(a.ifInState, "s1");
    assert.equal(a.sendSchedulingMessages, false);
    assert.deepEqual(a.update, {
      invite: {
        "participants/a~1b/participationStatus": "accepted",
        "participants/a~1b/expectReply": false,
      },
    });
    return { updated: { invite: null } };
  });
  assert.deepEqual(await rsvpCalendarEvent(ctx, "invite", "accepted", "s1"), {
    ok: true,
  });
  assert.equal(jobs[0][2], "REPLY");
  assert.deepEqual(jobs[0][3].to, ["bob@example.test"]);
  assert.ok(jobs[0][3].ics.includes("PARTSTAT=ACCEPTED"));
  assert.ok(
    !jobs[0][3].ics.includes("ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:bob"),
  );
});
test("normalizes Stalwart synthetic IDs for non-recurring events but preserves recurring instances", async () => {
  mock((m, a) => {
    if (m === "Calendar/get") return { list: [] };
    if (m === "CalendarEvent/query")
      return { ids: ["synthetic1", "synthetic2"], total: 2 };
    if (a.ids.includes("synthetic1"))
      return {
        state: "s1",
        list: [
          { id: "synthetic1", baseEventId: "base1" },
          { id: "synthetic2", baseEventId: "base2" },
        ],
      };
    return {
      list: [
        {
          id: "base1",
          recurrenceRule: null,
          showWithoutTime: true,
          start: "2026-09-21T00:00:00",
        },
        { id: "base2", recurrenceRule: { frequency: "weekly" } },
      ],
    };
  });
  const r = await calendarEvents(
    ctx,
    "2026-09-01T00:00:00Z",
    "2026-10-01T00:00:00Z",
    "Asia/Almaty",
  );
  assert.equal(r.items[0].id, "base1");
  assert.equal(r.items[0].showWithoutTime, true);
  assert.equal(r.items[1].id, "synthetic2");
});
test("ICS escapes text and folds UTF-8 at 75 bytes without introducing properties", () => {
  const s = eventIcs({
    uid: "uid",
    title: "Встреча ".repeat(30) + "\r\nATTENDEE:evil",
    description: "a,b;c\\d",
    utcStart: "2026-09-21T05:00:00Z",
    utcEnd: "2026-09-21T06:00:00Z",
    organizerCalendarAddress: "mailto:bad\r\nBcc:evil@example.test",
  });
  assert.ok(s.includes("DTSTART:20260921T050000Z\r\n"));
  assert.ok(s.includes("DESCRIPTION:a\\,b\\;c\\\\d"));
  assert.ok(!s.includes("\r\nATTENDEE:"));
  assert.ok(!s.includes("\r\nORGANIZER:"));
  for (const line of s.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
});
test("all-day ICS uses exclusive end date and no accidental UTC timestamp", () => {
  const s = eventIcs({
    uid: "day",
    showWithoutTime: true,
    start: "2026-09-21T00:00:00",
    utcStart: "2026-09-21T00:00:00Z",
    utcEnd: "2026-09-22T00:00:00Z",
  });
  assert.ok(s.includes("DTSTART;VALUE=DATE:20260921"));
  assert.ok(s.includes("DTEND;VALUE=DATE:20260922"));
});

test("all-day export preserves the local date in positive-offset timezones", () => {
  const s = eventIcs({
    uid: "day",
    showWithoutTime: true,
    start: "2026-09-21T00:00:00",
    utcStart: "2026-09-20T19:00:00Z",
    utcEnd: "2026-09-21T19:00:00Z",
  });
  assert.ok(s.includes("DTEND;VALUE=DATE:20260922"));
});
