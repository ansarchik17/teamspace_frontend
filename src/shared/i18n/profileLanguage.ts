import { normalizeLanguage, type AppLanguage } from './config'
import { getLanguage, setLanguage } from './i18n'

export const applyProfileLanguage = async (language: string | null | undefined): Promise<void> => {
  const normalized = normalizeLanguage(language)
  if (normalized && normalized !== getLanguage()) await setLanguage(normalized)
}

export type LanguageSaver = (language: AppLanguage) => Promise<void>

export type LanguageChangeResult = 'saved' | 'local-only' | 'rejected'

export const changeLanguage = async (
  next: AppLanguage,
  save: LanguageSaver,
): Promise<LanguageChangeResult> => {
  const previous = getLanguage()
  if (next === previous) return 'saved'
  await setLanguage(next)
  try {
    await save(next)
    return 'saved'
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status: unknown }).status) : 0
    if (status === 400 || status === 422) {
      await setLanguage(previous)
      return 'rejected'
    }
    return 'local-only'
  }
}
