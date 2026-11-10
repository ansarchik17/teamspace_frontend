import type { ChatFolder } from '../../../domain/entities/Chat'
import type { AuthTokens } from '../../../domain/entities/AuthTokens'
import type { ChatListItem, CryptoState, CurrentUserState } from './types'
import { AUTH_SESSION_CLEARED_EVENT, AUTH_SESSION_EXPIRED_EVENT } from '../../../shared/auth/authSessionEvents'

export interface MessengerListSnapshot {
  currentUser: CurrentUserState
  cryptoState: CryptoState
  chats: ChatListItem[]
  folders: ChatFolder[]
}

const MAX_AGE_MS = 5 * 60_000
let snapshot: { scope: string; savedAt: number; data: MessengerListSnapshot } | null = null

// Memory only: never persist plaintext previews or key material to browser storage.
// A different token/device, expired token, logout or expired snapshot cannot reuse it.
export function messengerSnapshotScope(tokens: AuthTokens | null, deviceId: string | null): string | null {
  if (!tokens?.accessToken || !deviceId || Date.parse(tokens.expiresAt) <= Date.now() ||
    !Number.isFinite(Date.parse(tokens.expiresAt))) return null
  return JSON.stringify([tokens.accessToken, deviceId])
}

export function readMessengerListSnapshot(scope: string | null): MessengerListSnapshot | null {
  if (!snapshot || !scope || snapshot.scope !== scope || Date.now() - snapshot.savedAt > MAX_AGE_MS) {
    snapshot = null
    return null
  }
  return snapshot.data
}

export function writeMessengerListSnapshot(scope: string | null, data: MessengerListSnapshot): void {
  if (!scope) {
    snapshot = null
    return
  }
  snapshot = { scope, savedAt: Date.now(), data }
}

export function clearMessengerListSnapshot(): void {
  snapshot = null
}

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clearMessengerListSnapshot)
  window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, clearMessengerListSnapshot)
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'superapp.auth.tokens') clearMessengerListSnapshot()
  })
}
