import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'

const tenantBaseDomain = (import.meta.env.VITE_TENANT_BASE_DOMAIN || 'teamspace.kz').trim().toLowerCase()
const tenantWorkspaceEnabled = import.meta.env.VITE_TENANT_WORKSPACE_ENABLED === 'true'

function tenantWorkspaceSlug(): string | null {
  if (!tenantWorkspaceEnabled) return null
  const suffix = `.${tenantBaseDomain}`
  const hostname = window.location.hostname.toLowerCase()
  if (!hostname.endsWith(suffix)) return null
  const slug = hostname.slice(0, -suffix.length)
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ? slug : null
}

export function isTenantWorkspaceHost(): boolean {
  return tenantWorkspaceSlug() !== null
}

export function platformLoginUrl(): string {
  const url = new URL(`https://${tenantBaseDomain}/web/login`)
  const slug = tenantWorkspaceSlug()
  if (slug) url.searchParams.set('organization', slug)
  return url.toString()
}

interface TenantHandoffResponse {
  code: string
  slug: string
}

// The root API stores the session behind a single-use, short-lived code. Only
// that code crosses to the tenant host; access and refresh tokens stay on the
// root origin and never appear in a URL or cross-origin form.
export async function handoffToTenantWorkspace(sessionStore: AuthSessionStore): Promise<boolean> {
  if (!tenantWorkspaceEnabled || window.location.hostname !== tenantBaseDomain) return false

  const accessToken = sessionStore.getTokens()?.accessToken
  if (!accessToken) return false

  const response = await fetch('/api/v1/auth/tenant-handoff', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    credentials: 'include',
  })
  if (!response.ok) return false

  const { code, slug } = await response.json() as TenantHandoffResponse
  if (!/^[A-Za-z0-9_-]{43}$/.test(code) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return false

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `https://${slug}.${tenantBaseDomain}/api/v1/auth/tenant-handoff/redeem`
  form.style.display = 'none'
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = 'code'
  input.value = code
  form.append(input)
  document.body.append(form)
  form.submit()
  return true
}
