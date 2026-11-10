import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import type { CalendarAttendee, CalendarAttendeeUser, CalendarEvent, CreateCalendarEventPayload } from '../../domain/entities/CalendarEvent'
import { authorizedFetch } from '../http/authorizedFetch'
import { normalizeBackendAssetUrl } from '../http/normalizeBackendAssetUrl'

interface EventAttendeeUserDto {
  id?: number
  email?: string
  first_name?: string
  last_name?: string
  full_name?: string
  avatar_url?: string | null
  availability_status?: string
  position?: string
  username?: string
}

interface EventAttendeeDto {
  user_id?: number
  status?: string
  comment?: string | null
  created_at?: string
  updated_at?: string | null
  event_id?: string
  user?: EventAttendeeUserDto | null
}

interface CalendarEventDto {
  id?: string
  user_id?: number | null
  user_name?: string
  title?: string
  description?: string | null
  start_time?: string
  end_time?: string
  location?: string | null
  is_all_day?: boolean
  is_online?: boolean
  color?: string | null
  attendees?: EventAttendeeDto[]
  is_organizer?: boolean
  reminder_minutes?: number | null
  recurrence_rule?: string | null
  recurrence_interval?: number | null
  recurrence_until?: string | null
  created_at?: string
  updated_at?: string
  meeting_provider?: 'livekit' | 'cisco' | 'none' | ''
  meeting_room_id?: string | null
  meeting_url?: string | null
  livekit_room_name?: string | null
  cisco_meeting_id?: string | null
  cisco_join_url?: string | null
  online_meeting_status?: 'created' | 'pending' | 'failed' | 'none' | ''
}

interface GroupEventsResponseDto {
  count?: number
  events?: CalendarEventDto[] | null
}

const toRfc3339NoMillis = (value: string): string => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export class HttpGroupCalendarRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async listUpcomingEvents(groupId: string, limit = 6): Promise<CalendarEvent[]> {
    const data = await this.requestJson<GroupEventsResponseDto>([
      `/api/v1/groups/${groupId}/events?limit=${limit}`,
    ])

    return (data.events ?? []).map((event) => this.mapEvent(event))
  }

  async createEvent(groupId: string, payload: CreateCalendarEventPayload, options?: { force?: boolean }): Promise<CalendarEvent> {
    const suffix = options?.force ? '?force=true' : ''
    const data = await this.requestJson<CalendarEventDto>([
      `/api/v1/groups/${groupId}/events${suffix}`,
    ], {
      method: 'POST',
      body: JSON.stringify(this.toEventRequestDto(payload)),
    })

    return this.mapEvent(data)
  }

  private async requestJson<T>(paths: string[], init?: RequestInit): Promise<T> {
    let lastError: unknown = null

    for (const path of paths) {
      try {
        const response = await authorizedFetch(this.sessionStore, path, {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
          },
          ...init,
        })

        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || `Request failed with status ${response.status}`)
        }

        return (await response.json()) as T
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to request group calendar API')
  }

  private mapAttendeeUser(user?: EventAttendeeUserDto | null): CalendarAttendeeUser | null {
    if (!user) return null

    return {
      id: Number(user.id ?? 0),
      email: user.email ?? '',
      firstName: user.first_name ?? '',
      lastName: user.last_name ?? '',
      fullName: user.full_name ?? '',
      avatarUrl: normalizeBackendAssetUrl(user.avatar_url ?? null) ?? '',
      availabilityStatus: user.availability_status ?? '',
      position: user.position ?? '',
      username: user.username ?? '',
    }
  }

  private mapAttendee(attendee: EventAttendeeDto): CalendarAttendee {
    return {
      userId: Number(attendee.user_id ?? 0),
      status: (attendee.status as CalendarAttendee['status']) ?? 'needs_action',
      comment: attendee.comment ?? '',
      createdAt: attendee.created_at ?? '',
      updatedAt: attendee.updated_at ?? '',
      eventId: attendee.event_id ?? '',
      user: this.mapAttendeeUser(attendee.user),
      attendance: null,
    }
  }

  private mapEvent(event: CalendarEventDto): CalendarEvent {
    const attendees = Array.isArray(event.attendees) ? event.attendees.map((item) => this.mapAttendee(item)) : []

    return {
      id: event.id ?? '',
      calendarId: '',
      title: event.title ?? '',
      description: event.description ?? '',
      startTime: event.start_time ?? '',
      endTime: event.end_time ?? '',
      location: event.location ?? '',
      isAllDay: Boolean(event.is_all_day),
      isOnline: Boolean(event.is_online),
      color: event.color ?? '#2F4BE2',
      attendeesCount: attendees.length,
      attendees,
      isOrganizer: Boolean(event.is_organizer),
      reminderMinutes: event.reminder_minutes ?? null,
      recurrenceRule: event.recurrence_rule ?? '',
      recurrenceInterval: event.recurrence_interval ?? null,
      recurrenceUntil: event.recurrence_until ?? '',
      createdAt: event.created_at ?? '',
      updatedAt: event.updated_at ?? '',
      userId: event.user_id ?? null,
      userName: event.user_name ?? '',
      meetingProvider: event.meeting_provider ?? '',
      meetingRoomId: event.meeting_room_id ?? undefined,
      meetingUrl: event.meeting_url ?? undefined,
      liveKitRoomName: event.livekit_room_name ?? undefined,
      ciscoMeetingId: event.cisco_meeting_id ?? undefined,
      ciscoJoinUrl: event.cisco_join_url ?? undefined,
      onlineMeetingStatus: event.online_meeting_status ?? '',
    }
  }

  private toEventRequestDto(payload: CreateCalendarEventPayload): Record<string, unknown> {
    return {
      title: payload.title,
      description: payload.description?.trim() || null,
      start_time: toRfc3339NoMillis(payload.startTime),
      end_time: toRfc3339NoMillis(payload.endTime),
      attendee_ids: payload.attendeeIds ?? [],
      is_all_day: Boolean(payload.isAllDay),
      is_online: Boolean(payload.isOnline),
      location: payload.location?.trim() || null,
      color: payload.color || null,
      recurrence_rule: payload.recurrenceRule || null,
      recurrence_interval: payload.recurrenceInterval ?? null,
      recurrence_until: payload.recurrenceUntil ? toRfc3339NoMillis(payload.recurrenceUntil) : null,
      reminder_minutes: payload.reminderMinutes ?? null,
    }
  }
}

