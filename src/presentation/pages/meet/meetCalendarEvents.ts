import { HttpCalendarRepository } from '../../../infrastructure/repositories/HttpCalendarRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { toCalendarEventViewModel } from '../../view-models/CalendarViewModel'
import type { MeetEvent } from '../../../infrastructure/meet/meetApi'
import { parseMeetId } from './meetUtils'

export interface MeetCalendarEvent {
  id: string
  title: string
  start: string
  end: string
  joinUrl: string
  roomName: string
  meetingId: string | null
  isOrganizer: boolean
  attendees: { email: string; name: string | null }[]
}

const LOOKBEHIND_MS = 12 * 60 * 60 * 1000
const LOOKAHEAD_MS = 60 * 24 * 60 * 60 * 1000
const toIso = (time: number) => new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z')

const repository = new HttpCalendarRepository(new LocalStorageAuthSessionStore())

export async function loadCalendarMeetEvents(now: number): Promise<MeetCalendarEvent[]> {
  const [host, events] = await Promise.all([
    repository.getCurrentHostUser(),
    repository.getMyEvents(toIso(now - LOOKBEHIND_MS), toIso(now + LOOKAHEAD_MS)),
  ])
  const viewerId = Number(host.id)
  return events
    .map((event) => toCalendarEventViewModel(event, viewerId))
    .filter((event) => {
      if (!event.isOnline || !event.joinUrl || event.onlineMeetingStatus === 'failed' || event.isDeclined) return false
      const end = Date.parse(event.endTime)
      if (!Number.isFinite(end) || end < now) return false
      return event.isOrganizer || event.organizerUserId === viewerId || event.attendeeIds.includes(viewerId)
    })
    .map((event) => ({
      id: event.id,
      title: event.title,
      start: event.startTime,
      end: event.endTime,
      joinUrl: event.joinUrl,
      roomName: event.meetingProvider === 'livekit' ? event.liveKitRoomName : '',
      meetingId: parseMeetId(event.joinUrl),
      isOrganizer: event.isOrganizer || event.organizerUserId === viewerId,
      attendees: event.attendees.map((person) => ({ email: person.email || `user-${person.id}`, name: person.fullName || null })),
    }))
}

export function withoutMeetDuplicates(calendarEvents: MeetCalendarEvent[], meetEvents: MeetEvent[]): MeetCalendarEvent[] {
  const meetingIds = new Set(meetEvents.map((event) => event.meeting_id).filter(Boolean))
  const slots = new Set(meetEvents.map((event) => `${event.title.trim()}|${Date.parse(event.start_at)}`))
  return calendarEvents.filter((event) => !(event.meetingId && meetingIds.has(event.meetingId)) && !slots.has(`${event.title.trim()}|${Date.parse(event.start)}`))
}
