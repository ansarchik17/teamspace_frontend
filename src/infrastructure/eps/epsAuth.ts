import { EPS_APP_BASE, EPS_SERVICE_ACCOUNT } from '../../shared/config/epsConfig'

export async function loginToEps(): Promise<void> {
  const response = await fetch(`${EPS_APP_BASE}/api/auth/login`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      email: EPS_SERVICE_ACCOUNT.email,
      password: EPS_SERVICE_ACCOUNT.password,
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`EPS login failed: ${response.status}${details ? ` — ${details.slice(0, 120)}` : ''}`)
  }
}

export function getEpsAppUrl(): string {
  const base = EPS_APP_BASE.endsWith('/') ? EPS_APP_BASE.slice(0, -1) : EPS_APP_BASE
  return `${base}/`
}
