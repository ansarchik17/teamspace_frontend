import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LogoutUseCase } from '../../../application/use-cases/auth/LogoutUseCase'
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'

export default function LogoutCompletePage() {
  const { t } = useTranslation(['auth', 'common'])
  useEffect(() => {
    let isCancelled = false
    const sessionStore = new LocalStorageAuthSessionStore()
    const logoutUseCase = new LogoutUseCase(new HttpAuthRepository(), sessionStore)

    // Keycloak returns here on the platform origin. Clear the platform-origin
    // tokens and cookies too; a tenant-origin logout cannot clear its
    // localStorage because browsers isolate storage between subdomains.
    void logoutUseCase.execute()
      .catch((error: unknown) => {
        console.warn('Platform session cleanup failed after logout', error)
        sessionStore.clearTokens()
      })
      .finally(() => {
        if (!isCancelled) window.location.replace('/web/login')
      })

    return () => {
      isCancelled = true
    }
  }, [])

  return <main role="status" className="min-h-screen grid place-items-center text-slate-600">{t('logout.finishing')}</main>
}
