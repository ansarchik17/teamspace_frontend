import type { CalendarRepository } from '../../../domain/repositories/CalendarRepository'
import { CALENDAR_RESPOND_STATUSES, type CalendarAttendance, type CalendarRespondStatus } from '../../../domain/entities/CalendarEvent'

export class RespondCalendarInviteUseCase {
  private readonly calendarRepository: CalendarRepository

  constructor(calendarRepository: CalendarRepository) {
    this.calendarRepository = calendarRepository
  }

  async execute(eventId: string, status: CalendarRespondStatus, comment?: string, attendance?: CalendarAttendance | null): Promise<void> {
    if (!eventId) throw new Error('Не удалось определить событие для ответа на приглашение.')
    if (!CALENDAR_RESPOND_STATUSES.includes(status)) {
      throw new Error('Неизвестный ответ на приглашение.')
    }
    return this.calendarRepository.respondToEvent(eventId, status, comment?.trim() ?? '', attendance)
  }
}
