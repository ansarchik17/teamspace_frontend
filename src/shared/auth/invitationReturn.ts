const KEY = 'teamspace.pendingInvitation'

export function invitationTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? ''
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}

// Keep the invitation secret on this origin while SSO redirects through URLs.
// Only /join is sent as the login return path; the token never enters its query string.
export function rememberedInvitation(): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as { token?: unknown; expires?: unknown }
    if (typeof value.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.token) && typeof value.expires === 'number' && value.expires > Date.now()) return value.token
    window.sessionStorage.removeItem(KEY)
  } catch { /* Storage is optional; the original email link remains usable. */ }
  return null
}

export function rememberInvitation(token: string): boolean {
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ token, expires: Date.now() + 60 * 60 * 1000 })); return true } catch { return false }
}
export function forgetInvitation(): void { try { window.sessionStorage.removeItem(KEY) } catch { /* optional storage */ } }
