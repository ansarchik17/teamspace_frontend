import { adminText } from '../../../shared/i18n/adminText'
import { i18n } from '../../../shared/i18n/i18n'

export interface AuditDifference {
  field: string
  rawField?: string
  before: string
  after: string
  changed: boolean
}

const secret = /password|secret|token|credential|certificate|private_key|last_error|settings|diagnostic|provider|prompt|request_payload|raw_response|api_key|system_prompt/i

export function isMicrocreditsField(field: string): boolean {
  return /_microcredits$/i.test(field) || field.toLowerCase() === 'microcredits'
}

export function formatAuditMicrocredits(value: unknown): string {
  if (value === null || value === undefined) {
    return i18n.t('ai:audit.unconfigured')
  }
  const str = String(value).trim()
  if (!/^-?\d+$/.test(str)) {
    return str
  }
  const isNegative = str.startsWith('-')
  const abs = isNegative ? str.slice(1) : str
  try {
    const b = BigInt(abs)
    const intPart = b / 1_000_000n
    const rem = b % 1_000_000n
    let formatted: string
    if (rem === 0n) {
      formatted = intPart.toString()
    } else {
      const frac = rem.toString().padStart(6, '0').replace(/0+$/, '')
      formatted = `${intPart.toString()}.${frac}`
    }
    const sign = isNegative ? '-' : ''
    const unit = i18n.t('ai:limits.creditsUnit')
    return `${sign}${formatted} ${unit}`.trim()
  } catch {
    return str
  }
}

export function auditFieldName(key: string): string {
  const known: Record<string, string> = {
    weekly_budget_microcredits: 'ai:audit.weeklyBudget',
    max_five_hour_microcredits: 'ai:audit.maxFiveHour',
    service_weekly_quota_microcredits: 'ai:audit.serviceWeeklyQuota',
    weekly_quota_microcredits: 'ai:audit.weeklyQuota',
    five_hour_limit_microcredits: 'ai:audit.fiveHourLimit',
    revision: 'ai:audit.revision',
  }
  if (known[key]) {
    return i18n.t(known[key] as any)
  }
  return key
}

function safeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        secret.test(key) && key !== 'secret_set' ? adminText('text020') : safeValue(child),
      ]),
    )
  }
  return value
}

function fields(value: unknown, prefix = '', result: Record<string, string> = {}) {
  if (Array.isArray(value)) {
    result[prefix || adminText('text021')] = JSON.stringify(safeValue(value))
    return result
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (secret.test(key) && key !== 'secret_set') {
        result[path] = adminText('text020')
      } else if (child && typeof child === 'object' && !Array.isArray(child)) {
        fields(child, path, result)
      } else if (isMicrocreditsField(key)) {
        result[path] = formatAuditMicrocredits(child)
      } else {
        result[path] =
          child === null
            ? adminText('text022')
            : typeof child === 'string'
              ? child
              : JSON.stringify(safeValue(child))
      }
    }
  }
  return result
}

export function auditDifferences(before: unknown, after: unknown): AuditDifference[] {
  const old = fields(before)
  const next = fields(after)
  const allKeys = [...new Set([...Object.keys(old), ...Object.keys(next)])].sort()

  return allKeys.map((rawField) => ({
    field: auditFieldName(rawField),
    rawField,
    before: old[rawField] ?? adminText('text023'),
    after: next[rawField] ?? adminText('text024'),
    changed: old[rawField] !== next[rawField],
  }))
}
