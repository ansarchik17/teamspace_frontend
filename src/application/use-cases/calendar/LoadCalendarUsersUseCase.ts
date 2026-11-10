import type { CalendarSelectableUser } from '../../../domain/entities/CalendarEvent'
import type { CalendarRepository } from '../../../domain/repositories/CalendarRepository'

export class LoadCalendarUsersUseCase {
  private readonly calendarRepository: CalendarRepository

  constructor(calendarRepository: CalendarRepository) {
    this.calendarRepository = calendarRepository
  }

  async execute(query?: string, limit?: number, offset?: number): Promise<CalendarSelectableUser[]> {
    return this.calendarRepository.listUsers(query, limit, offset)
  }
}
