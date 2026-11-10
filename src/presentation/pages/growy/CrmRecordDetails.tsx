import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUp, Check, Download, FileText, Paperclip, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import type { CrmRecord, HttpGrowyPlatformRepository, Page } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import AxisAvatar from '../../components/board/AxisAvatar'
import { ErrorNotice, Field } from './growyUi'
import { dateLabel, inputClass, recordName, statusLabels } from './growyShared'

type Resource = 'leads' | 'deals' | 'contacts'
type Tab = 'history' | 'comments' | 'tasks' | 'files'
interface Item {
  id: number | string; text?: string; title?: string; description?: string
  pinned?: boolean; author_label?: string; actor_label?: string; actor?: { name?: string; full_name?: string } | null
  created_at?: string; created_date?: string; occurred_at?: string; activity_type_label?: string
  file_name?: string; file_url?: string; size?: number; file_size?: number
  status?: string; due_at?: string; assigned_to?: { name?: string; full_name?: string } | null
}
const empty: Page<Item> = { results: [], count: 0, hasNext: false }
const ICON = 'flex h-7 w-7 items-center justify-center rounded-md text-[#8E8E93] transition hover:bg-[#F3F4F6] hover:text-[#1D1D1F] disabled:opacity-40'
const PILL = 'inline-flex h-7 items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-white px-2.5 text-[12px] font-medium text-[#3C3C43] transition hover:bg-[#F6F7F9] disabled:opacity-50'
const safeFileUrl = (value?: string) => {
  if (!value) return null
  try { const url = new URL(value, window.location.origin); return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === window.location.origin) ? url.href : null } catch { return null }
}
const tabPath = (resource: Resource, base: string, item: Tab) => item === 'history' ? `${base}${resource === 'contacts' ? 'history' : 'activities'}/` : item === 'files' && resource === 'contacts' ? `${base}documents/` : `${base}${item}/`
const initialsOf = (value: string) => value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')

