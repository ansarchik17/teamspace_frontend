export const LEGACY_TEAM_ROUTES = {
  '/alemstore': '/teamstore',
  '/alemai': '/teamai',
  '/alem-rag': '/team-rag',
  '/alem-contact': '/team-contact',
} as const

/** Keep nested routes, search parameters and fragments when opening saved links. */
export function toTeamPath(path: string): string {
  for (const [legacy, current] of Object.entries(LEGACY_TEAM_ROUTES)) {
    if (path === legacy || path.startsWith(`${legacy}/`) || path.startsWith(`${legacy}?`) || path.startsWith(`${legacy}#`)) {
      return current + path.slice(legacy.length)
    }
  }
  return path
}

/** Catalog entries may still carry the old first-party product name from the API. */
export function toTeamServiceName(name: string): string {
  return name.replace(/^alem(?=$|\s|AI|GPT|RAG|Drive|Store|Board|Contact|Calendar|Meet|Chat|Workspace|Platform)/i, 'Team')
}

export function toTeamServiceLink(link: string, origin: string): string {
  if (link.startsWith('/') && !link.startsWith('//')) {
    return link.startsWith('/web/') ? '/web' + toTeamPath(link.slice(4)) : toTeamPath(link)
  }
  try {
    const url = new URL(link)
    if (url.origin !== origin) return link
    const path = url.pathname.startsWith('/web/') ? '/web' + toTeamPath(url.pathname.slice(4)) : toTeamPath(url.pathname)
    if (path === url.pathname) return link
    url.pathname = path
    return url.toString()
  } catch {
    return link
  }
}
