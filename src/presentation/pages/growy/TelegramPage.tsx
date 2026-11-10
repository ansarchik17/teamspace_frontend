import { useLayoutEffect, useRef } from 'react'
import { useGrowyContext } from './growyShared'
import { EmptyState, ErrorNotice } from './growyUi'
import { telegramBridgePath } from './telegramBridge'

// Reuse the Growy inbox with a Workspace-only transport. The iframe gets no JWT,
// password or handoff ticket; its API calls use the existing Workspace session.
function TelegramInbox({ repository }: { repository: ReturnType<typeof useGrowyContext>['repository'] }) {
  const frame = useRef<HTMLIFrameElement>(null)
  useLayoutEffect(() => {
    const pending = new Map<string, AbortController>()
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      if (!event.data || typeof event.data !== 'object') return
      const data = event.data as { type?: string; id?: string; path?: unknown; method?: string; body?: string; form?: [string, string | File][] }
      if (typeof data.id !== 'string' || data.id.length > 100) return
      if (data.type === 'workspace:telegram-cancel') { pending.get(data.id)?.abort(); return }
      if (data.type !== 'workspace:telegram-request') return
      const source = event.source as Window
      const path = telegramBridgePath(data.path)
      const method = data.method || 'GET'
      if (!path || !['GET', 'POST', 'PATCH'].includes(method) || pending.has(data.id)) return
      const controller = new AbortController()
      pending.set(data.id, controller)
      try {
        let body: BodyInit | undefined = data.body
        if (data.form) {
          const form = new FormData()
          data.form.forEach(([name, value]) => form.append(name, value))
          body = form
        }
        const response = await repository.telegramResponse(path, {method, body, signal:controller.signal})
        const buffer = await response.arrayBuffer()
        if (controller.signal.aborted || source !== frame.current?.contentWindow) return
        const headers = Object.fromEntries(['Content-Type', 'Content-Disposition', 'Retry-After'].flatMap(name => {
          const value = response.headers.get(name); return value ? [[name, value]] : []
        }))
        source.postMessage({type:'workspace:telegram-response',id:data.id,status:response.status,headers,body:buffer},window.location.origin,[buffer])
      } catch (error) {
        if (!controller.signal.aborted && source === frame.current?.contentWindow) source.postMessage({type:'workspace:telegram-response',id:data.id,error:error instanceof Error ? error.message : 'Не удалось выполнить запрос.'},window.location.origin)
      } finally { pending.delete(data.id) }
    }
    const listener = (event: MessageEvent) => { void onMessage(event) }
    window.addEventListener('message', listener)
    return () => { window.removeEventListener('message', listener); pending.forEach(controller => controller.abort()) }
  }, [repository])
  return <iframe ref={frame} title="Telegram организации" src={`${import.meta.env.BASE_URL}growy-telegram/index.html?v=workspace-ui-4`} className="block min-h-0 w-full flex-1 border-0" />
}

export default function TelegramPage() {
  const { repository, context, error, loading, retry } = useGrowyContext()
  if (loading) return <p role="status" className="p-8 text-center">Подключаем Telegram…</p>
  if (error) return <section className="p-6"><ErrorNotice message={error} retry={retry} /></section>
  if (!context?.modules.telegram) return <EmptyState title="Telegram выключен для компании" description="Обратитесь к администратору организации." />
  if (!context.capabilities?.telegram_operator) return <EmptyState title="Telegram доступен owner и администраторам" description="Права назначаются через сопоставление должности с ролью Growy в настройках организации." />
  return <TelegramInbox key={`${context.tenant.id}:${context.user_id}`} repository={repository} />
}
