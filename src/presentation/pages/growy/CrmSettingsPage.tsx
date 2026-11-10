import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, ListPlus, Pencil, Plus, Tag, XCircle } from 'lucide-react'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { dateLabel, inputClass, useGrowyContext } from './growyShared'
import { EmptyState, ErrorNotice, Field } from './growyUi'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { CRM_ROW_ICON } from './CrmRecordTable'
import { Chip } from './crmTableCells'
import { TONES } from './crmTones'
import CrmSelect from './CrmSelect'

type Dictionary = 'rejection-reasons' | 'deal-types' | 'lead-custom-fields'
type Entity = 'lead' | 'contact' | 'deal'
interface Entry {
  id: number; name?: string; label?: string; key?: string; is_active: boolean; is_required?: boolean
  default_price?: string; required_fields?: string[]; entity_type?: string; field_type?: string
  options?: string[]; aliases?: string[]; reference_entity?: string; required?: boolean; order?: number
  created_date?: string
}
const DICTIONARIES: Dictionary[] = ['rejection-reasons', 'deal-types', 'lead-custom-fields']
const DICTIONARY_KEY = { 'rejection-reasons': 'reasons', 'deal-types': 'dealTypes', 'lead-custom-fields': 'fields' } as const
const ENTITIES: Entity[] = ['lead', 'contact', 'deal']
const FIELD_TYPES = ['text', 'textarea', 'number', 'decimal', 'date', 'datetime', 'select', 'multiselect', 'checkbox', 'money', 'phone', 'email', 'url', 'reference'] as const
type FieldType = typeof FIELD_TYPES[number]
const REFERENCES = ['contact', 'lead', 'employee', 'branch'] as const
const ICONS: Record<Dictionary, typeof Tag> = { 'rejection-reasons': XCircle, 'deal-types': Tag, 'lead-custom-fields': ListPlus }
const PAGER = `flex h-8 w-8 items-center justify-center rounded-[8px] text-[#465066] hover:bg-[#F1F3F6] disabled:text-[#B4BAC5] disabled:hover:bg-transparent ${AXIS_UI.focus}`
const chipClass = (active: boolean) => `inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${AXIS_UI.focus} ${active ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#586174] hover:border-[#C4C9D2] hover:text-[#17202E]'}`
const GRIDS: Record<Dictionary, string> = {
  'rejection-reasons': 'grid grid-cols-[minmax(240px,1fr)_120px_120px_140px_48px] items-center gap-4',
  'deal-types': 'grid grid-cols-[minmax(240px,1fr)_170px_120px_140px_48px] items-center gap-4',
  'lead-custom-fields': 'grid grid-cols-[minmax(220px,1fr)_150px_110px_72px_120px_48px] items-center gap-4',
}
const isFieldType = (value?: string): value is FieldType => FIELD_TYPES.includes(value as FieldType)

