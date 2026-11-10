import { formatMicrocredits } from '../../../domain/entities/UserAILimits'

export function credits(microcredits: string | null | undefined): string {
  const raw = formatMicrocredits(microcredits)
  const value = Number(raw)
  return Number.isFinite(value) && raw !== '—' ? value.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : raw
}
