const FALLBACK_TIME_ZONE = 'UTC'

export const getBrowserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE
  } catch {
    return FALLBACK_TIME_ZONE
  }
}

export const isValidTimeZone = (timeZone: string): boolean => {
  if (!timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

const getPartsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = partsFormatterCache.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  partsFormatterCache.set(timeZone, formatter)
  return formatter
}

const getZonedParts = (timestamp: number, timeZone: string) => {
  const values: Record<string, number> = {}
  getPartsFormatter(timeZone)
    .formatToParts(new Date(timestamp))
    .forEach((part) => {
      if (part.type !== 'literal') values[part.type] = Number(part.value)
    })
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour === 24 ? 0 : values.hour,
    minute: values.minute,
    second: values.second,
  }
}

export const getTimeZoneOffsetMinutes = (timeZone: string, timestamp: number = Date.now()): number => {
  const zone = isValidTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE
  const roundedTimestamp = Math.floor(timestamp / 1000) * 1000
  const parts = getZonedParts(roundedTimestamp, zone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return Math.round((asUtc - roundedTimestamp) / 60000)
}

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

export const zonedInputToUtcIso = (value: string, timeZone: string): string => {
  const match = INPUT_PATTERN.exec(value || '')
  if (!match) return ''
  const [, year, month, day, hour, minute] = match.map(Number)
  const zone = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone()
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  if (!Number.isFinite(wallClockAsUtc)) return ''
  const firstGuess = wallClockAsUtc - getTimeZoneOffsetMinutes(zone, wallClockAsUtc) * 60000
  const correctedOffset = getTimeZoneOffsetMinutes(zone, firstGuess)
  return new Date(wallClockAsUtc - correctedOffset * 60000).toISOString()
}

const pad = (value: number): string => String(value).padStart(2, '0')

export const utcIsoToZonedInput = (iso: string, timeZone: string): string => {
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return ''
  const zone = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone()
  const parts = getZonedParts(timestamp, zone)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

export const formatUtcOffset = (offsetMinutes: number): string => {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
}

export const formatTimeZoneLabel = (timeZone: string, timestamp: number = Date.now()): string =>
  `${timeZone.replace(/_/g, ' ')} (${formatUtcOffset(getTimeZoneOffsetMinutes(timeZone, timestamp))})`

export const formatInTimeZone = (
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string => {
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return ''
  const zone = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone()
  return new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: zone }).format(new Date(timestamp))
}

const COMMON_TIME_ZONES = [
  'Asia/Almaty',
  'Asia/Aqtobe',
  'Asia/Tashkent',
  'Asia/Bishkek',
  'Europe/Moscow',
  'Asia/Dubai',
  'Europe/Istanbul',
  'Europe/Berlin',
  'Europe/London',
  'UTC',
  'America/New_York',
  'Asia/Shanghai',
  'Asia/Tokyo',
]

export const getSelectableTimeZones = (current?: string): string[] => {
  const zones = [getBrowserTimeZone(), current ?? '', ...COMMON_TIME_ZONES].filter(
    (zone) => zone && isValidTimeZone(zone),
  )
  return [...new Set(zones)]
}
