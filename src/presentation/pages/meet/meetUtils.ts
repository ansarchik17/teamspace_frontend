export const meetLink = (meetingId: string) =>
  `${window.location.origin}${import.meta.env.BASE_URL}meet/${encodeURIComponent(meetingId)}`

export function parseMeetId(value: string): string | null {
  const trimmed = value.trim()
  if (
    /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(trimmed)
  )
    return trimmed
  try {
    const url = new URL(trimmed)
    const queryId = url.searchParams.get('meeting')
    if (
      queryId &&
      /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(queryId)
    )
      return queryId
    const parts = url.pathname.split('/').filter(Boolean)
    const last = parts.at(-1) ?? ''
    if (!parts.some((part) => ['meet', 'meeting', 'call'].includes(part)))
      return null
    return /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
      last,
    )
      ? last
      : null
  } catch {
    return null
  }
}

export const meetErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Не удалось выполнить действие. Попробуйте ещё раз.'
