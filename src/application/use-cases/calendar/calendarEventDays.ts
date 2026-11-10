// Calendar intervals are half-open: an event ending at midnight does not
// occupy the following day. Advance by calendar date to respect DST changes.
export function calendarEventDayKeys(event: { startTime: string; endTime: string; dayKey: string }): string[] {
  const start = new Date(event.startTime)
  const end = new Date(event.endTime)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return [event.dayKey]
  }
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getTime() - 1)
  const keys: string[] = []
  while (current <= last) {
    keys.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`)
    current.setDate(current.getDate() + 1)
  }
  return keys
}
