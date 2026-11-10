import { i18n } from '../../../shared/i18n'

const translate = i18n.t.bind(i18n) as unknown as (key: string, values?: Record<string, unknown>) => string

export const nt = (key: string, values?: Record<string, unknown>): string => translate(`notes:${key}`, values ?? {})
