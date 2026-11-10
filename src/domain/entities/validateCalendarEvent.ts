import type { CreateCalendarEventPayload } from './CalendarEvent';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const RECURRENCE_PERIOD_MS: Record<string, number> = {
  DAILY: DAY_MS,
  WEEKLY: 7 * DAY_MS,
  MONTHLY: 28 * DAY_MS,
};

export const CALENDAR_EVENT_TITLE_MAX_LENGTH = 255;

export function validateCalendarAvailability(
  payload: Pick<CreateCalendarEventPayload, 'startTime' | 'endTime' | 'attendeeIds'>,
): void {
  const start = Date.parse(payload.startTime);
  const end = Date.parse(payload.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error('Укажите корректные дату и время начала и завершения.');
  }
  if (end <= start) {
    throw new Error('Дата завершения должна быть позже даты начала.');
  }
  if (end - start < MINUTE_MS) {
    throw new Error('Событие должно длиться не меньше минуты.');
  }
  if (payload.attendeeIds?.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Выберите корректных участников события.');
  }
}

export function validateCalendarEvent(payload: CreateCalendarEventPayload): void {
  const title = payload.title.trim();
  if (!title) throw new Error('Укажите название события.');
  if (title.length > CALENDAR_EVENT_TITLE_MAX_LENGTH) {
    throw new Error(
      `Название события не должно быть длиннее ${CALENDAR_EVENT_TITLE_MAX_LENGTH} символов.`,
    );
  }

  validateCalendarAvailability(payload);

  if (
    payload.reminderMinutes != null &&
    (!Number.isSafeInteger(payload.reminderMinutes) || payload.reminderMinutes < 0)
  ) {
    throw new Error('Укажите целое неотрицательное время уведомления в минутах.');
  }

  const rule = payload.recurrenceRule?.trim().toUpperCase();
  if (!rule) return;

  const interval = payload.recurrenceInterval ?? 1;
  if (!Number.isSafeInteger(interval) || interval < 1) {
    throw new Error('Интервал повторения должен быть целым числом не меньше 1.');
  }

  const start = Date.parse(payload.startTime);
  const end = Date.parse(payload.endTime);
  const period = RECURRENCE_PERIOD_MS[rule];
  if (period && end - start > period * interval) {
    throw new Error('Повторяющееся событие не может длиться дольше периода повторения.');
  }

  const until = payload.recurrenceUntil?.trim();
  if (until) {
    const untilMs = Date.parse(until);
    if (!Number.isFinite(untilMs)) {
      throw new Error('Укажите корректную дату окончания повторений.');
    }
    if (untilMs < start) {
      throw new Error('Окончание повторений не может быть раньше начала события.');
    }
  }
}
