import { useEffect, useState } from 'react'
import type { HttpOrganizationRepository } from '../../infrastructure/repositories/HttpOrganizationRepository'

/** A display role only; authorization continues to use the account's actual role. */
export function useWorkspaceProfileRole(
  repository: Pick<HttpOrganizationRepository, 'getCurrent'>,
  userId: number | null,
  accountRole: string,
  pathname: string,
): string {
  const [director, setDirector] = useState<{ userId: number; isDirector: boolean } | null>(null)
  const isPlatformAdmin = accountRole === 'admin' || accountRole === 'superadmin'

  useEffect(() => {
    if (userId === null || isPlatformAdmin) return

    let cancelled = false
    let latestRequest = 0
    const refresh = async () => {
      const request = ++latestRequest
      try {
        const organization = await repository.getCurrent()
        if (!cancelled && request === latestRequest) {
          setDirector({ userId, isDirector: organization.status === 'active' && organization.owner_id === userId })
        }
      } catch {
        if (!cancelled && request === latestRequest) setDirector(null)
      }
    }
    const handleFocus = () => { void refresh() }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    void refresh()
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelled = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [repository, userId, isPlatformAdmin, pathname])

  return !isPlatformAdmin && director?.userId === userId && director.isDirector ? 'director' : accountRole
}
