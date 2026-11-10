import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink, Megaphone, MoreHorizontal, Pencil, Plug, Plus, Search } from 'lucide-react'
import MetaLeadDetails from './MetaLeadDetails'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { KANBAN_COLUMN_BG } from '../../components/board/kanbanTheme'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { EmptyState, ErrorNotice, Field } from './growyUi'
import { inputClass, useGrowyContext } from './growyShared'
import CrmSelect from './CrmSelect'

interface MetaLead { id: number; full_name: string; phone: string; email: string; notes: string; card_type?: string; source_page?: { id: number }; crm_lead_id?: number; form_name?: string; campaign_name?: string; kanban_position?: number }
interface MetaColumn { id: number; page_id: number; name: string; color: string; order: number; lead_status: string; leads: MetaLead[] }
interface MetaPage { id: number; page_id: string; page_name: string }
interface MetaBoard { page: MetaPage | null; pages: MetaPage[]; columns: MetaColumn[] }
const LEAD_STATUSES = ['new', 'in_progress', 'won', 'lost'] as const
type LeadStatus = typeof LEAD_STATUSES[number]
const COLORS = ['#2458D3', '#0EA5E9', '#16A34A', '#F59E0B', '#DC2626', '#7C3AED', '#7B8494']
const COLUMN_ICON = `flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#17202E] ${AXIS_UI.focus}`

