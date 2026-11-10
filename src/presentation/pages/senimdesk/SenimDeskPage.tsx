import { useEffect, useRef, useState } from 'react'
import {sdHandoffTarget} from '../../../application/use-cases/senimdesk/sdNavigation'
import { Link, useLocation } from 'react-router-dom'
import { authorizedFetch } from '../../../infrastructure/http/authorizedFetch'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'

const sessionStore = new LocalStorageAuthSessionStore()

async function prepareHandoff(): Promise<string> {
  const response = await authorizedFetch(sessionStore, '/api/v1/auth/sd-handoff', {
    method: 'POST', cache: 'no-store',
  })
  const payload = await response.json() as { redirect_url?: string }
  if (!payload.redirect_url) throw new Error('Сервер не вернул адрес входа в SenimDesk')
  return payload.redirect_url
}

export default function SenimDeskPage() {
  const {search} = useLocation()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const request = useRef<{ attempt: number; promise: Promise<string> } | null>(null)

  useEffect(() => {
    let cancelled = false
    // StrictMode can mount the effect twice. Share one request per attempt so
    // only one browser-bound code is created and its cookie is not overwritten.
    if (!request.current || request.current.attempt !== attempt) {
      request.current = { attempt, promise: prepareHandoff() }
    }
    void request.current.promise.then((target) => {
      if (!cancelled) window.location.replace(sdHandoffTarget(target, search))
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Не удалось открыть SenimDesk')
    })
    return () => { cancelled = true }
  }, [attempt, search])

  return (
    <main className="flex min-h-[420px] flex-col items-center justify-center gap-3 bg-white px-6 py-16 text-center">
      {error ? <>
        <h1 className="text-lg font-semibold text-[#111827]">Не удалось открыть SenimDesk</h1>
        <p className="max-w-lg text-sm text-[#64748B]">{error}</p>
        <button type="button" onClick={() => { setError(''); setAttempt((value) => value + 1) }} className="ts-button ts-button--primary mt-2 rounded-xl bg-[#2458D3] px-4 py-2 text-sm font-semibold text-white">Повторить</button>
        <Link to="/workspace" className="text-sm text-[#2458D3]">Вернуться в Workspace</Link>
      </> : <>
        <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-[#EEF2FF] border-t-[#2458D3]" />
        <p className="text-sm font-medium text-[#64748B]">Подготавливаем пространство компании и открываем SenimDesk…</p>
      </>}
    </main>
  )
}
