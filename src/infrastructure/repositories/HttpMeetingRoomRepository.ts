import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { i18n } from '../../shared/i18n/i18n'

export const EMPTY_ROOM_ID = '00000000-0000-0000-0000-000000000000'

export interface MeetingSite {
  id: string
  name: string
  address: string
  city: string
  timezone: string
  workingHours: string
  isActive: boolean
}

export interface MeetingRoom {
  id: string
  siteId: string
  siteName: string
  address: string
  name: string
  description: string
  capacity: number
  floor: number | null
  location: string
  color: string
  equipment: string[]
  photoUrl: string
  isActive: boolean
}

export interface MeetingRoomAvailability {
  room: MeetingRoom
  isAvailable: boolean | null
  busySlots: Array<{ startTime: string; endTime: string }>
}

export interface MeetingSitePayload {
  name: string
  address?: string
  city?: string
  timezone?: string
  working_hours?: string
  is_active?: boolean
}

export interface MeetingRoomPayload {
  site_id: string
  name: string
  floor?: number | null
  location?: string
  capacity?: number
  equipment?: string[]
  description?: string
  color?: string
  is_active?: boolean
}

export class MeetingRoomApiError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value))

const toSite = (raw: Record<string, unknown>): MeetingSite => ({
  id: text(raw.id),
  name: text(raw.name),
  address: text(raw.address),
  city: text(raw.city),
  timezone: text(raw.timezone),
  workingHours: text(raw.working_hours),
  isActive: raw.is_active !== false,
})

const toRoom = (raw: Record<string, unknown>): MeetingRoom => {
  const site = isRecord(raw.site) ? raw.site : null
  return {
    id: text(raw.id),
    siteId: text(raw.site_id ?? site?.id),
    siteName: text(raw.site_name ?? site?.name),
    address: text(raw.address ?? site?.address),
    name: text(raw.name) || 'Переговорная',
    description: text(raw.description),
    capacity: Number(raw.capacity) || 0,
    floor: typeof raw.floor === 'number' ? raw.floor : null,
    location: text(raw.location),
    color: text(raw.color),
    equipment: Array.isArray(raw.equipment) ? raw.equipment.map(String) : [],
    photoUrl: text(raw.photo_url),
    isActive: raw.is_active !== false,
  }
}

const toList = (data: unknown, keys: string[]): unknown[] => {
  if (Array.isArray(data)) return data
  if (!isRecord(data)) return []
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key] as unknown[]
  }
  return []
}

const readError = async (response: Response, fallback: string): Promise<MeetingRoomApiError> => {
  let message = fallback
  let code = ''
  try {
    const data = await response.json() as unknown
    if (isRecord(data)) {
      const nested = isRecord(data.error) ? data.error : null
      const candidate = nested ? nested.user_message ?? nested.message : data.user_message ?? data.message ?? data.error
      if (typeof candidate === 'string' && candidate.trim()) message = candidate
      const rawCode = nested ? nested.code : data.code
      if (typeof rawCode === 'string') code = rawCode
    }
  } catch {
    message = fallback
  }
  return new MeetingRoomApiError(message, response.status, code)
}

export class HttpMeetingRoomRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  private async send<T>(path: string, init: RequestInit, fallback: string, parse: (data: unknown) => T): Promise<T> {
    const response = await authorizedFetch(this.sessionStore, path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
    })
    if (!response.ok) throw await readError(response, fallback)
    if (response.status === 204) return parse(null)
    const raw = await response.text()
    return parse(raw ? JSON.parse(raw) as unknown : null)
  }

  async listSites(): Promise<MeetingSite[]> {
    return this.send('/api/v1/calendar/sites', {}, i18n.t('calendar:rooms.loadError'), (data) =>
      toList(data, ['sites', 'items', 'data']).filter(isRecord).map(toSite).filter((site) => site.id))
  }

  async createSite(payload: MeetingSitePayload): Promise<MeetingSite> {
    return this.send('/api/v1/calendar/sites', { method: 'POST', body: JSON.stringify(payload) }, i18n.t('calendar:rooms.errors.generic'), (data) => toSite(isRecord(data) ? data : {}))
  }

  async updateSite(siteId: string, payload: Partial<MeetingSitePayload>): Promise<MeetingSite> {
    return this.send(`/api/v1/calendar/sites/${encodeURIComponent(siteId)}`, { method: 'PATCH', body: JSON.stringify(payload) }, i18n.t('calendar:rooms.errors.generic'), (data) => toSite(isRecord(data) ? data : {}))
  }

  async deleteSite(siteId: string): Promise<void> {
    await this.send(`/api/v1/calendar/sites/${encodeURIComponent(siteId)}`, { method: 'DELETE' }, i18n.t('calendar:rooms.errors.generic'), () => undefined)
  }

  async listRooms(options: { includeInactive?: boolean; siteId?: string } = {}): Promise<MeetingRoom[]> {
    const query = new URLSearchParams()
    if (options.includeInactive) query.set('include_inactive', 'true')
    else query.set('only_active', 'true')
    if (options.siteId) query.set('site_id', options.siteId)
    return this.send(`/api/v1/calendar/rooms?${query}`, {}, i18n.t('calendar:rooms.loadError'), (data) =>
      toList(data, ['rooms', 'items', 'data']).filter(isRecord).map(toRoom).filter((room) => room.id))
  }

  async createRoom(payload: MeetingRoomPayload): Promise<MeetingRoom> {
    return this.send('/api/v1/calendar/rooms', { method: 'POST', body: JSON.stringify(payload) }, i18n.t('calendar:rooms.errors.generic'), (data) => toRoom(isRecord(data) ? data : {}))
  }

  async updateRoom(roomId: string, payload: Partial<MeetingRoomPayload>): Promise<MeetingRoom> {
    return this.send(`/api/v1/calendar/rooms/${encodeURIComponent(roomId)}`, { method: 'PATCH', body: JSON.stringify(payload) }, i18n.t('calendar:rooms.errors.generic'), (data) => toRoom(isRecord(data) ? data : {}))
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.send(`/api/v1/calendar/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' }, i18n.t('calendar:rooms.errors.generic'), () => undefined)
  }

  async listAvailability(fromIso: string, toIso: string): Promise<MeetingRoomAvailability[]> {
    const query = new URLSearchParams({ from: fromIso, to: toIso })
    return this.send(`/api/v1/calendar/rooms/availability?${query}`, {}, 'Не удалось проверить занятость переговорных', (data) =>
      toList(data, ['rooms', 'items', 'availability', 'data']).filter(isRecord).map((item) => {
        const roomRaw = isRecord(item.room) ? item.room : item
        const bookings = Array.isArray(item.bookings) ? item.bookings.filter(isRecord) : []
        const explicit = typeof item.is_available === 'boolean' ? item.is_available : null
        return {
          room: toRoom(roomRaw),
          isAvailable: explicit ?? (Array.isArray(item.bookings) ? bookings.length === 0 : null),
          busySlots: bookings.map((booking) => ({ startTime: text(booking.start_time ?? booking.starts_at), endTime: text(booking.end_time ?? booking.ends_at) })),
        }
      }).filter((item) => item.room.id))
  }
}