export default function MetaBoardPage() {
  const { t } = useTranslation('shell')
  const navigate = useNavigate()
  const { repository, context, error: contextError, loading: contextLoading, retry } = useGrowyContext()
  const [board, setBoard] = useState<MetaBoard | null>(null)
  const [pageId, setPageId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<number | null>(null)
  const [columnForm, setColumnForm] = useState<MetaColumn | 'new' | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2458D3')
  const [status, setStatus] = useState('new')
  const [dropColumn, setDropColumn] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column?: MetaColumn; lead?: MetaLead } | null>(null)
  const drag = useRef<MetaLead | null>(null)
  const actionBusy = useRef(false)
  const enabled = Boolean(context?.modules.crm)

  useEffect(() => {
    if (!context?.modules.crm) return
    const controller = new AbortController()
    setLoading(true); setError('')
    repository.request<MetaBoard>(`integrations/meta/board/?${new URLSearchParams(pageId ? { page_id: pageId } : {})}`, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setBoard({ ...value, columns: value.page ? value.columns.filter((column) => column.page_id === value.page?.id).map((column) => ({ ...column, leads: column.leads.filter((lead) => lead.card_type === 'meta_lead' && lead.source_page?.id === value.page?.id) })) : [] })
    }).catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [repository, context, pageId, revision])

  const mutate = async (path: string, payload: Record<string, unknown>, method = 'POST') => {
    if (actionBusy.current) return
    actionBusy.current = true; setBusy(true); setError('')
    try { await repository.request(`integrations/meta/${path}`, { method, body: JSON.stringify(payload) }); setColumnForm(null); setRevision((value) => value + 1) }
    catch (error) { setError(growyErrorMessage(error)) }
    finally { actionBusy.current = false; setBusy(false) }
  }
  const moveLead = (lead: MetaLead, column: MetaColumn) => void mutate(`leads/${lead.id}/move/`, { column_id: column.id, position: 0 })
  const editColumn = (column: MetaColumn | 'new') => { setError(''); setColumnForm(column); setName(column === 'new' ? '' : column.name); setColor(column === 'new' ? '#2458D3' : column.color); setStatus(column === 'new' ? 'new' : column.lead_status) }
  const query = search.trim().toLowerCase()
  const visible = (lead: MetaLead) => !query || [lead.full_name, lead.phone, lead.email, lead.campaign_name, lead.form_name].join(' ').toLowerCase().includes(query)
  const statusLabel = (value: string) => LEAD_STATUSES.includes(value as LeadStatus) ? t(`crm.meta.status.${value as LeadStatus}`) : t('crm.meta.statusKeep')
  const currentPage = pageId || board?.page?.page_id || ''

  return <section className={`flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[#F6F7F9] px-4 pb-4 pt-6 text-[#17202E] md:px-6 xl:px-8 ${AXIS_UI.fontFamily}`}>
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 pb-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">{t('crm.meta.title')}</h1>
        <p className="mt-0.5 text-[14px] text-[#586174]">{t('crm.meta.subtitle')}{context?.tenant.name ? ` · ${context.tenant.name}` : ''}</p>
      </div>
      <Link to="/crm/integrations" className={AXIS_UI.secondaryButton}><Plug size={16} />{t('crm.meta.connection')}</Link>
    </div>

    {contextLoading && <p role="status" className="py-10 text-center text-sm text-[#586174]">{t('crm.data.connecting')}</p>}
    {contextError && <ErrorNotice message={contextError} retry={retry} />}
    {context && !enabled && <EmptyState title={t('crm.data.disabledTitle')} description={t('crm.data.disabledText')} />}

    {enabled && <>
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
        {board && board.pages.length > 0 && <CrmSelect className="w-full sm:w-[240px]" ariaLabel={t('crm.meta.page')} value={currentPage} placeholder={t('crm.meta.choosePage')}
          onChange={(value) => { setSelectedLead(null); setPageId(value) }} options={board.pages.map((page) => ({ value: page.page_id, label: page.page_name }))} />}
        <label className={`${AXIS_UI.inputShell} w-full sm:w-[280px]`}>
          <Search size={16} className="shrink-0 text-[#586174]" />
          <input type="search" className={AXIS_UI.input} aria-label={t('crm.meta.searchLabel')} placeholder={t('crm.meta.searchPlaceholder')} value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <span className="hidden flex-1 sm:block" />
        {board?.page && <button type="button" className={AXIS_UI.secondaryButton} disabled={busy} onClick={() => editColumn('new')}><Plus size={16} />{t('crm.meta.addColumn')}</button>}
      </div>
      {error && !columnForm && <div className="mb-3 shrink-0"><ErrorNotice message={error} retry={() => setRevision((value) => value + 1)} /></div>}

      {loading && !board ? <div className="flex min-h-0 flex-1 gap-4 overflow-hidden" aria-hidden>
        {[0, 1, 2].map((index) => <div key={index} className="h-[420px] w-[288px] shrink-0 animate-pulse rounded-[8px]" style={{ backgroundColor: KANBAN_COLUMN_BG }} />)}
      </div> : board && !board.page ? <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#C4C9D2] bg-white p-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]"><Megaphone size={20} /></span>
        <p className="text-[15px] font-semibold">{t('crm.meta.noPageTitle')}</p>
        <p className="max-w-[420px] text-[14px] text-[#586174]">{t('crm.meta.noPageText')}</p>
        <Link to="/crm/integrations" className={AXIS_UI.primaryButton}>{t('crm.meta.openIntegrations')}<ArrowRight size={16} /></Link>
      </div> : board?.page ? <div className="relative flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto pb-4 [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin]" aria-busy={loading || busy}>
        {board.columns.map((column) => {
          const leads = column.leads.filter(visible)
          return <section key={column.id} className="flex h-full max-h-full min-h-[160px] w-[calc(100vw-48px)] max-w-[288px] shrink-0 flex-col rounded-[8px] border border-[#E2E5EA] p-2 sm:w-[288px]"
            style={{ backgroundColor: KANBAN_COLUMN_BG }}
            onDragOver={(event) => { if (drag.current && !actionBusy.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropColumn(column.id) } }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropColumn(null) }}
            onDrop={(event) => { event.preventDefault(); const lead = drag.current; drag.current = null; setDropColumn(null); if (lead && !column.leads.some((item) => item.id === lead.id)) moveLead(lead, column) }}>
            <header className="flex shrink-0 items-center gap-2 px-2 pb-2 pt-1">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
              <h3 className="min-w-0 truncate text-[14px] font-semibold leading-5 text-[#17202E]" title={column.name}>{column.name}</h3>
              <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[12px] font-medium tabular-nums text-[#586174]">{column.leads.length}</span>
              <span className="min-w-0 flex-1" />
              <button type="button" className={COLUMN_ICON} aria-label={t('crm.meta.columnActions', { name: column.name })} aria-haspopup="menu"
                onClick={(event) => setMenu({ anchor: event.currentTarget, column })}><MoreHorizontal size={18} /></button>
            </header>
            <div className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[6px] p-0.5 outline-dashed outline-2 -outline-offset-2 transition-[background-color,outline-color] duration-[120ms] [scrollbar-gutter:stable] [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin] ${dropColumn === column.id ? 'bg-[#EDF2FF] outline-[#2458D3]/40' : 'outline-transparent'}`}>
              {leads.map((lead) => {
                const contact = lead.phone || lead.email
                return <article key={lead.id} draggable={!busy} tabIndex={0} role="button" aria-label={t('crm.meta.openLead', { name: lead.full_name || lead.id })}
                  onClick={() => setSelectedLead(lead.id)}
                  onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedLead(lead.id) } }}
                  onDragStart={(event) => { drag.current = lead; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(lead.id)) }}
                  onDragEnd={() => { drag.current = null; setDropColumn(null) }}
                  className={`group relative flex w-full shrink-0 cursor-pointer flex-col rounded-[8px] border border-[#E2E5EA] bg-white px-3.5 py-3 text-left transition-[border-color,box-shadow] duration-[120ms] hover:border-[#C4C9D2] hover:shadow-[0_2px_8px_rgba(23,32,46,0.06)] active:cursor-grabbing ${AXIS_UI.focus}`}>
                  <button type="button" className="absolute right-2 top-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[#586174] opacity-0 transition-[opacity,background-color] duration-[120ms] hover:bg-[#F1F2F4] hover:text-[#17202E] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0"
                    aria-label={t('crm.meta.leadActions', { name: lead.full_name || lead.id })} aria-haspopup="menu" disabled={busy}
                    onClick={(event) => { event.stopPropagation(); setMenu({ anchor: event.currentTarget, lead }) }}><MoreHorizontal size={16} /></button>
                  {lead.campaign_name && <span className="mb-2 mr-7 inline-flex h-6 min-w-0 max-w-[200px] select-none items-center gap-1.5 self-start rounded-[6px] bg-[#EDF2FF] px-2 text-[12px] font-medium text-[#2458D3]">
                    <Megaphone size={12} className="shrink-0" /><span className="truncate">{lead.campaign_name}</span>
                  </span>}
                  <p className={`line-clamp-2 select-none break-words text-[14px] font-semibold leading-5 text-[#17202E] ${lead.campaign_name ? '' : 'pr-7'}`}>{lead.full_name || t('crm.meta.leadNumber', { id: lead.id })}</p>
                  <p className="mt-1 line-clamp-1 select-none break-words text-[12px] leading-4 tabular-nums text-[#586174]">{contact || t('crm.meta.noContacts')}</p>
                  {lead.form_name && <p className="mt-1 line-clamp-1 select-none break-words text-[12px] leading-4 text-[#586174]">{t('crm.meta.form', { name: lead.form_name })}</p>}
                  {lead.notes && <p className="mt-2 line-clamp-2 select-none whitespace-pre-wrap break-words rounded-[6px] bg-[#F6F7F9] px-2 py-1.5 text-[12px] leading-4 text-[#465066]">{lead.notes}</p>}
                  {lead.crm_lead_id && <span className="mt-2.5 inline-flex items-center gap-1 self-start text-[12px] font-medium text-[#16734B]"><span className="h-1.5 w-1.5 rounded-full bg-[#16734B]" />{t('crm.meta.inCrm')}</span>}
                </article>
              })}
              {leads.length === 0 && <p className="px-3 py-6 text-center text-[12px] text-[#8A93A3]">{query ? t('crm.meta.columnNotFound') : t('crm.meta.columnEmpty')}</p>}
            </div>
          </section>
        })}
        {board.columns.length === 0 && <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-[#C4C9D2] bg-white p-8 text-center">
          <p className="text-[14px] font-semibold">{t('crm.meta.noColumnsTitle')}</p>
          <p className="text-[14px] text-[#586174]">{t('crm.meta.noColumnsText')}</p>
          <button type="button" className={AXIS_UI.secondaryButton} onClick={() => editColumn('new')}><Plus size={16} />{t('crm.meta.addColumn')}</button>
        </div>}
      </div> : null}
    </>}

    <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={() => setMenu(null)} className="max-h-[min(480px,calc(100vh-16px))] min-w-[220px] !overflow-y-auto py-1.5">
      {menu?.column && <button type="button" className={floatingMenuItemClass} onClick={() => { const column = menu.column; setMenu(null); if (column) editColumn(column) }}><Pencil size={16} />{t('crm.meta.editColumn')}</button>}
      {menu?.column && <button type="button" className={floatingMenuItemClass} onClick={() => { setMenu(null); editColumn('new') }}><Plus size={16} />{t('crm.meta.addColumn')}</button>}
      {menu?.lead && (() => {
        const lead = menu.lead
        return <>
          <button type="button" className={floatingMenuItemClass} onClick={() => { setMenu(null); setSelectedLead(lead.id) }}><Pencil size={16} />{t('crm.meta.open')}</button>
          {lead.crm_lead_id && <button type="button" className={floatingMenuItemClass} onClick={() => { setMenu(null); navigate(`/crm?tab=leads&id=${lead.crm_lead_id}`) }}><ExternalLink size={16} />{t('crm.meta.openInCrm')}</button>}
          <div className="my-1 border-t border-[#EEF0F3]" />
          <p className="px-4 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A93A3]">{t('crm.meta.moveTo')}</p>
          {board?.columns.filter((column) => !column.leads.some((item) => item.id === lead.id)).map((column) => <button key={column.id} type="button" className={floatingMenuItemClass}
            onClick={() => { setMenu(null); moveLead(lead, column) }}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />{column.name}</button>)}
        </>
      })()}
    </FloatingMenu>

    {selectedLead && board?.page && <MetaLeadDetails key={selectedLead} repository={repository} id={selectedLead} pageId={board.page.id} onClose={() => setSelectedLead(null)} onSaved={() => setRevision((value) => value + 1)} />}

    {columnForm && <AppModal title={columnForm === 'new' ? t('crm.meta.newColumn') : t('crm.meta.editColumn')} onClose={() => { if (!busy) setColumnForm(null) }}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void mutate(columnForm === 'new' ? 'board/columns/' : `board/columns/${columnForm.id}/`, { page_id: board?.page?.page_id, name, color, lead_status: status, order: columnForm === 'new' ? board?.columns.length : columnForm.order }, columnForm === 'new' ? 'POST' : 'PATCH') }}>
        <fieldset disabled={busy} className="grid gap-4">
          <Field label={t('crm.settings.colName')}><input required maxLength={100} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-[#374C6B]">{t('crm.meta.color')}</span>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t('crm.meta.color')}>
              {COLORS.map((value) => <button key={value} type="button" role="radio" aria-checked={color.toLowerCase() === value.toLowerCase()} aria-label={value}
                className={`h-7 w-7 rounded-full transition-shadow ${AXIS_UI.focus} ${color.toLowerCase() === value.toLowerCase() ? 'shadow-[0_0_0_2px_#fff,0_0_0_4px_#17202E]' : ''}`}
                style={{ backgroundColor: value }} onClick={() => setColor(value)} />)}
              <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-[#C4C9D2] text-[#586174] hover:border-[#7B8494]" title={t('crm.meta.customColor')}>
                <Plus size={14} />
                <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label={t('crm.meta.customColor')} value={color} onChange={(event) => setColor(event.target.value)} />
              </label>
            </div>
          </div>
          <Field label={t('crm.meta.columnStatus')}>
            <CrmSelect value={status} onChange={setStatus} options={[{ value: '', label: t('crm.meta.statusKeep') }, ...LEAD_STATUSES.map((value) => ({ value, label: statusLabel(value) }))]} />
          </Field>
          <p className="-mt-2 text-[12px] leading-4 text-[#586174]">{t('crm.meta.columnStatusHint')}</p>
        </fieldset>
        {error && <ErrorNotice message={error} />}
        <div className="flex justify-end gap-2 border-t border-[#E6EAF1] pt-4">
          <AppButton variant="secondary" disabled={busy} onClick={() => setColumnForm(null)}>{t('crm.waManage.cancel')}</AppButton>
          <AppButton type="submit" disabled={busy || !name.trim()} isLoading={busy}>{t('crm.integrations.save')}</AppButton>
        </div>
      </form>
    </AppModal>}
  </section>
}
