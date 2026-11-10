import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BriefcaseBusiness, Download, ListFilter, MessageCircle, Pencil, Search, SquareArrowOutUpRight, SquareCheck } from 'lucide-react'
import type { CrmRecord, CrmResource, Page } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import FloatingMenu from '../../../shared/ui/FloatingMenu'
import ViewToggle from '../../../shared/ui/ViewToggle'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import CrmKanban, { type CrmCardAction } from './CrmKanban'
import CrmRecordTable, { CRM_ROW_ICON } from './CrmRecordTable'
import { crmTableColumns } from './crmTableColumns'
import CrmDealKanban from './CrmDealKanban'
import CrmDealSummary from './CrmDealSummary'
import CrmLeadSummary from './CrmLeadSummary'
import CrmRecordForm from './CrmRecordForm'
import CrmRecordDrawer from './CrmRecordDrawer'
import { EmptyState, ErrorNotice } from './growyUi'
import { recordName, useGrowyContext } from './growyShared'

const tabs: { resource: CrmResource; label: string; singular: string; description: 'leads' | 'contacts' | 'deals' | 'tasks' | 'leadStages' }[] = [
  { resource: 'leads', label: 'Лиды', singular: 'лид', description: 'leads' },
  { resource: 'contacts', label: 'Контакты', singular: 'контакт', description: 'contacts' },
  { resource: 'deals', label: 'Сделки', singular: 'сделку', description: 'deals' },
  { resource: 'tasks', label: 'Задачи', singular: 'задачу', description: 'tasks' },
  { resource: 'lead-stages', label: 'Стадии воронки', singular: 'стадию', description: 'leadStages' },
]

