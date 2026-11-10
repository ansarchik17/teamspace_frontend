import type {
  CalendarAvailabilityRequest,
  CalendarAvailabilityResponse,
  BatchCreateCalendarEventsPayload,
  CalendarBatchCreateResult,
  CalendarEvent,
  CalendarAttendance,
  CalendarRespondStatus,
  CalendarSearchParams,
  CalendarSelectableUser,
  CalendarSuggestedSlot,
  CalendarSuggestTimesRequest,
  CalendarTodaySummary,
  CreateCalendarEventPayload,
  UpdateCalendarEventPayload,
  UserCalendar,
  CreateUserCalendarPayload,
} from '../entities/CalendarEvent'
import type { CalendarHostUser } from '../entities/CalendarHostUser'

export interface CalendarRepository {
  listCalendars(): Promise<UserCalendar[]>
  createCalendar(payload: CreateUserCalendarPayload): Promise<UserCalendar>
  getMyEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]>
  getUserEvents(userId: number, fromIso: string, toIso: string): Promise<CalendarEvent[]>
  getUserEvent(userId: number, eventId: string): Promise<CalendarEvent>
  getEvent(eventId: string): Promise<CalendarEvent>
  createEvent(payload: CreateCalendarEventPayload, options?: { force?: boolean }): Promise<CalendarEvent>
  updateEvent(eventId: string, payload: UpdateCalendarEventPayload): Promise<CalendarEvent>
  checkAvailability(payload: CalendarAvailabilityRequest): Promise<CalendarAvailabilityResponse>
  suggestTimes(payload: CalendarSuggestTimesRequest): Promise<CalendarSuggestedSlot[]>
  deleteEvent(eventId: string): Promise<void>
  searchEvents(params: CalendarSearchParams): Promise<CalendarEvent[]>
  getThisWeekEvents(timezoneOffsetMinutes?: number): Promise<CalendarEvent[]>
  getUpcomingEvents(limit?: number): Promise<CalendarEvent[]>
  setEventReminder(eventId: string, minutesBefore: number): Promise<void>
  deleteEventReminder(eventId: string): Promise<void>
  respondToEvent(eventId: string, status: CalendarRespondStatus, comment?: string, attendance?: CalendarAttendance | null): Promise<void>
  batchCreateEvents(payload: BatchCreateCalendarEventsPayload): Promise<CalendarBatchCreateResult>
  getTodaySummary(timezoneOffsetMinutes?: number): Promise<CalendarTodaySummary>
  listUsers(query?: string, limit?: number, offset?: number): Promise<CalendarSelectableUser[]>
  getCurrentHostUser(): Promise<CalendarHostUser>
}
