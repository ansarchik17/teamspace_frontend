import { INTL_LOCALES, type AppLanguage } from './config'
import { getLanguage } from './i18n'

type DateInput = Date | string | number | null | undefined

const formatterCache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>()

const cached = <T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat>(
  kind: string,
  locale: string,
  options: object | undefined,
  create: () => T,
): T => {
  const key = `${kind}|${locale}|${JSON.stringify(options ?? {})}`
  let formatter = formatterCache.get(key) as T | undefined
  if (!formatter) {
    formatter = create()
    formatterCache.set(key, formatter)
  }
  return formatter
}

export const getIntlLocale = (language: AppLanguage = getLanguage()): string => INTL_LOCALES[language]

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const KAZAKH_MONTHS = {
  long: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'], // i18n-ignore
  short: ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'], // i18n-ignore
}

const KAZAKH_WEEKDAYS = {
  long: ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі'], // i18n-ignore
  short: ['жс', 'дс', 'сс', 'ср', 'бс', 'жм', 'сб'], // i18n-ignore
}

let kazakhIntlSupport: boolean | null = null

const hasKazakhIntl = (): boolean => {
  if (kazakhIntlSupport === null) {
    try {
      const sample = new Intl.DateTimeFormat(INTL_LOCALES.kk, { month: 'long' }).format(new Date(2020, 8, 1))
      kazakhIntlSupport = !/\d/.test(sample)
    } catch {
      kazakhIntlSupport = false
    }
  }
  return kazakhIntlSupport
}

const formatKazakhDate = (date: Date, options: Intl.DateTimeFormatOptions): string => {
  const parts = cached('date', INTL_LOCALES.ru, options, () => new Intl.DateTimeFormat(INTL_LOCALES.ru, options)).formatToParts(date)
  const monthStyle = options.month === 'long' ? 'long' : 'short'
  const weekdayStyle = options.weekday === 'long' ? 'long' : 'short'
  return parts
    .map((part) => {
      if (part.type === 'month' && (options.month === 'long' || options.month === 'short')) return KAZAKH_MONTHS[monthStyle][date.getMonth()]
      if (part.type === 'weekday') return KAZAKH_WEEKDAYS[weekdayStyle][date.getDay()]
      if (part.type === 'literal') return part.value.replace(/\s*г\.?$/, '')
      return part.value
    })
    .join('')
    .trim()
}

export const formatDate = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
  language?: AppLanguage,
): string => {
  const date = toDate(value)
  if (!date) return ''
  const target = language ?? getLanguage()
  if (target === 'kk' && (options.month === 'long' || options.month === 'short' || options.weekday) && !hasKazakhIntl()) {
    return formatKazakhDate(date, options)
  }
  const locale = getIntlLocale(target)
  return cached('date', locale, options, () => new Intl.DateTimeFormat(locale, options)).format(date)
}

export const formatTime = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' },
  language?: AppLanguage,
): string => formatDate(value, options, language)

export const formatDateTime = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  language?: AppLanguage,
): string => formatDate(value, options, language)

export const formatNumber = (
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
  language?: AppLanguage,
): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const locale = getIntlLocale(language)
  return cached('number', locale, options, () => new Intl.NumberFormat(locale, options)).format(value)
}

export const formatRelativeTime = (
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options: Intl.RelativeTimeFormatOptions = { numeric: 'auto' },
  language?: AppLanguage,
): string => {
  const locale = getIntlLocale(language)
  return cached('relative', locale, options, () => new Intl.RelativeTimeFormat(locale, options)).format(value, unit)
}
