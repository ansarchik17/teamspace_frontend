import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { AXIS_AVATAR_COLORS } from '../../../shared/ui/axisTokens'
import CrmSelect, { type CrmSelectOption } from './CrmSelect'

interface Assignee { id: number; name: string }
const avatar = (id: string) => ({ avatarBg: AXIS_AVATAR_COLORS[(Number(id) || 0) % AXIS_AVATAR_COLORS.length], avatarColor: '#FFFFFF' })

export default function CrmAssigneePicker({ repository, entity, value, initialName, onChange }: {
  repository: HttpGrowyPlatformRepository; entity: 'lead' | 'deal' | 'task'; value: string; initialName?: string; onChange: (value: string) => void
}) {
  const { t } = useTranslation('shell')
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<Assignee[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [known, setKnown] = useState<Record<string, string>>({})
  const generation = useRef(0)
  const key = `crm/assignees/?${new URLSearchParams({ entity, search })}`

  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    const timer = window.setTimeout(() => {
      setLoading(true); setError(''); setPage(1)
      repository.collection<Assignee>(key, 1, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        setOptions(result.results); setHasNext(result.hasNext)
        setKnown((current) => ({ ...current, ...Object.fromEntries(result.results.map((item) => [String(item.id), item.name])) }))
      }).catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, search ? 250 : 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, key, search])

  const more = async () => {
    if (loading || !hasNext) return
    const current = generation.current
    setLoading(true); setError('')
    try {
      const result = await repository.collection<Assignee>(key, page + 1)
      if (current !== generation.current) return
      setOptions((previous) => [...new Map([...previous, ...result.results].map((item) => [item.id, item])).values()]); setPage((value) => value + 1); setHasNext(result.hasNext)
      setKnown((known) => ({ ...known, ...Object.fromEntries(result.results.map((item) => [String(item.id), item.name])) }))
    } catch (error) { if (current === generation.current) setError(growyErrorMessage(error)) }
    finally { if (current === generation.current) setLoading(false) }
  }

  const selectedName = value ? known[value] || initialName || t('crm.assignee.current') : ''
  const list: CrmSelectOption[] = [
    ...(search ? [] : [{ value: '', label: t('crm.assignee.none') }]),
    ...(value && !options.some((item) => String(item.id) === value) && (!search || selectedName.toLowerCase().includes(search.toLowerCase())) ? [{ value, label: selectedName, ...avatar(value) }] : []),
    ...options.map((item) => ({ value: String(item.id), label: item.name, ...avatar(String(item.id)) })),
  ]

  return <div className="grid gap-1.5">
    <CrmSelect ariaLabel={t('crm.assignee.label')} value={value} onChange={onChange} options={list} avatars searchable
      placeholder={t('crm.assignee.none')} searchPlaceholder={t('crm.assignee.search')} onSearchChange={setSearch}
      onMenuScrollEnd={() => void more()} hasMore={hasNext} loadingMore={loading && options.length > 0} />
    {error && <span role="alert" className="text-[12px] text-[#C03437]">{error}</span>}
  </div>
}
