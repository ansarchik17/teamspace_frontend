import { useEffect, useMemo, useState } from 'react'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { HttpHomeRepository } from '../../../infrastructure/repositories/HttpHomeRepository'
import type { FavoriteApp } from '../../../domain/entities/HomeDashboard'
import { WORKSPACE_APPS } from './workspaceApps'

export const DEFAULT_FAVORITE_IDS = ['iform', 'edo', 'senimdesk']
export const FAVORITES_CHANGED_EVENT = 'workspace:service-favorites-changed'
const sessionStore = new LocalStorageAuthSessionStore()
const repository = new HttpHomeRepository(sessionStore)
const memory = new Map<string, string[]>()
const normalize = (value: string) => value.trim().toLowerCase()
export const workspaceFavoriteId = (name: string) => WORKSPACE_APPS.find(app => normalize(app.label) === normalize(name))?.id
export const notifyFavoritesChanged = () => window.dispatchEvent(new Event(FAVORITES_CHANGED_EVENT))

function storageKey() {
  try {
    const token = sessionStore.getTokens()?.accessToken
    if (!token) return 'workspace:favorite-services:v2:guest'
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part)) as { user_id?: number; sub?: string; iss?: string }
    return `workspace:favorite-services:v2:${claims.iss ?? ''}:${claims.user_id ?? claims.sub ?? 'guest'}`
  } catch { return 'workspace:favorite-services:v2:guest' }
}
function readIds(key: string) {
  try {
    const saved = localStorage.getItem(key)
    if (saved === null) {
      const cached = memory.get(key)
      if (cached) return cached
      const legacy: unknown = JSON.parse(localStorage.getItem(key.replace(':v2:', ':')) ?? '[]')
      const extra = Array.isArray(legacy) ? legacy.filter((id): id is string => typeof id === 'string' && WORKSPACE_APPS.some(app => app.id === id)) : []
      return [...new Set([...DEFAULT_FAVORITE_IDS, ...extra])]
    }
    const raw: unknown = JSON.parse(saved)
    if (Array.isArray(raw)) return raw.filter((id): id is string => typeof id === 'string' && WORKSPACE_APPS.some(app => app.id === id))
  } catch { /* Use the in-memory selection when storage is unavailable. */ }
  return memory.get(key) ?? DEFAULT_FAVORITE_IDS
}
export function useWorkspaceFavoriteIds() {
  const key = storageKey()
  const [selection, setSelection] = useState(() => ({key, ids: readIds(key)}))
  useEffect(() => {
    const sync = () => setSelection({key, ids: readIds(key)})
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [key])
  const selected = selection.key === key ? selection.ids : readIds(key)
  const ids = useMemo(() => [...new Set(selected)], [selected])
  const toggle = (id: string) => {
    const previous = readIds(key)
    const next = previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]
    memory.set(key, next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Keep working without persistent storage. */ }
    notifyFavoritesChanged()
  }
  return { ids, toggle }
}

export function usePublicSidebarApps() {
  const key = storageKey()
  const [state, setState] = useState<{key: string; catalog: FavoriteApp[]; favorites: FavoriteApp[]}>({key, catalog: [], favorites: []})
  useEffect(() => {
    let active = true
    let revision = 0
    const load = async () => {
      const current = ++revision
      if (!sessionStore.getTokens()?.accessToken) return
      const [catalog, favorites] = await Promise.allSettled([repository.getPublicApps(), repository.getFavorites()])
      if (active && current === revision) setState({ key, catalog: catalog.status === 'fulfilled' ? catalog.value : [], favorites: favorites.status === 'fulfilled' ? favorites.value : [] })
    }
    void load()
    const refresh = () => { void load() }
    window.addEventListener(FAVORITES_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => { active = false; window.removeEventListener(FAVORITES_CHANGED_EVENT, refresh); window.removeEventListener('storage', refresh) }
  }, [key])
  return state.key === key ? state : {key, catalog: [], favorites: []}
}
export function publicAppRoute(app: Pick<FavoriteApp, 'id' | 'link'>) {
  if (app.id === 42) return '/teamai'
  if (app.id === 38) return '/board'
  return app.link || '/teamstore'
}
