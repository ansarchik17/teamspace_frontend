import type {
  CalendarAvailabilityRequest,
  CalendarAvailabilityResponse,
  CalendarEvent,
  CalendarSuggestedSlot,
  CalendarSuggestTimesRequest,
  CreateCalendarEventPayload,
} from '../../../domain/entities/CalendarEvent'
import type { CalendarRepository } from '../../../domain/repositories/CalendarRepository'
import {
  validateCalendarAvailability,
  validateCalendarEvent,
} from '../../../domain/entities/validateCalendarEvent'

export const normalizeCalendarEventPayload = <T extends CreateCalendarEventPayload>(payload: T): T => ({
  ...payload,
  title: payload.title.trim(),
  description: payload.description?.trim() ?? '',
  location: payload.location?.trim() ?? '',
  attendeeIds: [...new Set(payload.attendeeIds ?? [])],
})

export class CreateCalendarEventUseCase {
  private readonly calendarRepository: CalendarRepository

  constructor(calendarRepository: CalendarRepository) {
    this.calendarRepository = calendarRepository
  }

  async execute(payload: CreateCalendarEventPayload, options?: { force?: boolean }): Promise<CalendarEvent> {
    const normalized = normalizeCalendarEventPayload(payload)
    validateCalendarEvent(normalized)
    return this.calendarRepository.createEvent(normalized, options)
  }

  async checkAvailability(payload: CalendarAvailabilityRequest): Promise<CalendarAvailabilityResponse> {
    validateCalendarAvailability(payload)
    return this.calendarRepository.checkAvailability({
      ...payload,
      attendeeIds: [...new Set(payload.attendeeIds ?? [])],
    })
  }

  async suggestTimes(payload: CalendarSuggestTimesRequest): Promise<CalendarSuggestedSlot[]> {
    return this.calendarRepository.suggestTimes(payload)
  }
}
