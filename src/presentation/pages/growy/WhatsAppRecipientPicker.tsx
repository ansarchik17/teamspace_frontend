import { useEffect, useRef, useState } from 'react'
import type { CrmRecord, HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import { ErrorNotice } from './growyUi'
import { inputClass, recordName } from './growyShared'
export interface RecipientSelection { id: number; name: string }
export default function WhatsAppRecipientPicker({ repository, resource, value, onChange, disabled }: {
  repository: HttpGrowyPlatformRepository; resource: 'contacts' | 'leads'; value: RecipientSelection[]
  onChange: (value: RecipientSelection[]) => void; disabled: boolean
}) {
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CrmRecord[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    const timer = setTimeout(() => {
      setLoading(true); setError('')
      repository.list(resource, { search, signal: controller.signal }).then((result) => {
        if (!controller.signal.aborted) { setRows(result.results); setPage(1); setHasNext(result.hasNext) }
      }).catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { controller.abort(); clearTimeout(timer); generation.current += 1 }
  }, [repository, resource, search])
  const more = async () => {
    if (loading || disabled) return
    const current = generation.current
    setLoading(true); setError('')
    try {
      const result = await repository.list(resource, { search, page: page + 1 })
      if (current === generation.current) { setRows((rows) => [...rows, ...result.results.filter((item) => !rows.some((row) => row.id === item.id))]); setPage((page) => page + 1); setHasNext(result.hasNext) }
    } catch (error) { if (current === generation.current) setError(growyErrorMessage(error)) }
    finally { if (current === generation.current) setLoading(false) }
  }
  return <div className="space-y-3 rounded-xl border border-[#DDE3EE] p-3"><h3 className="text-sm font-semibold">{resource === 'contacts' ? 'Контакты CRM' : 'Лиды CRM'} · Выбрано: {value.length}</h3><input type="search" aria-label={resource === 'contacts' ? 'Поиск контактов для рассылки' : 'Поиск лидов для рассылки'} className={inputClass} disabled={disabled} placeholder="Имя, телефон или email" value={search} onChange={(event) => { generation.current += 1; setSearch(event.target.value); setRows([]); setHasNext(false) }} />{value.length > 0 && <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">{value.map((item) => <button type="button" disabled={disabled} key={item.id} className="rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-800" onClick={() => onChange(value.filter((selected) => selected.id !== item.id))} aria-label={`Убрать ${item.name}`}>{item.name} ×</button>)}</div>}<div className="max-h-48 space-y-2 overflow-y-auto">{rows.map((row) => { const phone = row.whatsapp || row.phone; return <label className="flex items-start gap-2 text-sm" key={row.id}><input type="checkbox" disabled={disabled || !phone} checked={value.some((item) => item.id === row.id)} onChange={(event) => onChange(event.target.checked ? [...value.filter((item) => item.id !== row.id), { id: row.id, name: recordName(row) }] : value.filter((item) => item.id !== row.id))} /><span>{recordName(row)}<span className="block text-xs text-[#8497B4]">{phone || 'Нет номера для WhatsApp'}</span></span></label> })}</div>{loading && <p role="status" className="text-xs text-[#8497B4]">Загрузка…</p>}{hasNext && <AppButton variant="secondary" disabled={disabled || loading} onClick={() => void more()}>Загрузить ещё</AppButton>}{error && <ErrorNotice message={error} />}</div>
}
