import { useEffect, useMemo, useState } from 'react'
import { emptyODOCounts, type ODODashboardCounts } from '../../../domain/entities/ODODashboardCounts'
import { HttpODODashboardRepository } from '../../../infrastructure/repositories/HttpODODashboardRepository'
import { HttpAccessRepository } from '../../../infrastructure/repositories/HttpAccessRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { AUTH_SESSION_CLEARED_EVENT } from '../../../shared/auth/authSessionEvents'

export function useODODashboardCounts(): ODODashboardCounts {
  const dependencies = useMemo(() => {
    const store = new LocalStorageAuthSessionStore()
    return { store, access: new HttpAccessRepository(store), odo: new HttpODODashboardRepository(store) }
  }, [])
  const [counts, setCounts] = useState(() => emptyODOCounts('loading'))

  useEffect(() => {
    let active = true
    let stopped = false
    let current: AbortController | null = null
    let scope = ''
    const load = async () => {
      if (stopped || current) return
      const controller = new AbortController()
      current = controller
      const timeout = window.setTimeout(() => controller.abort(), 15000)
      try {
        const access = await dependencies.access.current('odo', controller.signal)
        if (!active || stopped) return
        controller.signal.throwIfAborted()
        if (!access.active || !access.organization_id) throw new HttpError('ODO access denied', 403)
        const token = dependencies.store.getTokens()?.accessToken
        const nextScope = `${access.organization_id}:${token || ''}`
        if (scope !== nextScope) {
          scope = nextScope
          setCounts(emptyODOCounts('loading'))
        }
        const result = await dependencies.odo.counts(controller.signal)
        if (active && !stopped && !controller.signal.aborted && dependencies.store.getTokens()?.accessToken === token) setCounts(result)
      } catch (error) {
        if (active && !stopped) {
          setCounts(emptyODOCounts(error instanceof HttpError && error.status === 403 ? 'denied' : 'unavailable'))
        }
      } finally {
        clearTimeout(timeout)
        if (current === controller) current = null
      }
    }
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const clear = () => {
      stopped = true
      current?.abort()
      scope = ''
      setCounts(emptyODOCounts('unavailable'))
    }
    void load()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clear)
    return () => {
      active = false
      current?.abort()
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, clear)
    }
  }, [dependencies])

  return counts
}
