import { authorizedFetch } from '../http/authorizedFetch'
import { LocalStorageAuthSessionStore } from '../storage/LocalStorageAuthSessionStore'

export interface MeetUser {
  id: string
  email: string
  name: string
}
export interface MeetSession {
  meeting_id: string
  room_name: string
  livekit_url: string
  participant_identity: string
  participant_name: string
  participant_token: string
  role: string
}
/** One recognised phrase of one participant (QMeet `ChunkView`). */
export interface MeetTranscriptChunk {
  track_sid: string
  track_sequence: number
  participant_identity: string
  participant_name: string
  speaker_label?: string | null
  /** Milliseconds from the meeting start. */
  start_ms: number
  end_ms: number
  transcript: string
  language?: string | null
  confidence?: number | null
  /** Milliseconds from the recording start; null when the meeting was not recorded. */
  playback_ms?: number | null
}
export interface MeetMeeting {
  id: string
  title: string | null
  status: string
  started_at: string
  completed_at: string | null
  agenda: string | null
  transcript: string
  chunks?: MeetTranscriptChunk[]
  transcript_restricted?: boolean
  /** Short-lived presigned link to the meeting recording. */
  recording_url?: string | null
  recording_status?: string | null
}
export interface MeetRecord {
  meeting: MeetMeeting
  role: string
}
export interface MeetEvent {
  id: string
  title: string
  start_at: string
  end_at: string
  meeting_id: string | null
  is_owner: boolean
  my_status?: string
  agenda: string | null
  attendees: { email: string; name: string | null; status: string }[]
}
export interface MeetWaitingRequest {
  id: string
  status: string
  user: MeetUser
}

const store = new LocalStorageAuthSessionStore()
const request = async <T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> => {
  const response = await authorizedFetch(store, `/api/v1/meet${path}`, {
    method,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return response.json() as Promise<T>
}
const id = encodeURIComponent
export const meetApi = {
  me: (signal?: AbortSignal) =>
    request<MeetUser>('/auth/me', 'GET', undefined, signal),
  link: (email: string, password: string) =>
    request<MeetUser>('/auth/workspace/link', 'POST', { email, password }),
  records: () => request<MeetRecord[]>('/records'),
  calendar: () => request<MeetEvent[]>('/calendar'),
  create: (title: string) =>
    request<MeetSession>('/calls', 'POST', { title, languages: [] }),
  schedule: (title: string, start: string, end: string, attendees: string[]) =>
    request<MeetEvent>('/calendar', 'POST', {
      title,
      start_at: start,
      end_at: end,
      attendees,
    }),
  startEvent: (eventId: string) =>
    request<MeetSession>(`/calendar/${id(eventId)}/start`, 'POST', {}),
  meeting: (meetingId: string, signal?: AbortSignal) =>
    request<MeetMeeting>(`/calls/${id(meetingId)}`, 'GET', undefined, signal),
  join: (meetingId: string) =>
    request<MeetSession>(`/calls/${id(meetingId)}/join`, 'POST', {}),
  requestJoin: (meetingId: string) =>
    request<MeetWaitingRequest>(
      `/calls/${id(meetingId)}/join-requests`,
      'POST',
      {},
    ),
  joinStatus: (meetingId: string) =>
    request<MeetWaitingRequest>(`/calls/${id(meetingId)}/join-requests/me`),
  waiting: (meetingId: string) =>
    request<MeetWaitingRequest[]>(`/calls/${id(meetingId)}/waiting-room`),
  decide: (meetingId: string, requestId: string, decision: 'admit' | 'deny') =>
    request<MeetWaitingRequest>(
      `/calls/${id(meetingId)}/waiting-room/${id(requestId)}/${decision}`,
      'POST',
      {},
    ),
}
