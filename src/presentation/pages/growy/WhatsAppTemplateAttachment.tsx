import { useEffect, useRef, useState } from 'react'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import { ErrorNotice, Field } from './growyUi'

export interface TemplateAttachment { url: string; name: string }
interface Upload { view_url: string; content_type: string; kind: string }
export default function WhatsAppTemplateAttachment({ repository, value, disabled, onChange, onBusy, onPending }: {
  repository: HttpGrowyPlatformRepository; value: TemplateAttachment | null; disabled: boolean
  onChange: (attachment: TemplateAttachment | null) => void; onBusy: (busy: boolean) => void; onPending: (pending: boolean) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const uploadController = useRef<AbortController | null>(null)
  useEffect(() => () => { uploadController.current?.abort(); onBusy(false); onPending(false) }, [onBusy, onPending])
  const upload = async () => {
    if (!file || locked.current || disabled) return
    if (file.size > 50 * 1024 * 1024) { setError('Размер файла не должен превышать 50 МБ.'); return }
    const controller = new AbortController(); uploadController.current = controller
    locked.current = true; setBusy(true); onBusy(true); setError('')
    try {
      const body = new FormData(); body.append('file', file); body.append('filename', file.name)
      const result = await repository.request<Upload>('whatsapp/uploads/', { method: 'POST', body, signal: controller.signal })
      if (controller.signal.aborted) return
      if (!['image', 'video', 'document'].includes(result.kind)) throw new Error('Для заголовка шаблона выберите изображение, видео или документ.')
      const url = new URL(result.view_url)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Сервис вернул неподдерживаемый адрес файла.')
      const name = result.content_type === 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf') ? `${file.name.replace(/\.[^.]+$/, '')}.pdf` : file.name
      onChange({ url: result.view_url, name }); onPending(false)
    } catch (error) { if (!controller.signal.aborted) setError(growyErrorMessage(error)) }
    finally { locked.current = false; if (!controller.signal.aborted) { setBusy(false); onBusy(false) } }
  }
  return <div className="space-y-3 rounded-xl border border-[#DDE3EE] p-3"><Field label="Файл для заголовка шаблона"><input ref={input} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" disabled={disabled || busy} onChange={(event) => { setFile(event.target.files?.[0] || null); onChange(null); onPending(Boolean(event.target.files?.[0])); setError('') }} /></Field><p className="text-xs text-[#8497B4]">Укажите вложение, если одобренный шаблон содержит заголовок с изображением, видео или документом. Загрузка файла сама по себе не отправляет сообщение.</p>{(value || file) && <div className="flex items-center gap-2"><p className="mr-auto break-words text-sm">{value?.name || file?.name}</p><AppButton variant="secondary" disabled={disabled || busy} onClick={() => { onChange(null); setFile(null); onPending(false); if (input.current) input.current.value = ''; setError('') }}>Убрать файл</AppButton></div>}{!value && <AppButton variant="secondary" isLoading={busy} disabled={!file || disabled || busy} onClick={() => void upload()}>Загрузить вложение</AppButton>}{file && !value && !busy && <p className="text-xs text-amber-700">Перед отправкой шаблона загрузите выбранный файл.</p>}{error && <ErrorNotice message={error} />}</div>
}
