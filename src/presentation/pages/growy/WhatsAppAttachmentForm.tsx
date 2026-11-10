import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { HttpGrowyPlatformRepository, WhatsAppMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import { ErrorNotice, Field } from './growyUi'
import { inputClass } from './growyShared'

interface Upload { view_url: string; content_type: string; size: number; kind: 'image' | 'video' | 'audio' | 'document' }
export default function WhatsAppAttachmentForm({ repository, conversationId, onClose, onSent, onBusy }: {
  repository: HttpGrowyPlatformRepository; conversationId: number; onClose: () => void
  onSent: (message: WhatsAppMessage) => void; onBusy: (value: boolean) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [uploaded, setUploaded] = useState<Upload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!file || locked.current) return
    if (file.size > 50 * 1024 * 1024) { setError('Размер файла не должен превышать 50 МБ.'); return }
    locked.current = true; setBusy(true); onBusy(true); setError('')
    try {
      const body = new FormData(); body.append('file', file); body.append('filename', file.name)
      const result = uploaded || await repository.request<Upload>('whatsapp/uploads/', { method: 'POST', body })
      setUploaded(result)
      const name = result.content_type === 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf') ? `${file.name.replace(/\.[^.]+$/, '')}.pdf` : file.name
      const message = await repository.request<WhatsAppMessage>(`whatsapp/conversations/${conversationId}/messages/`, {
        method: 'POST', body: JSON.stringify({ media_type: result.kind, attachment: { url: result.view_url, name } }),
      })
      onSent(message); onClose()
    } catch (error) { setError(growyErrorMessage(error)) }
    finally { locked.current = false; setBusy(false); onBusy(false) }
  }
  return <AppModal title="Отправить вложение" onClose={() => { if (!busy) onClose() }}><form onSubmit={(event) => void send(event)} className="grid gap-4"><Field label="Изображение, видео, аудио или документ"><input type="file" required className={inputClass} disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setUploaded(null); setError('') }} /></Field>{file && <p className="break-words text-sm text-[#374C6B]">{file.name} · {Math.ceil(file.size / 1024)} КБ</p>}<p className="text-xs text-[#8497B4]">Файл будет отправлен клиенту после нажатия «Отправить». Офисные документы преобразуются в PDF.</p>{error && <ErrorNotice message={error} />}<div className="flex justify-end gap-2"><AppButton variant="secondary" disabled={busy} onClick={onClose}>Отмена</AppButton><AppButton type="submit" disabled={busy || !file} isLoading={busy}>Отправить</AppButton></div></form></AppModal>
}
