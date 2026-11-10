/** Адрес EPS-сервера (backend, куда nginx проксирует). */
export const EPS_SERVER_URL = import.meta.env.VITE_EPS_SERVER_URL ?? 'http://92.38.49.156:5173'

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

/**
 * Путь в браузере под base `/web/`: запрос идёт на HTTPS same-origin,
 * nginx проксирует на EPS_SERVER_URL (92.38.49.156:5173).
 * Прямой http://IP из HTTPS-страницы браузер блокирует (mixed content).
 */
export const EPS_APP_BASE =
  import.meta.env.VITE_EPS_APP_BASE ??
  `${trimTrailingSlash(import.meta.env.BASE_URL)}/eps-remote`

export const EPS_API_TOKEN = import.meta.env.VITE_EPS_API_TOKEN ?? 'alem-superapp-supersecret-key'

export const EPS_SERVICE_ACCOUNT = {
  email: import.meta.env.VITE_EPS_SERVICE_EMAIL ?? 'tamerlan.kartayev@cdn-kindy.kz',
  password: 'Qwerty12!',
} as const

const EPS_MAILBOX_ALIASES: Record<string, string> = {
  'tamerlankartaev04@gmail.com': 'tamerlan.kartayev@cdn-kindy.kz',
}

export function resolveEpsMailboxEmail(workspaceEmail: string | null | undefined): string | null {
  const normalized = (workspaceEmail ?? '').trim().toLowerCase()
  if (!normalized) return null
  return EPS_MAILBOX_ALIASES[normalized] ?? workspaceEmail!.trim()
}
