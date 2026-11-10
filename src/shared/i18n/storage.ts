import { LANGUAGE_STORAGE_KEY, normalizeLanguage, type AppLanguage } from './config'

export const readStoredLanguage = (): AppLanguage | null => {
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY))
  } catch {
    return null
  }
}

export const writeStoredLanguage = (language: AppLanguage): void => {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    return
  }
}

export const detectInitialLanguage = (): AppLanguage => {
  const stored = readStoredLanguage()
  if (stored) return stored
  const fromBrowser = typeof navigator === 'undefined' ? null : normalizeLanguage(navigator.language)
  return fromBrowser === 'kk' ? 'kk' : 'ru'
}
