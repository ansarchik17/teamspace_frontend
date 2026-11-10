import type {
  CalendarBusySlot,
  CalendarConflictItem,
  CalendarEvent,
  CalendarFreeBusyRequest,
  CalendarUserBusy,
} from '../../../domain/entities/CalendarEvent'
import type { CalendarRepository } from '../../../domain/repositories/CalendarRepository'

const sortSlots = (slots: CalendarBusySlot[]): CalendarBusySlot[] =>
  [...slots].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))

const uniqueSlots = (slots: CalendarBusySlot[]): CalendarBusySlot[] => {
  const seen = new Set<string>()
  return slots.filter((slot) => {
    const key = `${slot.eventId}:${slot.startTime}:${slot.endTime}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const isValidSlot = (slot: CalendarBusySlot): boolean => {
  const start = Date.parse(slot.startTime)
  const end = Date.parse(slot.endTime)
  return Number.isFinite(start) && Number.isFinite(end) && end > start
}

const conflictToSlot = (conflict: CalendarConflictItem): CalendarBusySlot => ({
  eventId: conflict.eventId,
  title: conflict.eventTitle || 'Занят',
  startTime: conflict.startTime,
  endTime: conflict.endTime,
})

const eventToSlot = (event: CalendarEvent): CalendarBusySlot => ({
  eventId: event.id,
  title: event.title || 'Занят',
  startTime: event.startTime,
  endTime: event.endTime,
})

const hasDeclined = (event: CalendarEvent, userId: number): boolean =>
  event.attendees.some(
    (attendee) =>
      Number(attendee.userId || attendee.user?.id || 0) === userId && attendee.status === 'declined',
  )

export class LoadCalendarFreeBusyUseCase {
  private readonly calendarRepository: CalendarRepository

  constructor(calendarRepository: CalendarRepository) {
    this.calendarRepository = calendarRepository
  }

  async execute(request: CalendarFreeBusyRequest): Promise<CalendarUserBusy[]> {
    const userIds = [...new Set(request.attendeeIds)].filter((id) => Number.isSafeInteger(id) && id > 0)
    if (!userIds.length) return []
    if (!Number.isFinite(Date.parse(request.fromIso)) || !Number.isFinite(Date.parse(request.toIso))) return []

    const excludeEventId = request.excludeEventId || ''

    try {
      const availability = await this.calendarRepository.checkAvailability({
        startTime: request.fromIso,
        endTime: request.toIso,
        attendeeIds: userIds,
        excludeEventId: excludeEventId || null,
        timezone: request.timezone,
      })

      const conflicts = availability.conflictsByUser.length
        ? availability.conflictsByUser.flatMap((group) =>
            group.conflicts.map((conflict) => ({ ...conflict, userId: conflict.userId || group.userId })),
          )
        : availability.conflicts

      return userIds.map((userId) => ({
        userId,
        unavailable: false,
        slots: sortSlots(
          uniqueSlots(
            conflicts
              .filter((conflict) => conflict.userId === userId && conflict.eventId !== excludeEventId)
              .map(conflictToSlot)
              .filter(isValidSlot),
          ),
        ),
      }))
    } catch {
      const results = await Promise.allSettled(
        userIds.map((userId) => this.calendarRepository.getUserEvents(userId, request.fromIso, request.toIso)),
      )

      return userIds.map((userId, index) => {
        const result = results[index]
        if (result.status === 'rejected') {
          return { userId, unavailable: true, slots: [] }
        }
        return {
          userId,
          unavailable: false,
          slots: sortSlots(
            uniqueSlots(
              result.value
                .filter((event) => event.id !== excludeEventId && !event.isAllDay && !hasDeclined(event, userId))
                .map(eventToSlot)
                .filter(isValidSlot),
            ),
          ),
        }
      })
    }
  }
}
