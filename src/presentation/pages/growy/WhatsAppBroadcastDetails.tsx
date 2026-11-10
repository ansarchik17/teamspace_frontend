import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import { ErrorNotice } from './growyUi'
import { dateLabel, inputClass } from './growyShared'
import CrmSelect from './CrmSelect'

interface Recipient { id: number; phone: string; profile_name: string; contact_id: number | null; lead_id: number | null; status: string; attempts: number; error?: { message?: string; display_message?: string; code?: string }; sent_at?: string; delivered_at?: string }
interface Broadcast { id: number; name: string; template_name: string; created_at: string; created_by_name: string; recipients: Recipient[]; recipient_counts: Record<string, number>; pricing?: { unit: string; total: string; currency: string; billable_messages: number } }
const statuses: Record<string, string> = { pending: 'Ожидает', processing: 'Отправляется', sent: 'Отправлено', delivered: 'Доставлено', read: 'Прочитано', failed: 'Ошибка', skipped: 'Пропущено' }
export default function WhatsAppBroadcastDetails({ repository, id, onClose }: { repository: HttpGrowyPlatformRepository; id: number; onClose: () => void }) {
  const [data, setData] = useState<Broadcast | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true); setError('')
      repository.request<Broadcast>(`whatsapp/broadcasts/${id}/`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setData(result) })
        .catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 100)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, id, revision])
  const recipients = (data?.recipients || []).filter((recipient) => (!status || recipient.status === status) && (!search || `${recipient.phone} ${recipient.profile_name}`.toLowerCase().includes(search.toLowerCase())))
  return <AppModal title={data?.name || 'Получатели рассылки'} maxWidth={900} onClose={onClose}><div className="space-y-4">{error && <ErrorNotice message={error} />}<AppButton variant="secondary" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Обновить статусы</AppButton>{loading && <p role="status">Загрузка…</p>}{data && <><p className="text-sm text-[#8497B4]">Шаблон: {data.template_name} · {dateLabel(data.created_at)} · {data.created_by_name}</p><div className="flex flex-wrap gap-3 text-sm">{Object.entries(statuses).map(([key, label]) => <span key={key}>{label}: {data.recipient_counts[key] || 0}</span>)}</div>{data.pricing && <p className="rounded-xl bg-slate-50 p-3 text-sm">Стоимость: {data.pricing.total} {data.pricing.currency} · За сообщение: {data.pricing.unit} · Тарифицируемых сообщений: {data.pricing.billable_messages}</p>}<div className="flex flex-wrap gap-2"><input className={`${inputClass} !w-auto flex-1`} type="search" aria-label="Поиск получателя" placeholder="Имя или номер" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /><CrmSelect className="w-[200px]" ariaLabel="Статус получателя" value={status} onChange={(next) => { setStatus(next); setPage(1) }} options={[{ value: '', label: 'Все статусы' }, ...Object.entries(statuses).map(([key, label]) => ({ value: key, label }))]} /></div><div className="divide-y divide-[#F1F4F9]">{recipients.slice((page - 1) * 25, page * 25).map((recipient) => <article key={recipient.id} className="space-y-2 py-3"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{recipient.profile_name || recipient.phone}</h3><span className={`text-sm ${recipient.status === 'failed' ? 'text-red-700' : 'text-[#374C6B]'}`}>{statuses[recipient.status] || recipient.status}</span></div><p className="text-xs text-[#8497B4]">{recipient.phone} · Попыток: {recipient.attempts} · {dateLabel(recipient.delivered_at || recipient.sent_at)}</p>{recipient.error && <p className="text-sm text-red-700">{recipient.error.display_message || recipient.error.message || recipient.error.code || 'Провайдер сообщил об ошибке доставки.'}</p>}{(recipient.lead_id || recipient.contact_id) && <Link className="text-xs font-semibold text-[#2458D3]" to={recipient.lead_id ? `/crm?tab=leads&id=${recipient.lead_id}` : `/crm?tab=contacts&id=${recipient.contact_id}`} onClick={onClose}>Открыть карточку CRM</Link>}</article>)}</div>{recipients.length === 0 && <p className="text-sm text-[#8497B4]">Получатели не найдены.</p>}<footer className="flex items-center justify-between text-sm"><span>Найдено: {recipients.length}</span><div className="flex gap-2"><AppButton variant="secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Назад</AppButton><AppButton variant="secondary" disabled={page * 25 >= recipients.length} onClick={() => setPage((value) => value + 1)}>Далее</AppButton></div></footer></>}</div></AppModal>
}
