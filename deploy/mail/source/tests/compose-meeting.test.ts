import { test, after } from "node:test";
import assert from "node:assert/strict";
import { composeEvent, meetingSettings } from "../server/compose-meeting.js";
import { pool } from "../server/db.js";
const mail = {
  to: ["alice@example.test"],
  cc: ["ALICE@example.test", "bob@example.test"],
  bcc: [],
  subject: "Планирование",
  body: "Обсудим задачи недели",
  attachmentIds: [],
};
const meeting = {
  start: "2026-09-23T11:00:00",
  timeZone: "Asia/Almaty",
  durationMinutes: 45,
  location: "Переговорная",
};
after(() => pool.end());
test("compose maps subject/body and deduplicated To/Cc into the event", () => {
  const event = composeEvent(mail, meeting, "own-calendar");
  assert.equal(event.title, mail.subject);
  assert.equal(event.description, mail.body);
  assert.deepEqual(event.attendees, ["alice@example.test", "bob@example.test"]);
  assert.equal(event.calendarId, "own-calendar");
  assert.equal(event.start, meeting.start);
  assert.equal(event.location, meeting.location);
});
test("hidden recipients cannot become visible meeting participants", () => {
  assert.throws(
    () =>
      composeEvent({ ...mail, bcc: ["secret@example.test"] }, meeting, "own"),
    { code: "MEETING_BCC" },
  );
});
test("attachments are not silently discarded when sending a meeting", () => {
  assert.throws(
    () => composeEvent({ ...mail, attachmentIds: ["file"] }, meeting, "own"),
    { code: "MEETING_ATTACHMENTS" },
  );
});
test("a meeting requires recipients, title and a real date", () => {
  assert.throws(
    () => composeEvent({ ...mail, to: [], cc: [] }, meeting, "own"),
    { code: "NO_RECIPIENT" },
  );
  assert.throws(() => composeEvent({ ...mail, subject: "" }, meeting, "own"));
  assert.equal(
    meetingSettings.safeParse({ ...meeting, start: "2026-02-30T10:00:00" })
      .success,
    false,
  );
});