export default function CrmRecordDetails({ repository, resource, record, revision, onChanged, onTask }: {
  repository: HttpGrowyPlatformRepository; resource: Resource; record: CrmRecord; revision: number
  onChanged: () => void; onTask: (record?: CrmRecord) => void
}) {
  const { t } = useTranslation('shell')
  const [tab, setTab] = useState<Tab>('history')
  const [pages, setPages] = useState<Partial<Record<Tab, Page<Item> & { page: number }>>>({})
  const [paging, setPaging] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mutation = useRef(false)
  const [localRevision, setLocalRevision] = useState(0)
  const [text, setText] = useState('')
  const [activityType, setActivityType] = useState('call_logged')
  const [editor, setEditor] = useState<Item | null>(null)
  const [deleteItem, setDeleteItem] = useState<Item | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const tabs: Tab[] = resource === 'contacts' ? ['history', 'files'] : resource === 'deals' ? ['history', 'comments', 'tasks'] : ['history', 'comments', 'tasks', 'files']
  const base = `crm/${resource}/${record.id}/`
  const pathFor = (item: Tab) => tabPath(resource, base, item)
  const path = pathFor(tab)
  const current = pages[tab]
  const data = current ?? empty
  const page = current?.page ?? 1
  const loading = !current || paging
  const events: [string, string][] = [['call_logged', t('crm.record.eventCall')], ['message_logged', t('crm.record.eventMessage')], ['email_logged', t('crm.record.eventEmail')]]
  const tabsKey = tabs.join(',')
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    const list = tabsKey.split(',') as Tab[]
    Promise.all(list.map((item) => repository.collection<Item>(tabPath(resource, base, item), 1, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setPages((prev) => ({ ...prev, [item]: { ...result, page: 1 } })) })
      .catch((error) => { if (!controller.signal.aborted) { setPages((prev) => ({ ...prev, [item]: { ...empty, page: 1 } })); setError(growyErrorMessage(error)) } })))
    return () => controller.abort()
  }, [repository, resource, base, tabsKey, revision, localRevision])
  const goTo = (next: number) => {
    const target = tab
    setPaging(true); setError('')
    repository.collection<Item>(pathFor(target), next).then((result) => setPages((prev) => ({ ...prev, [target]: { ...result, page: next } })))
      .catch((error) => setError(growyErrorMessage(error)))
      .finally(() => setPaging(false))
  }
  const mutate = async (operation: () => Promise<unknown>, done?: () => void) => {
    if (mutation.current) return
    mutation.current = true; setBusy(true); setError('')
    try { await operation(); done?.(); setLocalRevision((value) => value + 1); onChanged() }
    catch (error) { setError(growyErrorMessage(error)) }
    finally { mutation.current = false; setBusy(false) }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    const payload = tab === 'comments' ? { text: text.trim() } : { description: text.trim(), activity_type: activityType }
    void mutate(() => repository.request(path, { method: 'POST', body: JSON.stringify(payload) }), () => setText(''))
  }
  const upload = (file?: File) => {
    if (!file) return
    if (file.size > 50 * 1024 * 1024) { setError(t('crm.record.fileTooLarge')); return }
    const body = new FormData(); body.append('file', file); body.append('file_name', file.name)
    void mutate(() => repository.request(path, { method: 'POST', body }), () => { if (fileRef.current) fileRef.current.value = '' })
  }
  const changeTab = (next: Tab) => { setTab(next); setText(''); setError('') }
  const composer = tab === 'comments' || (tab === 'history' && resource !== 'contacts')

  return <>
    <div className="mt-5 flex gap-5 overflow-x-auto px-5 shadow-[inset_0_-1px_0_#EDEDF0] [scrollbar-width:none]" role="tablist" aria-label={t('crm.record.sections')}>
      {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} disabled={busy}
        className={`flex h-10 shrink-0 items-center gap-1 border-b-2 px-1 text-[14px] transition ${tab === item ? 'border-[#2458D3] text-[#2458D3]' : 'border-transparent text-[#3C3C43] hover:text-[#1D1D1F]'}`}
        onClick={() => changeTab(item)}>
        {t(`crm.record.tabs.${item}`)}
        <span className={`min-w-[1ch] text-[12px] tabular-nums ${tab === item ? 'text-[#2458D3]/70' : 'text-[#AEAEB2]'}`}>{pages[item]?.count || ''}</span>
      </button>)}
    </div>

    <div className="px-5 pb-6 pt-4">
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}

      {composer && <form onSubmit={submit} className="mb-5 rounded-xl border border-[#E5E7EB] bg-white transition focus-within:border-[#2458D3] focus-within:shadow-[0_0_0_3px_rgba(36,88,211,0.12)]">
        <textarea className="block w-full resize-none rounded-t-xl bg-transparent px-3 pt-2.5 text-[14px] leading-5 text-[#1D1D1F] outline-none placeholder:text-[#AEAEB2]"
          aria-label={tab === 'comments' ? t('crm.record.comment') : t('crm.record.eventPlaceholder')}
          placeholder={tab === 'comments' ? t('crm.record.commentPlaceholder') : t('crm.record.eventPlaceholder')}
          rows={2} maxLength={10000} disabled={busy} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event) }} />
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          {tab === 'history' ? <div className="flex gap-1" role="radiogroup" aria-label={t('crm.record.eventType')}>
            {events.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={activityType === value} disabled={busy}
              className={`h-7 rounded-md px-2 text-[12px] font-medium transition ${activityType === value ? 'bg-[#EDF2FF] text-[#2458D3]' : 'text-[#8E8E93] hover:bg-[#F3F4F6] hover:text-[#1D1D1F]'}`}
              onClick={() => setActivityType(value)}>{label}</button>)}
          </div> : <span />}
          <button type="submit" className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2458D3] text-white transition hover:bg-[#1D4AB8] disabled:bg-[#C7D2EA]"
            aria-label={t('crm.record.send')} disabled={busy || !text.trim()}><ArrowUp size={16} /></button>
        </div>
      </form>}

      {tab === 'tasks' && <button type="button" className={`${PILL} mb-4`} disabled={busy} onClick={() => onTask()}><Plus size={14} />{t('crm.record.addTask')}</button>}
      {tab === 'files' && <div className="mb-4">
        <input ref={fileRef} type="file" className="hidden" aria-label={t('crm.record.attachFile')} disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        <button type="button" className={PILL} disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip size={14} />{t('crm.record.attachFile')}</button>
      </div>}

      {loading ? <div className="space-y-5">
        {[0, 1, 2].map((index) => <div key={index} className="flex animate-pulse gap-3">
          <span className="h-6 w-6 shrink-0 rounded-full bg-[#F2F2F7]" />
          <span className="flex-1 space-y-2 pt-1"><span className="block h-3 w-4/5 rounded bg-[#EEF1F5]" /><span className="block h-2.5 w-14 rounded bg-[#EEF1F5]" /></span>
        </div>)}
      </div> : data.results.length === 0 ? <div className="py-8 text-center">
        <p className="text-[14px] font-medium text-[#1D1D1F]">{t('crm.record.emptyTitle')}</p>
        <p className="mt-1 text-[13px] text-[#8E8E93]">{t('crm.record.emptyText')}</p>
      </div> : <ol className="space-y-4">
        {data.results.map((item) => {
          const author = item.actor_label || item.author_label || item.actor?.full_name || item.actor?.name || ''
          const heading = tab === 'files' ? item.file_name : item.title || item.activity_type_label || (tab === 'comments' ? '' : t('crm.record.commentFallback'))
          const fileUrl = safeFileUrl(item.file_url)
          return <li key={item.id} className={`flex gap-3 ${item.pinned ? '-mx-2 rounded-lg bg-[#FFF8EB] px-2 py-2' : ''}`}>
            {tab === 'files' ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#EDF2FF] text-[#2458D3]"><FileText size={14} /></span>
              : <AxisAvatar initials={initialsOf(author) || '·'} size={24} seed={author.length} title={author} />}
            <div className="min-w-0 flex-1 pt-px">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[13px] leading-[18px] text-[#1D1D1F]">
                  {author && <span className="font-medium">{author}</span>}
                  {author && heading ? <span className="text-[#8E8E93]"> · </span> : null}
                  {heading && <span className={tab === 'files' ? 'font-medium' : 'text-[#3C3C43]'}>{item.pinned && <Pin size={12} className="mr-1 inline text-[#B7791F]" />}{heading}</span>}
                </p>
                <div className="-mt-1 flex shrink-0 gap-0.5">
                  {tab === 'comments' && <>
                    <button type="button" className={ICON} disabled={busy} title={item.pinned ? t('crm.record.unpin') : t('crm.record.pin')} aria-label={item.pinned ? t('crm.record.unpin') : t('crm.record.pin')}
                      onClick={() => void mutate(() => repository.request(`crm/comments/${item.id}/`, { method: 'PATCH', body: JSON.stringify({ pinned: !item.pinned }) }))}><Pin size={14} /></button>
                    <button type="button" className={ICON} disabled={busy} title={t('crm.record.editComment')} aria-label={t('crm.record.editComment')} onClick={() => setEditor({ ...item })}><Pencil size={14} /></button>
                  </>}
                  {tab === 'files' && <>
                    {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={ICON} aria-label={t('crm.record.openFile', { name: item.file_name })}><Download size={14} /></a>}
                    <button type="button" className={`${ICON} hover:!text-[#D92D20]`} disabled={busy} aria-label={t('crm.record.deleteFile', { name: item.file_name })} onClick={() => setDeleteItem(item)}><Trash2 size={14} /></button>
                  </>}
                </div>
              </div>
              {(item.text || item.description) && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-[#3C3C43]">{item.text || item.description}</p>}
              {tab === 'tasks' && <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex h-6 items-center rounded-md bg-[#F2F2F7] px-2 text-[12px] text-[#3C3C43]">{statusLabels[item.status || ''] || item.status}</span>
                <span className="text-[12px] text-[#8E8E93]">{dateLabel(item.due_at)}</span>
                {!['completed', 'cancelled'].includes(item.status || '') && <button type="button" className={PILL} disabled={busy}
                  onClick={() => void mutate(() => repository.request(`crm/tasks/${item.id}/complete/`, { method: 'POST', body: '{}' }))}><Check size={14} />{t('crm.record.complete')}</button>}
                <button type="button" className={PILL} disabled={busy} onClick={() => onTask(item as CrmRecord)}><Pencil size={14} />{t('crm.record.change')}</button>
              </div>}
              <p className="mt-1 text-[12px] text-[#AEAEB2]">
                {dateLabel(item.occurred_at || item.created_at || item.created_date)}
                {tab === 'files' ? ` · ${t('crm.record.sizeKb', { size: Math.ceil((item.size || item.file_size || 0) / 1024) })}` : ''}
              </p>
            </div>
          </li>
        })}
      </ol>}

      {(page > 1 || data.hasNext) && <footer className="mt-5 flex items-center justify-between gap-3 text-[12px] text-[#8E8E93]">
        <span>{t('crm.record.total', { count: data.count })}</span>
        <div className="flex gap-1.5">
          <button type="button" className={PILL} disabled={loading || busy || page === 1} onClick={() => goTo(page - 1)}>{t('crm.record.prev')}</button>
          <button type="button" className={PILL} disabled={loading || busy || !data.hasNext} onClick={() => goTo(page + 1)}>{t('crm.record.next')}</button>
        </div>
      </footer>}
    </div>

    {editor && <AppModal title={t('crm.record.editComment')} onClose={() => { if (!busy) setEditor(null) }}>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (editor.text?.trim()) void mutate(() => repository.request(`crm/comments/${editor.id}/`, { method: 'PATCH', body: JSON.stringify({ text: editor.text?.trim() }) }), () => setEditor(null)) }}>
        <Field label={t('crm.record.comment')}><textarea className={inputClass} rows={5} maxLength={10000} disabled={busy} required value={editor.text || ''} onChange={(e) => setEditor({ ...editor, text: e.target.value })} /></Field>
        {error && <ErrorNotice message={error} />}
        <AppButton type="submit" isLoading={busy} disabled={busy || !editor.text?.trim()}>{t('crm.record.save')}</AppButton>
      </form>
    </AppModal>}
    {deleteItem && <AppModal title={t('crm.record.deleteFileTitle')} onClose={() => { if (!busy) setDeleteItem(null) }}>
      <p className="mb-4 text-sm">{t('crm.record.deleteFileText', { file: deleteItem.file_name, name: recordName(record) })}</p>
      {error && <ErrorNotice message={error} />}
      <div className="flex justify-end gap-2">
        <AppButton variant="secondary" disabled={busy} onClick={() => setDeleteItem(null)}>{t('crm.record.cancel')}</AppButton>
        <AppButton isLoading={busy} disabled={busy} onClick={() => void mutate(() => repository.request(resource === 'contacts' ? `${base}documents/${deleteItem.id}/` : `crm/lead-files/${deleteItem.id}/`, { method: 'DELETE' }), () => setDeleteItem(null))}>{t('crm.record.delete')}</AppButton>
      </div>
    </AppModal>}
  </>
}
