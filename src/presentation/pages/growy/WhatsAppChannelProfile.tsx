import { useEffect, useState } from 'react'
import AppButton from '../../../shared/ui/AppButton'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { ErrorNotice } from './growyUi'
const fields = [['subject', 'Номер / отправитель'], ['name', 'Название'], ['displayName', 'Отображаемое имя'], ['status', 'Статус канала'], ['registrationStatus', 'Регистрация'], ['accountStatus', 'Статус аккаунта'], ['state', 'Состояние']] as const
export default function WhatsAppChannelProfile({ repository }: { repository: HttpGrowyPlatformRepository }) {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    repository.request<Record<string, unknown>>('whatsapp/edna/channel-profile/', { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setProfile(data); setError('') }
    }).catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [repository, revision])
  return <section className="space-y-4 rounded-2xl border border-[#DDE3EE] bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Профиль канала WhatsApp</h2><AppButton variant="secondary" disabled={loading} onClick={() => { setLoading(true); setRevision((value) => value + 1) }}>Обновить</AppButton></div>{loading && <p role="status" className="text-sm text-[#8497B4]">Загрузка профиля…</p>}{error && <ErrorNotice message={error} />}{profile && <dl className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => { const value = profile[key]; return typeof value === 'string' || typeof value === 'number' ? <div key={key}><dt className="text-xs text-[#8497B4]">{label}</dt><dd className="mt-1 text-sm font-semibold">{String(value)}</dd></div> : null })}{typeof profile.active === 'boolean' && <div><dt className="text-xs text-[#8497B4]">Активность</dt><dd className="mt-1 text-sm font-semibold">{profile.active ? 'Активен' : 'Неактивен'}</dd></div>}</dl>}</section>
}