export default function CrmSettingsPage() {
  const { t, i18n } = useTranslation('shell')
  const { repository, context, loading, error: contextError, retry } = useGrowyContext()
  const [dictionary, setDictionary] = useState<Dictionary>('rejection-reasons')
  const [entity, setEntity] = useState<Entity>('lead')
  const [items, setItems] = useState<Entry[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState<Entry | 'new' | null>(null)
  const enabled = Boolean(context?.modules.crm)
  const key = DICTIONARY_KEY[dictionary]
  const money = (value?: string) => value == null ? '—' : `${Number(value).toLocaleString(i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU')} ₸`
  const fieldTypeLabel = (value?: string) => isFieldType(value) ? t(`crm.settings.fieldType.${value}`) : value || '—'

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setListLoading(true); setError(''); setItems([])
      const query = dictionary === 'lead-custom-fields' ? `?entity_type=${entity}` : ''
      repository.collection<Entry>(`crm/${dictionary}/${query}`, page, controller.signal).then((result) => {
        if (!controller.signal.aborted) { setItems(result.results); setHasNext(result.hasNext) }
      }).catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
        .finally(() => { if (!controller.signal.aborted) setListLoading(false) })
    }, 100)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, enabled, dictionary, entity, page, revision])

  const headers: Array<{ label: string; right?: boolean }> = dictionary === 'rejection-reasons'
    ? [{ label: t('crm.settings.colName') }, { label: t('crm.settings.colRequired') }, { label: t('crm.settings.colStatus') }, { label: t('crm.settings.colCreated') }, { label: '' }]
    : dictionary === 'deal-types'
      ? [{ label: t('crm.settings.colName') }, { label: t('crm.settings.colPrice'), right: true }, { label: t('crm.settings.colStatus') }, { label: t('crm.settings.colCreated') }, { label: '' }]
      : [{ label: t('crm.settings.colField') }, { label: t('crm.settings.colType') }, { label: t('crm.settings.colRequired') }, { label: t('crm.settings.colOrder'), right: true }, { label: t('crm.settings.colStatus') }, { label: '' }]
  const grid = GRIDS[dictionary]
  const Icon = ICONS[dictionary]
  const yesNo = (value?: boolean) => value ? t('crm.settings.yes') : <span className="text-[#8A93A3]">{t('crm.settings.no')}</span>
  const status = (active: boolean) => {
    const tone = active ? TONES.success : TONES.neutral
    return <Chip label={active ? t('crm.settings.active') : t('crm.settings.inactive')} bg={tone.bg} color={tone.color} dot={tone.color} />
  }
  const cells = (item: Entry): ReactNode[] => {
    const name = item.label || item.name || '—'
    const title = <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#586174]"><Icon size={16} /></span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[#17202E]">{name}</span>
        {dictionary === 'lead-custom-fields' && item.key && <span className="block truncate font-mono text-[12px] text-[#586174]">{item.key}</span>}
      </span>
    </div>
    if (dictionary === 'rejection-reasons') return [title, yesNo(item.is_required), status(item.is_active), <span className="text-[13px] tabular-nums">{dateLabel(item.created_date)}</span>]
    if (dictionary === 'deal-types') return [title, <span className="block text-right tabular-nums">{money(item.default_price)}</span>, status(item.is_active), <span className="text-[13px] tabular-nums">{dateLabel(item.created_date)}</span>]
    return [title, <span className="truncate">{fieldTypeLabel(item.field_type)}</span>, yesNo(item.required), <span className="block text-right tabular-nums">{item.order ?? 0}</span>, status(item.is_active)]
  }

  return <section className={`flex min-w-0 w-full flex-1 flex-col bg-[#F6F7F9] px-4 pb-6 pt-6 text-[#17202E] md:px-6 xl:px-8 ${AXIS_UI.fontFamily}`}>
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 pb-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">{t('crm.settings.title')}</h1>
        <p className="mt-0.5 text-[14px] text-[#586174]">{t('crm.settings.subtitle')}{context?.tenant.name ? ` · ${context.tenant.name}` : ''}</p>
      </div>
      {enabled && <button type="button" className={AXIS_UI.primaryButton} onClick={() => setEditor('new')}><Plus size={16} />{t(`crm.settings.${key}.add`)}</button>}
    </div>

    {loading && <p role="status" className="py-10 text-center text-sm text-[#586174]">{t('crm.data.connecting')}</p>}
    {contextError && <ErrorNotice message={contextError} retry={retry} />}
    {context && !enabled && <EmptyState title={t('crm.data.disabledTitle')} description={t('crm.data.disabledText')} />}

    {enabled && <>
      <nav aria-label={t('crm.settings.title')} className="mb-4 flex shrink-0 gap-5 overflow-x-auto border-b border-[#E2E5EA] [scrollbar-width:none]">
        {DICTIONARIES.map((item) => <button key={item} type="button" aria-current={dictionary === item ? 'page' : undefined}
          onClick={() => { setDictionary(item); setPage(1); setEditor(null) }}
          className={`${AXIS_UI.tab} !h-9 ${dictionary === item ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}>{t(`crm.settings.${DICTIONARY_KEY[item]}.tab`)}</button>)}
      </nav>

      <div className="flex max-w-[1120px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[640px] text-[14px] leading-5 text-[#586174]">{t(`crm.settings.${key}.text`)}</p>
          {dictionary === 'lead-custom-fields' && <div className="flex items-center gap-1" aria-label={t('crm.settings.entityFilter')}>
            {ENTITIES.map((item) => <button key={item} type="button" aria-pressed={entity === item} className={chipClass(entity === item)}
              onClick={() => { setEntity(item); setPage(1) }}>{t(`crm.data.entity.${item}`)}</button>)}
          </div>}
        </div>
        {error && <ErrorNotice message={error} retry={() => setRevision((value) => value + 1)} />}

        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white">
          <div className="overflow-x-auto [scrollbar-width:thin]">
            <div className="min-w-[720px]" role="table">
              <div className={`${grid} h-11 border-b border-[#E6EAF1] bg-[#FAFBFC] px-6 text-[13px] font-medium text-[#586174]`} role="row">
                {headers.map((header, index) => <span key={index} role="columnheader" className={header.right ? 'text-right' : ''}>{header.label}</span>)}
              </div>
              {listLoading ? Array.from({ length: 4 }, (_, index) => <div key={index} className={`${grid} h-[60px] border-b border-[#EEF0F3] px-6 last:border-b-0`} aria-hidden>
                {headers.map((_, cell) => <span key={cell} className={`h-3.5 animate-pulse rounded bg-[#EEF0F3] ${cell === 0 ? 'w-44' : cell === headers.length - 1 ? 'w-0' : 'w-16'}`} />)}
              </div>) : items.length === 0 ? <EmptyState title={t(`crm.settings.${key}.emptyTitle`)} description={t(`crm.settings.${key}.emptyText`)} />
                : items.map((item) => <div key={item.id} role="row" tabIndex={0} onClick={() => setEditor(item)}
                  onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') setEditor(item) }}
                  className={`${grid} h-[60px] cursor-pointer border-b border-[#EEF0F3] px-6 text-[14px] text-[#465066] last:border-b-0 hover:bg-[#F8F9FB] ${AXIS_UI.focus}`}>
                  {cells(item).map((cell, index) => <div key={index} role="cell" className="min-w-0">{cell}</div>)}
                  <div role="cell" className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                    <button type="button" className={CRM_ROW_ICON} title={t('crm.settings.edit')} aria-label={`${t('crm.settings.edit')}: ${item.label || item.name}`} onClick={() => setEditor(item)}><Pencil size={16} /></button>
                  </div>
                </div>)}
            </div>
          </div>
          <footer className="flex h-14 shrink-0 items-center justify-between gap-2 border-t border-[#E6EAF1] px-6 text-[13px] text-[#465066]">
            <span className="tabular-nums">{t('crm.data.page', { page })}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" className={PAGER} aria-label={t('crm.table.prev')} disabled={listLoading || page === 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={18} /></button>
              <span className="flex h-8 min-w-8 items-center justify-center rounded-[8px] border border-[#2458D3] bg-[#EDF2FF] px-2 font-medium tabular-nums text-[#2458D3]">{page}</span>
              <button type="button" className={PAGER} aria-label={t('crm.table.next')} disabled={listLoading || !hasNext} onClick={() => setPage((value) => value + 1)}><ChevronRight size={18} /></button>
            </div>
          </footer>
        </section>
      </div>
    </>}

    {editor && <DictionaryForm key={`${dictionary}-${editor === 'new' ? entity : editor.id}`} dictionary={dictionary} entity={entity} item={editor === 'new' ? undefined : editor}
      repository={repository} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setRevision((value) => value + 1) }} />}
  </section>
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string }) {
  return <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-[#E2E5EA] px-3.5 py-3">
    <span><span className="block text-[14px] font-medium text-[#17202E]">{label}</span>{hint && <span className="block text-[12px] leading-4 text-[#586174]">{hint}</span>}</span>
    <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#2458D3] ${checked ? 'bg-[#2458D3]' : 'bg-[#C9CFD8]'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[left] ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  </label>
}

function DictionaryForm({ dictionary, entity, item, repository, onClose, onSaved }: {
  dictionary: Dictionary; entity: string; item?: Entry; repository: ReturnType<typeof useGrowyContext>['repository']; onClose: () => void; onSaved: () => void
}) {
  const { t } = useTranslation('shell')
  const key = DICTIONARY_KEY[dictionary]
  const [name, setName] = useState(item?.label || item?.name || '')
  const [active, setActive] = useState(item?.is_active ?? true)
  const [required, setRequired] = useState(item?.required || item?.is_required || false)
  const [price, setPrice] = useState(item?.default_price || '0.00')
  const [fieldType, setFieldType] = useState(item?.field_type || 'text')
  const [options, setOptions] = useState((item?.options || []).join('\n'))
  const [aliases, setAliases] = useState((item?.aliases || []).join('\n'))
  const [reference, setReference] = useState(item?.reference_entity || 'contact')
  const [order, setOrder] = useState(String(item?.order || 0))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const lines = (value: string) => [...new Set(value.split('\n').map((part) => part.trim()).filter(Boolean))]
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (locked.current) return
    const payload: Record<string, unknown> = { is_active: active }
    if (dictionary === 'rejection-reasons') Object.assign(payload, { name: name.trim(), is_required: required })
    if (dictionary === 'deal-types') Object.assign(payload, { name: name.trim(), default_price: price })
    if (dictionary === 'lead-custom-fields') Object.assign(payload, { label: name.trim(), entity_type: item?.entity_type || entity, field_type: fieldType, options: ['select', 'multiselect'].includes(fieldType) ? lines(options) : [], aliases: lines(aliases), reference_entity: fieldType === 'reference' ? reference : '', required, order: Number(order) })
    locked.current = true; setBusy(true); setError('')
    try { await repository.request(`crm/${dictionary}/${item ? `${item.id}/` : ''}`, { method: item ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); onSaved() }
    catch (error) { setError(growyErrorMessage(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <AppModal title={item ? t(`crm.settings.${key}.editTitle`) : t(`crm.settings.${key}.newTitle`)} onClose={() => { if (!busy) onClose() }}>
    <form className="grid gap-4" onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy} className="grid gap-4">
        <Field label={t('crm.settings.colName')}><input required maxLength={255} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></Field>
        {dictionary === 'deal-types' && <Field label={t('crm.settings.defaultPrice')}><input required type="number" min="0" step="0.01" className={inputClass} value={price} onChange={(event) => setPrice(event.target.value)} /></Field>}
        {dictionary === 'lead-custom-fields' && <>
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label={t('crm.settings.colType')}>
              <CrmSelect value={fieldType} onChange={setFieldType} searchable={false} options={FIELD_TYPES.map((value) => ({ value, label: t(`crm.settings.fieldType.${value}`) }))} />
            </Field>
            <Field label={t('crm.settings.colOrder')}><input required type="number" min="0" step="1" className={inputClass} value={order} onChange={(event) => setOrder(event.target.value)} /></Field>
          </div>
          {['select', 'multiselect'].includes(fieldType) && <Field label={t('crm.settings.options')}><textarea required rows={5} className={inputClass} value={options} onChange={(event) => setOptions(event.target.value)} /></Field>}
          {fieldType === 'reference' && <Field label={t('crm.settings.reference')}>
            <CrmSelect value={reference} onChange={setReference} options={REFERENCES.map((value) => ({ value, label: t(`crm.settings.referenceEntity.${value}`) }))} />
          </Field>}
          <Field label={t('crm.settings.aliases')}><textarea rows={2} className={inputClass} value={aliases} onChange={(event) => setAliases(event.target.value)} /></Field>
        </>}
        {dictionary !== 'deal-types' && <Toggle checked={required} onChange={setRequired} label={t(`crm.settings.${key === 'reasons' ? 'reasons' : 'fields'}.required`)} hint={t(`crm.settings.${key === 'reasons' ? 'reasons' : 'fields'}.requiredHint`)} />}
        <Toggle checked={active} onChange={setActive} label={t('crm.settings.active')} hint={t('crm.settings.activeHint')} />
      </fieldset>
      {error && <ErrorNotice message={error} />}
      <div className="flex justify-end gap-2 border-t border-[#E6EAF1] pt-4">
        <AppButton variant="secondary" disabled={busy} onClick={onClose}>{t('crm.waManage.cancel')}</AppButton>
        <AppButton type="submit" disabled={busy || !name.trim()} isLoading={busy}>{t('crm.integrations.save')}</AppButton>
      </div>
    </form>
  </AppModal>
}
