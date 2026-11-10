import type { CalendarEvent, UpdateCalendarEventPayload } from '../../../domain/entities/CalendarEvent'
import type { CalendarRepository } from '../../../domain/repositories/CalendarRepository'
import { validateCalendarEvent } from '../../../domain/entities/validateCalendarEvent'
import { normalizeCalendarEventPayload } from './CreateCalendarEventUseCase'

export class UpdateCalendarEventUseCase {
  private readonly calendarRepository: CalendarRepository

  constructor(calendarRepository: CalendarRepository) {
    this.calendarRepository = calendarRepository
  }

  async execute(eventId: string, payload: UpdateCalendarEventPayload): Promise<CalendarEvent> {
    const normalized = normalizeCalendarEventPayload(payload)
    validateCalendarEvent(normalized)
    return this.calendarRepository.updateEvent(eventId, normalized)
  }
}
