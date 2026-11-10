export function requestedContactId(search: string, stateId?: unknown): number {
  const params = new URLSearchParams(search)
  const value = stateId ?? (params.getAll('contact').length === 1 ? params.get('contact') : undefined)
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) return 0
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : 0
}

export function withoutContactDeepLink(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('contact')
  const query = params.toString()
  return query ? `?${query}` : ''
}
