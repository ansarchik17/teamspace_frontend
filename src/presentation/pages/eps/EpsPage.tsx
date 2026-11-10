import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { odoHandoffTarget } from '../../../application/use-cases/eps/odoNavigation'

type HandoffResponse = { code?: string }

const sessionStore = new LocalStorageAuthSessionStore()

export default function EpsPage() {
  const { search } = useLocation()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    const openODO = async () => {
      setError('')
      const accessToken = sessionStore.getTokens()?.accessToken
      if (!accessToken) {
        if (!cancelled) setError('Сессия Workspace не найдена. Войдите в Workspace и откройте ЭДО ещё раз.')
        return
      }

      try {
        const response = await fetch('/api/v1/auth/odo-handoff', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`Не удалось подготовить вход в ODO (HTTP ${response.status})`)
        const payload = await response.json() as HandoffResponse
        if (!payload.code) throw new Error('Сервер не вернул одноразовый код для входа в ODO')
        if (!cancelled) {
          const target = odoHandoffTarget(search)
          window.location.replace(`${target}#workspace_handoff=${encodeURIComponent(payload.code)}`)
        }
      } catch (handoffError) {
        if (!cancelled) setError(handoffError instanceof Error ? handoffError.message : 'Не удалось открыть ODO')
      }
    }

    void openODO()
    return () => { cancelled = true }
  }, [attempt, search])

  return (
    <main className="flex h-[calc(100dvh-80px)] min-h-[420px] flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      {error ? <>
        <p className="text-[15px] font-semibold text-[#111827]">Не удалось открыть ЭДО</p>
        <p className="max-w-lg text-[13px] text-[#64748B]">{error}</p>
        <button type="button" onClick={() => setAttempt((value) => value + 1)} className="ts-button ts-button--primary mt-2 rounded-xl bg-[#2458D3] px-4 py-2 text-[13px] font-semibold text-white">Повторить</button>
      </> : <>
        <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-[#EEF2FF] border-t-[#2458D3]" />
        <p className="text-[13px] font-medium text-[#64748B]">Открываем ЭДО…</p>
      </>}
    </main>
  )
}
