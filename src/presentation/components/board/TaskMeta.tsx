import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { AXIS_TONE_CLASS, type AxisTone } from '../../../shared/ui/axisTokens'
import { bt } from './boardText'

const PRIORITY_CHIP: Record<string, { label: string; tone: AxisTone }> = {
  critical: { get label() { return bt('priority.critical') }, tone: 'error' },
  urgent: { get label() { return bt('priority.critical') }, tone: 'error' },
  high: { get label() { return bt('priority.high') }, tone: 'error' },
  medium: { get label() { return bt('priority.medium') }, tone: 'warning' },
  low: { get label() { return bt('priority.low') }, tone: 'success' },
}

export function PriorityChip({ priority }: { priority: string }) {
  const meta = PRIORITY_CHIP[priority.trim().toLowerCase()] ?? PRIORITY_CHIP.medium
  return (
    <span
      title={bt('meta.priority', { label: meta.label })}
      className={`inline-flex h-6 shrink-0 items-center rounded-[6px] px-2 text-[12px] font-medium ${AXIS_TONE_CLASS[meta.tone]}`}
    >
      {meta.label}
    </span>
  )
}

/** Срок задачи: красный — прошёл, жёлтый — сегодня/завтра (для незавершённых задач) */
export function DueDate({ dueAt, dueAtLabel, done }: { dueAt?: string; dueAtLabel?: string; done: boolean }) {
  const label = dueAtLabel?.trim() || bt('list.noDue')
  const date = dueAt ? new Date(dueAt) : null
  const hasDate = Boolean(date && !Number.isNaN(date.valueOf()))

  let tone = 'text-[#586174]'
  let hint = ''
  if (hasDate && date && !done) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const day = new Date(date)
    day.setHours(0, 0, 0, 0)
    const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000)
    if (diff < 0) {
      tone = 'text-[#C03437]'
      hint = bt('meta.overdue')
    } else if (diff <= 1) {
      tone = 'text-[#946000]'
      hint = diff === 0 ? bt('meta.dueToday') : bt('meta.dueTomorrow')
    }
  }

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-[12px] leading-4 tabular-nums ${tone}`}>
      <MaterialSymbol name="calendar_today" size={14} color="currentColor" />
      <span>{label}</span>
      {hint ? <span className="sr-only">{hint}</span> : null}
    </span>
  )
}
