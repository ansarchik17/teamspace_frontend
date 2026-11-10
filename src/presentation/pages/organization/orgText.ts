import { i18n } from '../../../shared/i18n'

const translate = i18n.t.bind(i18n) as unknown as (key: string, values?: Record<string, unknown>) => string

export const ot = (key: string, values?: Record<string, unknown>): string => translate(`administration:org.${key}`, values ?? {})
