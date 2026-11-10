/** Open process services through Workspace so their existing session bridge stays active. */
export function openWorkspaceServiceInNewTab(route: string): boolean {
  const pathname = route.split(/[?#]/, 1)[0]
  if (!['/eps', '/senimdesk'].includes(pathname)) return false

  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  window.open(`${base}${route}`, '_blank', 'noopener,noreferrer')
  return true
}
