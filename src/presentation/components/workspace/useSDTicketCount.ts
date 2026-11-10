import { useEffect, useMemo, useState } from 'react'
import type { SDTicketCount } from '../../../domain/entities/SDTicketCount'
import { HttpSDDashboardRepository } from '../../../infrastructure/repositories/HttpSDDashboardRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { AUTH_SESSION_CLEARED_EVENT } from '../../../shared/auth/authSessionEvents'

export function useSDTicketCount(): SDTicketCount {
  const dependencies = useMemo(() => {
    const store = new LocalStorageAuthSessionStore()
    return { store, repository: new HttpSDDashboardRepository(store) }
  }, [])
  const [count, setCount] = useState<SDTicketCount>({ value: null, state: 'loading' })

  useEffect(() => {
    let active = true
    let stopped = false
    let current: AbortController | null = null
    const load = async () => {
      if (stopped || current) return
      const controller = new AbortController()
      current = controller
      const token = dependencies.store.getTokens()?.accessToken
      const timer = window.setTimeout(() => controller.abort(), 15000)
      try {
        const value = await dependencies.repository.openTicketCount(controller.signal)
        if (active && !stopped && !controller.signal.aborted) {
          setCount(dependencies.store.getTokens()?.accessToken === token
            ? { value, state: 'ready' }
            : { value: null, state: 'unavailable' })
        }
      } catch (error) {
        if (active && !stopped) {
          setCount({ value: null, state: error instanceof HttpError && error.status === 403 ? 'denied' : 'unavailable' })
        }
      } finally {
        clearTimeout(timer)
        if (current === controller) current = null
      }
    }
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    const clear = () => {
      stopped = true
      current?.abort()
      setCount({ value: null, state: 'unavailable' })
    }
    void load()
    const interval = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clear)
    return () => {
      active = false
      current?.abort()
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, clear)
    }
  }, [dependencies])

  return count
}
