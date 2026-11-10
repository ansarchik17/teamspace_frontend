const LOCAL_AUTH_KEYS = ['superapp.auth.tokens', 'access_token', 'refresh_token', 'recentRealms', 'pageSize'] as const
const SESSION_AUTH_KEYS = ['rag_api_token', 'rag_token_auto'] as const
const LOCAL_AUTH_KEY_PREFIXES = ['kc-callback-'] as const
const GROWY_AUTH_KEYS = ['aigent_access_token', 'aigent_refresh_token', 'aigent_user_role', 'aigent_tenant_slug', 'aigent_auth_provider', 'aigent_must_change_password', 'aigent_auth_notice'] as const

const safeRemove = (storage: Storage | undefined, key: string): void => {
  try {
    storage?.removeItem(key)
  } catch {
    // Storage may be unavailable in private or embedded contexts.
  }
}

export function clearGrowyAuthStorage(): void {
  if (typeof window === 'undefined') return
  for (const key of GROWY_AUTH_KEYS) safeRemove(window.localStorage, key)
  safeRemove(window.sessionStorage, 'growy_workspace_silent_sso_redirect')
}

function workspaceIdentity(token: string): string | null {
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
    const subject = claims.sub ?? claims.user_id ?? claims.id
    if (typeof subject !== 'string' && typeof subject !== 'number') return null
    return JSON.stringify([claims.iss ?? '', String(subject), claims.organization_id ?? claims.organizationId ?? claims.company_id ?? claims.tenant_id ?? ''])
  } catch {
    return null
  }
}

export function workspaceIdentityChanged(previous: string | undefined, next: string): boolean {
  if (!previous) return true
  if (previous === next) return false
  const before = workspaceIdentity(previous)
  const after = workspaceIdentity(next)
  // An unreadable token cannot establish continuity of the linked identity.
  return before === null || after === null || before !== after
}

export function safeClearAuthStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  for (const key of LOCAL_AUTH_KEYS) {
    safeRemove(window.localStorage, key)
  }
  clearGrowyAuthStorage()
  for (const key of SESSION_AUTH_KEYS) {
    safeRemove(window.sessionStorage, key)
  }

  try {
    const raw = window.sessionStorage.getItem('rag_auth_payload')
    if (!raw) {
      return
    }

    const payload = JSON.parse(raw) as Record<string, unknown>
    delete payload.access_token
    delete payload.accessToken
    delete payload.refresh_token
    delete payload.refreshToken
    delete payload.token
    window.sessionStorage.setItem('rag_auth_payload', JSON.stringify(payload))
  } catch {
    safeRemove(window.sessionStorage, 'rag_auth_payload')
  }
}

export function pruneLegacyCallbackStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    for (const key of Object.keys(window.localStorage)) {
      if (LOCAL_AUTH_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        safeRemove(window.localStorage, key)
      }
    }
  } catch {
    // Ignore storage enumeration errors.
  }
}
