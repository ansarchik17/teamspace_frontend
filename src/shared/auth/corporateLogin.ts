const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// Only a company link or a managed Workspace email can identify the company
// before authentication. Do not infer membership from a name, IIN or custom domain.
export function loginOrganization(explicitSlug: string, login: string, baseDomain: string): string | null {
  const explicit = explicitSlug.trim().toLowerCase()
  if (explicit) return slugPattern.test(explicit) ? explicit : null
  const email = login.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return null
  const domain = email.split('@')[1]
  const suffix = `.${baseDomain.trim().toLowerCase()}`
  if (!domain.endsWith(suffix)) return null
  const slug = domain.slice(0, -suffix.length)
  return slugPattern.test(slug) ? slug : null
}

export async function corporateLoginAvailable(organization: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const query = new URLSearchParams({ organization })
    const response = await fetch(`/api/v1/auth/login-options?${query}`, {
      headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', signal,
    })
    if (!response.ok) return false
    const data: unknown = await response.json()
    return typeof data === 'object' && data !== null && 'corporate_login' in data && data.corporate_login === true
  } catch {
    return false
  }
}
