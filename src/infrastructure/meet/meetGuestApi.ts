import { parseHttpError } from '../http/HttpError'
import type { MeetSession } from './meetApi'

export interface MeetGuestState {
  guest: { name: string; status: 'pending' | 'admitted' | 'denied' } | null
}

// Guest errors must not trigger Workspace refresh, SSO or a global logout.
async function request<T>(
  meetingId: string,
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    `/api/v1/meet-guest/${encodeURIComponent(meetingId)}${path}`,
    {
      method,
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  )
  if (!response.ok) throw await parseHttpError(response)
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>)
}

export const meetGuestApi = {
  session: (id: string, signal?: AbortSignal) =>
    request<MeetGuestState>(id, '/session', 'GET', undefined, signal),
  requestJoin: (id: string, name: string, signal?: AbortSignal) =>
    request<MeetGuestState>(id, '/session', 'POST', { name }, signal),
  status: (id: string, signal?: AbortSignal) =>
    request<MeetGuestState>(id, '/join-requests/me', 'GET', undefined, signal),
  join: (id: string, signal?: AbortSignal) =>
    request<MeetSession>(id, '/join', 'POST', {}, signal),
  leave: (id: string) => request<void>(id, '/session', 'DELETE'),
}