const controlClass = `h-9 min-w-0 rounded-[6px] border border-[#E2E5EA] bg-white px-3 text-[14px] text-[#17202E] shadow-[0_1px_2px_rgba(23,32,46,0.04)] hover:border-[#C4C9D2] ${AXIS_UI.focus}`
const periodLabels: Record<string, string> = { today: 'Сегодня', '7_days': 'За 7 дней', '30_days': 'За 30 дней', this_month: 'Этот месяц', last_month: 'Прошлый месяц', custom: 'Свой период' }
const chipClass = (active: boolean) => `inline-flex h-[30px] items-center rounded-full border px-2.5 text-[13px] font-medium transition-colors ${AXIS_UI.focus} ${active ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#465066] hover:border-[#C4C9D2]'}`
const sourceLabels: Record<string, string> = { manual: 'Вручную', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', meta: 'Meta', website: 'Сайт', referral: 'Рекомендация', offline: 'Офлайн', other: 'Другой' }

export default function CrmPage() {
  const { repository, context, error: contextError, loading: contextLoading, retry } = useGrowyContext()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { t } = useTranslation('shell')
  const resource = tabs.find((tab) => tab.resource === params.get('tab'))?.resource ?? 'leads'
  const selectedId = Number(params.get('id')) || null
  const boardSupported = resource === 'leads' || resource === 'tasks' || resource === 'deals'
  const board = boardSupported && params.get('view') !== 'table'
  const [filters, setFilters] = useState<Record<string, string>>(resource === 'leads' ? { period: 'this_month' } : {})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [records, setRecords] = useState<Page<CrmRecord>>({ results: [], count: 0, hasNext: false })
  const [stages, setStages] = useState<CrmRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState<{ resource: CrmResource; record?: CrmRecord; defaultLeadId?: number; defaultDealId?: number; defaultContactId?: number; defaultStageId?: number; defaultColumnId?: number } | null>(null)
  const [selected, setSelected] = useState<CrmRecord | null>(null)
  const [opening, setOpening] = useState<number | null>(null)
  const enabled = Boolean(context?.modules.crm)
  useEffect(() => {
    if (!enabled || form?.resource !== 'leads') return
    const controller = new AbortController()
    repository.stages(controller.signal).then((data) => { if (!controller.signal.aborted) setStages(data) }).catch(() => { /* A forbidden stages endpoint must not hide accessible leads. */ })
    return () => controller.abort()
  }, [repository, enabled, revision, form?.resource])
  useEffect(() => {
    if (!enabled || board) return
    const controller = new AbortController()
    setLoading(true); setError(''); setRecords({ results: [], count: 0, hasNext: false })
    const timer = window.setTimeout(() => {
      repository.list(resource, { search, page, filters, signal: controller.signal }).then((data) => {
        if (!controller.signal.aborted) setRecords(data)
      }).catch((error: unknown) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [repository, enabled, resource, search, page, filters, revision, board])
  useEffect(() => { setSelected(null) }, [resource, selectedId])
  const createRequested = params.get('create') === '1'
  useEffect(() => {
    if (!createRequested || !enabled) return
    setForm({ resource })
    const next = new URLSearchParams(params)
    next.delete('create')
    setParams(next, { replace: true })
  }, [createRequested, enabled, params, resource, setParams])
  useEffect(() => {
    if (!selectedId || !enabled) return
    const controller = new AbortController()
    repository.get(resource, selectedId, controller.signal).then((record) => {
      if (!controller.signal.aborted) setSelected(record)
    }).catch((error: unknown) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
    return () => controller.abort()
  }, [repository, resource, selectedId, enabled, revision])
  const changeTab = (next: CrmResource) => { setParams({ tab: next }); setSearch(''); setFilters(next === 'leads' ? { period: 'this_month' } : {}); setPage(1); setForm(null); setError('') }
  const openWhatsApp = async (record: CrmRecord) => {
    if (opening !== null) return
    setOpening(record.id); setError('')
    try {
      const conversation = await repository.openConversation(resource === 'contacts' ? { contact_id: record.id } : { lead_id: record.id })
      navigate(`/crm/messenger/whatsapp?conversation=${conversation.id}`)
    } catch (error) { setError(growyErrorMessage(error)) }
    finally { setOpening(null) }
  }
  const cardActions = (record: CrmRecord): CrmCardAction[] => [
    { key: 'edit', label: t('crm.cardActions.edit'), icon: <Pencil size={16} />, onClick: () => setForm({ resource, record }) },
    ...(resource === 'leads' ? [{ key: 'deal', label: t('crm.cardActions.createDeal'), icon: <BriefcaseBusiness size={16} />, onClick: () => setForm({ resource: 'deals', defaultLeadId: record.id }) }] : []),
    ...(resource === 'deals' ? [{ key: 'task', label: t('crm.record.addTask'), icon: <SquareCheck size={16} />, onClick: () => setForm({ resource: 'tasks', defaultDealId: record.id }) }] : []),
    ...(context?.modules.whatsapp && resource === 'leads' ? [{ key: 'whatsapp', label: t('crm.cardActions.whatsapp'), icon: <MessageCircle size={16} />, disabled: opening !== null, onClick: () => void openWhatsApp(record) }] : []),
  ]
  const canChat = (record: CrmRecord) => Boolean(context?.modules.whatsapp) && (resource === 'leads' || resource === 'contacts') && Boolean(record.whatsapp || record.phone)
  const rowQuickActions = (record: CrmRecord) => {
    const name = recordName(record)
    return <>
      {canChat(record) && <button type="button" className={CRM_ROW_ICON} title={t('crm.cardActions.whatsapp')} aria-label={`${t('crm.cardActions.whatsapp')}: ${name}`}
        disabled={opening !== null} onClick={() => void openWhatsApp(record)}><MessageCircle size={18} /></button>}
      {(resource === 'leads' || resource === 'contacts') && <button type="button" className={CRM_ROW_ICON} title={t('crm.cardActions.createDeal')} aria-label={`${t('crm.cardActions.createDeal')}: ${name}`}
        onClick={() => setForm(resource === 'contacts' ? { resource: 'deals', defaultContactId: record.id } : { resource: 'deals', defaultLeadId: record.id })}><BriefcaseBusiness size={18} /></button>}
      {resource === 'deals' && <button type="button" className={CRM_ROW_ICON} title={t('crm.record.addTask')} aria-label={`${t('crm.record.addTask')}: ${name}`}
        onClick={() => setForm({ resource: 'tasks', defaultDealId: record.id })}><SquareCheck size={18} /></button>}
    </>
  }
  const rowMenuActions = (record: CrmRecord): CrmCardAction[] => [
    { key: 'open', label: t('crm.table.open'), icon: <SquareArrowOutUpRight size={16} />, onClick: () => openRecord(record) },
    { key: 'edit', label: t('crm.table.edit'), icon: <Pencil size={16} />, onClick: () => setForm({ resource, record }) },
  ]
  const reload = () => setRevision((value) => value + 1)
  const currentTab = tabs.find((tab) => tab.resource === resource) ?? tabs[0]
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null)
  const activeFilterCount = (filters.source ? 1 : 0) + ((filters.period || 'this_month') !== 'this_month' ? 1 : 0)
  const quickFilters = [
    { key: 'all', label: 'Все', active: !filters.manager_id && !filters.assigned_to && !filters.overdue && !filters.due_today && !filters.today },
    { key: 'my', label: 'Мои', active: Boolean(filters.manager_id || filters.assigned_to) },
    { key: 'attention', label: 'Требуют внимания', active: filters.overdue === 'true' },
    { key: 'today', label: 'На сегодня', active: filters.due_today === 'true' || filters.today === 'true' },
  ].filter((item) => resource !== 'deals' || item.key === 'all' || item.key === 'my')
  const applyQuick = (key: string) => {
    setFilters((current) => {
      const next = { ...current }
      ;['manager_id', 'assigned_to', 'overdue', 'due_today', 'today'].forEach((name) => delete next[name])
      if (key === 'my') next[resource === 'leads' || resource === 'deals' ? 'manager_id' : 'assigned_to'] = resource === 'leads' || resource === 'deals' ? String(context?.user_id) : 'me'
      if (key === 'attention') next.overdue = 'true'
      if (key === 'today') next[resource === 'leads' ? 'due_today' : 'today'] = 'true'
      return next
    }); setPage(1)
  }
  const openRecord = (record: CrmRecord) => {
    const next = new URLSearchParams(params)
    next.set('tab', resource); next.set('id', String(record.id)); setParams(next)
  }
  const closeRecord = () => {
    const next = new URLSearchParams(params)
    next.delete('id'); setParams(next)
  }

  return (
    <section className={`flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[#F6F7F9] px-4 pb-4 pt-6 text-[#17202E] md:px-6 xl:px-8 ${AXIS_UI.fontFamily}`}>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 pb-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">{currentTab.label}</h1>
          <p className="mt-0.5 text-[14px] text-[#586174]">{resource === 'contacts' && !loading && enabled ? t('crm.contacts.count', { count: records.count }) : t(`crm.descriptions.${currentTab.description}`)}{context?.tenant.name ? ` · ${context.tenant.name}` : ''}</p>
        </div>
        {enabled && resource === 'contacts' && <button type="button" className={AXIS_UI.secondaryButton} onClick={() => navigate('/crm/data?tab=export')}>
          <Download size={16} />{t('crm.contacts.export')}
        </button>}
        {enabled && boardSupported && <ViewToggle value={board ? 'kanban' : 'table'} ariaLabel="Вид CRM"
          options={[{ value: 'kanban', icon: 'view_kanban', label: 'Канбан' }, { value: 'table', icon: 'view_list', label: 'Таблица' }]}
          onChange={(view) => { const next = new URLSearchParams(params); next.set('view', view); setParams(next) }} />}
      </div>

      {contextLoading && <p role="status" className="py-10 text-center text-sm text-[#586174]">Подключаем CRM…</p>}
      {contextError && <ErrorNotice message={contextError} retry={retry} />}
      {context && !enabled && <EmptyState title="CRM выключена для компании" description="Обратитесь к администратору для подключения CRM." />}
      {enabled && <>
        <nav aria-label="Разделы CRM" className="people-section-tabs mb-3 flex shrink-0 gap-5 overflow-x-auto border-b border-[#E2E5EA] [scrollbar-width:none]">
          {tabs.map((tab) => <button key={tab.resource} type="button"
            aria-current={resource === tab.resource ? 'page' : undefined} onClick={() => changeTab(tab.resource)}
            className={`${AXIS_UI.tab} !h-9 ${resource === tab.resource ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}>
            {tab.label}
          </button>)}
        </nav>

        {resource === 'leads' && <div className="mb-4 shrink-0">
          <CrmLeadSummary repository={repository} filters={filters} search={search} revision={revision} />
        </div>}
        {resource === 'deals' && <div className="mb-4 shrink-0">
          <CrmDealSummary repository={repository} filters={filters} search={search} revision={revision} />
        </div>}

        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
          <label className={`${AXIS_UI.inputShell} w-full sm:w-[280px]`}>
            <Search size={16} className="shrink-0 text-[#586174]" />
            <input type="search" className={AXIS_UI.input} aria-label="Поиск в CRM"
              placeholder={resource === 'leads' || resource === 'contacts' ? 'Имя, телефон или email' : 'Поиск по названию'} value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
          </label>
          {boardSupported && <div className="flex max-w-full items-center gap-1 overflow-x-auto" aria-label="Быстрые фильтры">
            {quickFilters.map((item) => <button type="button" key={item.key} aria-pressed={item.active}
              className={`inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${AXIS_UI.focus} ${item.active ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#586174] hover:border-[#C4C9D2] hover:text-[#17202E]'}`}
              onClick={() => applyQuick(item.key)}>{item.label}</button>)}
          </div>}
          <span className="hidden flex-1 sm:block" />
          {resource === 'leads' && <>
            <button type="button" aria-haspopup="dialog" aria-expanded={Boolean(filtersAnchor)}
              className={`${activeFilterCount ? AXIS_UI.secondaryButtonActive : AXIS_UI.secondaryButton}`}
              onClick={(event) => setFiltersAnchor(filtersAnchor ? null : event.currentTarget)}>
              <ListFilter size={16} />Фильтры
              {activeFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-[#2458D3] px-1 text-[12px] text-white">{activeFilterCount}</span>}
            </button>
            <FloatingMenu anchor={filtersAnchor} open={Boolean(filtersAnchor)} onClose={() => setFiltersAnchor(null)} className="w-[360px]">
              <div className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-[#17202E]">Фильтры</span>
                  <button type="button" className="text-[13px] font-medium text-[#2458D3] hover:underline disabled:text-[#9AA0A6] disabled:no-underline" disabled={!activeFilterCount}
                    onClick={() => { setFilters((current) => ({ ...current, source: '', period: 'this_month', date_from: '', date_to: '' })); setPage(1) }}>Сбросить</button>
                </div>
                <div>
                  <span className="mb-1.5 block text-[12px] font-medium text-[#586174]">Источник</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[['', 'Все'], ...Object.entries(sourceLabels)].map(([value, label]) => {
                      const active = (filters.source || '') === value
                      return <button key={value || 'all'} type="button" aria-pressed={active} className={chipClass(active)}
                        onClick={() => { setFilters((current) => ({ ...current, source: value })); setPage(1) }}>{label}</button>
                    })}
                  </div>
                </div>
                <div>
                  <span className="mb-1.5 block text-[12px] font-medium text-[#586174]">Период</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(periodLabels).map(([value, label]) => {
                      const active = (filters.period || 'this_month') === value
                      return <button key={value} type="button" aria-pressed={active}
                        className={chipClass(active)}
                        onClick={() => {
                          setFilters((current) => {
                            const now = new Date()
                            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                            return { ...current, period: value, date_from: value === 'custom' ? `${month}-01` : '', date_to: value === 'custom' ? `${month}-${String(now.getDate()).padStart(2, '0')}` : '' }
                          }); setPage(1)
                        }}>{label}</button>
                    })}
                  </div>
                </div>
                {filters.period === 'custom' && <div className="grid grid-cols-2 gap-2">
                  <label className="text-[12px] font-medium text-[#586174]">С
                    <input className={`${controlClass} mt-1.5 w-full`} type="date" aria-label="Период с" value={filters.date_from || ''} max={filters.date_to || undefined}
                      onChange={(e) => { setFilters((current) => ({ ...current, date_from: e.target.value })); setPage(1) }} />
                  </label>
                  <label className="text-[12px] font-medium text-[#586174]">По
                    <input className={`${controlClass} mt-1.5 w-full`} type="date" aria-label="Период до" value={filters.date_to || ''} min={filters.date_from || undefined}
                      onChange={(e) => { setFilters((current) => ({ ...current, date_to: e.target.value })); setPage(1) }} />
                  </label>
                </div>}
              </div>
            </FloatingMenu>
          </>}
        </div>

        {error && <div className="mb-3 shrink-0"><ErrorNotice message={error} retry={reload} /></div>}
        {board && (resource === 'leads' || resource === 'tasks') ? (
          <CrmKanban key={resource} repository={repository} resource={resource} search={search} filters={filters}
            revision={revision} recordActions={cardActions} onOpen={openRecord}
            onForm={(nextResource, record, defaultStageId, defaultColumnId) => setForm({ resource: nextResource, record, defaultStageId, defaultColumnId })} />
        ) : board && resource === 'deals' ? (
          <CrmDealKanban repository={repository} search={search} filters={filters} revision={revision} recordActions={cardActions}
            onOpen={openRecord} onCreate={() => setForm({ resource: 'deals' })} onChanged={reload} />
        ) : (
          <CrmRecordTable records={records} loading={loading} page={page} filtered={Boolean(search) || Object.entries(filters).some(([key, value]) => key !== 'period' && Boolean(value))}
            columns={crmTableColumns(resource, t, sourceLabels)} onPage={setPage} onOpen={openRecord}
            quickActions={rowQuickActions} menuActions={rowMenuActions} />
        )}
      </>}

      {enabled && selectedId && <CrmRecordDrawer repository={repository} resource={resource} recordId={selectedId} record={selected} revision={revision}
        sourceLabels={sourceLabels} whatsappEnabled={Boolean(context?.modules.whatsapp)} opening={opening} onClose={closeRecord}
        onEdit={(record) => setForm({ resource, record })}
        onCreateDeal={(record) => setForm(resource === 'contacts' ? { resource: 'deals', defaultContactId: record.id } : { resource: 'deals', defaultLeadId: record.id })}
        onWhatsApp={(record) => void openWhatsApp(record)} onChanged={reload}
        onTask={(task) => setForm({ resource: 'tasks', record: task, defaultLeadId: resource === 'leads' ? selected?.id : undefined, defaultDealId: resource === 'deals' ? selected?.id : undefined })} />}
      {form && <CrmRecordForm key={`${form.resource}-${form.record?.id ?? 'new'}-${form.defaultLeadId ?? ''}`} {...form}
        repository={repository} stages={stages} onClose={() => setForm(null)} onSaved={() => { setForm(null); setPage(1); reload() }} />}
    </section>
  )
}
