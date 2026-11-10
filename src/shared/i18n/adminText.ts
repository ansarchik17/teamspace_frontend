import { i18n } from './i18n'
import type catalog from './locales/ru/administration.json'

export function adminText(key: Exclude<keyof typeof catalog, 'org' | 'auditCatalog'>, values?: Record<string, unknown>): string {
  return i18n.t(`administration:${key}`, values ?? {})
}
