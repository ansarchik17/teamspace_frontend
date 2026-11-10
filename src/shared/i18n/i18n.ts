import i18next, { type BackendModule, type ReadCallback } from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LANGUAGE,
  DEFAULT_NAMESPACE,
  SUPPORTED_LANGUAGES,
  normalizeLanguage,
  type AppLanguage,
} from './config'
import { detectInitialLanguage, writeStoredLanguage } from './storage'

const catalogLoaders = import.meta.glob<Record<string, unknown>>('./locales/*/*.json', { import: 'default' })

const NAMESPACES = [
  ...new Set(
    Object.keys(catalogLoaders)
      .filter((path) => path.startsWith(`./locales/${DEFAULT_LANGUAGE}/`))
      .map((path) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length)),
  ),
]

const catalogBackend: BackendModule = {
  type: 'backend',
  init: () => undefined,
  read: (language: string, namespace: string, callback: ReadCallback) => {
    const load = catalogLoaders[`./locales/${language}/${namespace}.json`]
    if (!load) {
      callback(null, {})
      return
    }
    load()
      .then((catalog) => callback(null, catalog))
      .catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null))
  },
}

const applyDocumentLanguage = (language: AppLanguage) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

export const i18n = i18next.createInstance()

let initPromise: Promise<void> | null = null

export const initI18n = (): Promise<void> => {
  if (initPromise) return initPromise
  const language = detectInitialLanguage()
  applyDocumentLanguage(language)
  initPromise = i18n
    .use(catalogBackend)
    .use(initReactI18next)
    .init({
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      load: 'languageOnly',
      ns: NAMESPACES,
      defaultNS: DEFAULT_NAMESPACE,
      fallbackNS: DEFAULT_NAMESPACE,
      interpolation: { escapeValue: false },
      returnEmptyString: false,
      react: { useSuspense: false },
      saveMissing: import.meta.env.DEV,
      missingKeyHandler: (languages, namespace, key) => {
        console.warn(`[i18n] missing key "${namespace}:${key}" for ${languages.join(', ')}`)
      },
    })
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error('[i18n] initialization failed', error)
    })
  return initPromise
}

i18n.on('languageChanged', (language) => {
  const normalized = normalizeLanguage(language)
  if (normalized) applyDocumentLanguage(normalized)
})

export const getLanguage = (): AppLanguage =>
  normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? detectInitialLanguage()

export const setLanguage = async (language: AppLanguage): Promise<void> => {
  writeStoredLanguage(language)
  await i18n.changeLanguage(language)
}

export const onLanguageChange = (listener: (language: AppLanguage) => void): (() => void) => {
  const handler = (language: string) => {
    const normalized = normalizeLanguage(language)
    if (normalized) listener(normalized)
  }
  i18n.on('languageChanged', handler)
  return () => i18n.off('languageChanged', handler)
}
