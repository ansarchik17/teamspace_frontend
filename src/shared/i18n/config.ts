export const SUPPORTED_LANGUAGES = ['ru', 'kk'] as const

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: AppLanguage = 'ru'

export const LANGUAGE_STORAGE_KEY = 'app:language'

export const DEFAULT_NAMESPACE = 'common'

export const INTL_LOCALES: Record<AppLanguage, string> = {
  ru: 'ru-RU',
  kk: 'kk-KZ',
}

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)

export const normalizeLanguage = (value: string | null | undefined): AppLanguage | null => {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'kz' || normalized.startsWith('kk')) return 'kk'
  if (normalized.startsWith('ru')) return 'ru'
  return null
}
