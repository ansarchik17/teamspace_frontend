import { useEffect, useMemo, useState } from 'react'
import { HttpGrowyPlatformRepository, growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import type { GrowyContext } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'

export const inputClass = 'ts-input'
export const recordName = (record: { full_name?: string; name?: string; title?: string; first_name?: string; last_name?: string; id: number }) => record.full_name || record.name || record.title || [record.first_name, record.last_name].filter(Boolean).join(' ') || `№ ${record.id}`
export const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—'
export const statusLabels: Record<string, string> = { new: 'Новый', in_progress: 'В работе', interested: 'Заинтересован', contacted: 'Связались', no_answer: 'Нет ответа', converted: 'Конвертирован', deal_created: 'Сделка создана', paused: 'Отложен', rejected: 'Отказ', archived: 'В архиве', active: 'Активная', completed: 'Завершено', cancelled: 'Отменено', overdue: 'Просрочено' }


export function useGrowyContext() {
  const repository = useMemo(() => new HttpGrowyPlatformRepository(new LocalStorageAuthSessionStore()), [])
  const [context, setContext] = useState<GrowyContext | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    repository.context(controller.signal).then((value) => { if (!controller.signal.aborted) setContext(value) }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError(growyErrorMessage(error))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [repository, revision])
  return { repository, context, error, loading, retry: () => { setLoading(true); setContext(null); setError(''); setRevision((value) => value + 1) } }
}
