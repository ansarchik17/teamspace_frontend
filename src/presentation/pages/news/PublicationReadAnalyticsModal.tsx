import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import type { Publication, PublicationReadAnalytics, PublicationReader, PublicationReaderStatus } from '../../../infrastructure/repositories/HttpPublicationRepository'
import { HttpPublicationRepository } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type { UserDirectoryUser } from '../../../infrastructure/repositories/HttpUserDirectoryRepository'
import AppModal from '../../../shared/ui/AppModal'
import GradientAvatar from '../../../shared/ui/GradientAvatar'

interface PublicationReadAnalyticsModalProps {
  publication: Publication
  repository: HttpPublicationRepository
  directoryUsers: UserDirectoryUser[]
  onClose: () => void
}

const numberFormatter = new Intl.NumberFormat('ru-RU')
const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function PublicationReadAnalyticsModal({ publication, repository, directoryUsers, onClose }: PublicationReadAnalyticsModalProps) {
  const [analytics, setAnalytics] = useState<PublicationReadAnalytics | null>(null)
  const [readers, setReaders] = useState<PublicationReader[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<PublicationReaderStatus>('all')
  const [departmentId, setDepartmentId] = useState('')
  const [ministryId, setMinistryId] = useState('')
  const [search, setSearch] = useState('')
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [loadingReaders, setLoadingReaders] = useState(true)
  const [exporting, setExporting] = useState<'xlsx' | 'csv' | null>(null)
  const [analyticsError, setAnalyticsError] = useState('')
  const [readersError, setReadersError] = useState('')
  const limit = 50

  const departments = useMemo(() => {
    const options = new Map<number, string>()
    directoryUsers.forEach((user) => {
      if (user.departmentId) options.set(user.departmentId, user.departmentName || `Отдел №${user.departmentId}`)
    })
    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [directoryUsers])
  const ministries = useMemo(() => {
    const options = new Map<number, string>()
    directoryUsers.forEach((user) => {
      if (user.ministryId) options.set(user.ministryId, user.ministryName || `Филиал №${user.ministryId}`)
    })
    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }, [directoryUsers])

  useEffect(() => {
    let active = true
    setLoadingAnalytics(true)
    repository.getPublicationReadAnalytics(publication.id)
      .then((result) => { if (active) setAnalytics(result) })
      .catch((cause) => { if (active) setAnalyticsError(cause instanceof Error ? cause.message : 'Не удалось загрузить аналитику') })
      .finally(() => { if (active) setLoadingAnalytics(false) })
    return () => { active = false }
  }, [publication.id, repository])

  const loadReaders = useCallback(async () => {
    setLoadingReaders(true)
    setReadersError('')
    try {
      const result = await repository.getPublicationReaders(publication.id, {
        status,
        ...(departmentId ? { department_id: Number(departmentId) } : {}),
        ...(ministryId ? { ministry_id: Number(ministryId) } : {}),
        search,
        page,
        limit,
      })
      setReaders(result.readers)
      setTotalCount(result.total_count)
    } catch (cause) {
      setReadersError(cause instanceof Error ? cause.message : 'Не удалось загрузить список сотрудников')
      setReaders([])
    } finally {
      setLoadingReaders(false)
    }
  }, [departmentId, limit, ministryId, page, publication.id, repository, search, status])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadReaders() }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadReaders])

  const exportReaders = async (format: 'xlsx' | 'csv') => {
    setExporting(format)
    setReadersError('')
    try {
      const result = await repository.exportPublicationReaders(publication.id, {
        format,
        status,
        ...(departmentId ? { department_id: Number(departmentId) } : {}),
        ...(ministryId ? { ministry_id: Number(ministryId) } : {}),
        search,
      })
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setReadersError(cause instanceof Error ? cause.message : 'Не удалось выгрузить список сотрудников')
    } finally {
      setExporting(null)
    }
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / limit))
  const statusOptions: Array<[PublicationReaderStatus, string]> = [
    ['all', 'Все сотрудники'], ['read', 'Прочитали'], ['unread', 'Не прочитали'],
    ['acknowledged', 'Ознакомлены'], ['unacknowledged', 'Не ознакомлены'],
  ]

  return (
    <AppModal title="Аналитика прочтений" onClose={onClose} maxWidth={900}>
      <div className="space-y-5">
        <div className="truncate text-sm font-semibold text-[#0A1628]">{publication.title}</div>

        {loadingAnalytics ? <div className="py-5 text-center text-sm text-[#64748B]">Загружаем статистику…</div> : analytics ? <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Целевая аудитория" value={analytics.total_target_users} />
            <StatCard label="Прочитали" value={analytics.views_count} percent={analytics.view_percent} />
            <StatCard label="Ознакомлены" value={analytics.acknowledged_count} percent={analytics.acknowledgement_percent} />
            <StatCard label="Не прочитали" value={analytics.unread_count} />
          </div>
          <div className="grid gap-3 rounded-xl bg-[#F8FAFC] p-3 text-xs text-[#64748B] sm:grid-cols-2">
            <div>Первое прочтение: <span className="font-semibold text-[#334155]">{formatDate(analytics.first_view_at)}</span><br />Последнее прочтение: <span className="font-semibold text-[#334155]">{formatDate(analytics.last_view_at)}</span></div>
            <div>Первое ознакомление: <span className="font-semibold text-[#334155]">{formatDate(analytics.first_acknowledged_at)}</span><br />Последнее ознакомление: <span className="font-semibold text-[#334155]">{formatDate(analytics.last_acknowledged_at)}</span></div>
          </div>
          {Boolean(analytics.department_stats?.length || analytics.ministry_stats?.length) && <div className="grid gap-3 lg:grid-cols-2">
            {analytics.ministry_stats?.length ? <GroupStats title="По филиалам" items={analytics.ministry_stats} /> : null}
            {analytics.department_stats?.length ? <GroupStats title="По отделам" items={analytics.department_stats} /> : null}
          </div>}
        </> : null}

        {analyticsError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{analyticsError}</div>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E8ECF3] pt-4">
          <h4 className="text-sm font-bold text-[#0A1628]">Сотрудники <span className="font-normal text-[#64748B]">{numberFormatter.format(totalCount)}</span></h4>
          <div className="flex gap-2">
            <button type="button" onClick={() => void exportReaders('xlsx')} disabled={Boolean(exporting)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE3EE] px-3 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"><Download size={14} />{exporting === 'xlsx' ? 'Готовим…' : 'Excel'}</button>
            <button type="button" onClick={() => void exportReaders('csv')} disabled={Boolean(exporting)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE3EE] px-3 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"><Download size={14} />{exporting === 'csv' ? 'Готовим…' : 'CSV'}</button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative sm:col-span-2 lg:col-span-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8497B4]" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Поиск сотрудника" className="h-10 w-full rounded-lg border border-[#DDE3EE] bg-white pl-9 pr-3 text-xs outline-none focus:border-[#2458D3]" />
          </label>
          <select value={status} onChange={(event) => { setStatus(event.target.value as PublicationReaderStatus); setPage(1) }} className="h-10 rounded-lg border border-[#DDE3EE] bg-white px-3 text-xs text-[#334155] outline-none focus:border-[#2458D3]">
            {statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <select value={ministryId} onChange={(event) => { setMinistryId(event.target.value); setPage(1) }} className="h-10 rounded-lg border border-[#DDE3EE] bg-white px-3 text-xs text-[#334155] outline-none focus:border-[#2458D3]">
            <option value="">Все филиалы</option>{ministries.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
          <select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setPage(1) }} className="h-10 rounded-lg border border-[#DDE3EE] bg-white px-3 text-xs text-[#334155] outline-none focus:border-[#2458D3]">
            <option value="">Все отделы</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </div>

        {readersError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{readersError}</div>}
        <div className="max-h-[360px] overflow-y-auto rounded-xl border border-[#E8ECF3]">
          {loadingReaders ? <div className="py-8 text-center text-xs text-[#64748B]">Загружаем сотрудников…</div> : readers.length ? readers.map((reader) => <ReaderRow key={reader.user.id} reader={reader} />) : <div className="py-8 text-center text-xs text-[#64748B]">Сотрудники не найдены</div>}
        </div>
        <div className="flex items-center justify-between text-xs text-[#64748B]">
          <span>Страница {page} из {pageCount}</span>
          <div className="flex gap-1">
            <button type="button" aria-label="Предыдущая страница" disabled={page <= 1 || loadingReaders} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-[#DDE3EE] disabled:opacity-40"><ChevronLeft size={16} /></button>
            <button type="button" aria-label="Следующая страница" disabled={page >= pageCount || loadingReaders} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="grid h-8 w-8 place-items-center rounded-lg border border-[#DDE3EE] disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </AppModal>
  )
}

function StatCard({ label, value, percent }: { label: string; value: number; percent?: number }) {
  return <div className="rounded-xl border border-[#E8ECF3] bg-white p-3">
    <div className="text-[11px] text-[#64748B]">{label}</div>
    <div className="mt-1 text-xl font-bold text-[#0A1628]">{numberFormatter.format(value || 0)}{percent !== undefined && <span className="ml-1 text-xs font-semibold text-[#2458D3]">{Number(percent || 0).toLocaleString('ru-RU')}%</span>}</div>
  </div>
}

function GroupStats({ title, items }: { title: string; items: NonNullable<PublicationReadAnalytics['department_stats']> }) {
  return <section className="rounded-xl border border-[#E8ECF3] p-3">
    <h5 className="mb-2 text-xs font-bold text-[#334155]">{title}</h5>
    <div className="max-h-32 space-y-2 overflow-y-auto">
      {items.map((item) => <div key={`${item.department_id ?? item.ministry_id}-${item.department_name ?? item.ministry_name}`} className="flex items-center justify-between gap-3 text-[11px]">
        <span className="min-w-0 truncate text-[#475569]">{item.department_name || item.ministry_name}</span>
        <span className="shrink-0 text-[#64748B]">{item.views_count}/{item.total_users} прочитали · {Number(item.view_percent || 0).toLocaleString('ru-RU')}%</span>
      </div>)}
    </div>
  </section>
}

function ReaderRow({ reader }: { reader: PublicationReader }) {
  const name = reader.user.full_name || [reader.user.first_name, reader.user.last_name].filter(Boolean).join(' ') || 'Сотрудник'
  return <div className="flex items-center gap-3 border-b border-[#F1F4F9] px-3 py-2.5 last:border-b-0">
    <GradientAvatar initials={name.slice(0, 2).toUpperCase()} src={reader.user.avatar_url} size={34} seed={reader.user.id} />
    <div className="min-w-0 flex-1">
      <div className="truncate text-xs font-semibold text-[#0A1628]">{name}</div>
      <div className="truncate text-[10px] text-[#8497B4]">{[reader.email, reader.user.position, reader.department_name, reader.ministry_name].filter(Boolean).join(' · ') || '—'}</div>
    </div>
    <div className="hidden shrink-0 text-right text-[10px] sm:block">
      <div className={reader.is_viewed ? 'text-emerald-700' : 'text-slate-400'}>{reader.is_viewed ? `Прочитал · ${formatDate(reader.viewed_at)}` : 'Не прочитал'}</div>
      <div className={reader.is_acknowledged ? 'mt-0.5 text-blue-700' : 'mt-0.5 text-slate-400'}>{reader.is_acknowledged ? `Ознакомлен · ${formatDate(reader.acknowledged_at)}` : 'Не ознакомлен'}</div>
    </div>
    <div className="flex shrink-0 gap-1 sm:hidden" aria-label="Статусы">
      <span title={reader.is_viewed ? 'Прочитал' : 'Не прочитал'} className={`h-2 w-2 rounded-full ${reader.is_viewed ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <span title={reader.is_acknowledged ? 'Ознакомлен' : 'Не ознакомлен'} className={`h-2 w-2 rounded-full ${reader.is_acknowledged ? 'bg-blue-500' : 'bg-slate-300'}`} />
    </div>
  </div>
}
