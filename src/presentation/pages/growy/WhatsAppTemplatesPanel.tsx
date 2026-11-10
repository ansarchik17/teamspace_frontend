import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquareText, Search, Send } from 'lucide-react'
import type { WhatsAppTemplate } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { Chip } from './crmTableCells'
import { EmptyState } from './growyUi'
import {
  KIND_TONE, TEMPLATE_STATE_TONE, TONES, languageLabel, shortDate, templateKind, templateParts, templateState,
  templateUpdated, templateVariables, type TemplateKind,
} from './whatsAppManageFormat'

const GRID = 'grid grid-cols-[minmax(220px,1.6fr)_130px_64px_140px_96px] items-center gap-4'
const FILTERS: Array<Exclude<TemplateKind, 'other'> | 'all'> = ['all', 'marketing', 'utility', 'authentication']
const chipClass = (active: boolean) => `inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${AXIS_UI.focus} ${active ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#586174] hover:border-[#C4C9D2] hover:text-[#17202E]'}`

export default function WhatsAppTemplatesPanel({ templates, loading, onUse }: {
  templates: WhatsAppTemplate[]
  loading: boolean
  onUse: (template: WhatsAppTemplate, values: Record<number, string>) => void
}) {
  const { t, i18n } = useTranslation('shell')
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<TemplateKind | 'all'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [values, setValues] = useState<{ id: string; map: Record<number, string> }>({ id: '', map: {} })

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return templates.filter((template) => (kind === 'all' || templateKind(template.category) === kind)
      && (!query || template.name.toLowerCase().includes(query) || (template.content?.text || '').toLowerCase().includes(query)))
  }, [templates, search, kind])
  const selected = filtered.find((template) => String(template.id) === selectedId) || filtered[0] || null
  const selectedKey = selected ? String(selected.id) : ''
  const map = values.id === selectedKey ? values.map : {}
  const variables = selected ? templateVariables(selected.content?.text) : []
  const approved = selected ? templateState(selected.status) === 'approved' : false
  const stateLabel = (status: string) => {
    const state = templateState(status)
    return state === 'other' ? status : t(`crm.waManage.templateState.${state}`)
  }
  const kindLabel = (category?: string) => {
    const value = templateKind(category)
    return value === 'other' ? category || '—' : t(`crm.waManage.kind.${value}`)
  }

  return <div className="flex min-h-0 flex-1 flex-col max-xl:flex-none">
    <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
      <label className={`${AXIS_UI.inputShell} w-full sm:w-[280px]`}>
        <Search size={16} className="shrink-0 text-[#586174]" />
        <input type="search" className={AXIS_UI.input} aria-label={t('crm.waManage.searchLabel')} placeholder={t('crm.waManage.searchPlaceholder')}
          value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <div className="flex max-w-full items-center gap-1 overflow-x-auto" aria-label={t('crm.waManage.categoryFilter')}>
        {FILTERS.map((item) => <button key={item} type="button" aria-pressed={kind === item} className={chipClass(kind === item)}
          onClick={() => setKind(item)}>{t(`crm.waManage.kindFilter.${item}`)}</button>)}
      </div>
    </div>

    <div className="flex min-h-0 flex-1 flex-col gap-4 max-xl:flex-none xl:flex-row">
      <section className="flex min-h-[320px] min-w-0 flex-1 flex-col overflow-hidden max-xl:flex-none rounded-2xl border border-[#E6EAF1] bg-white">
        <div className="min-h-0 flex-1 overflow-auto [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin]">
          <div className="min-w-[680px]" role="table">
            <div className={`${GRID} sticky top-0 z-10 h-11 border-b border-[#E6EAF1] bg-[#FAFBFC] px-6 text-[13px] font-medium text-[#586174]`} role="row">
              <span role="columnheader">{t('crm.waManage.colTemplate')}</span>
              <span role="columnheader">{t('crm.waManage.colCategory')}</span>
              <span role="columnheader">{t('crm.waManage.colLanguage')}</span>
              <span role="columnheader">{t('crm.waManage.colStatus')}</span>
              <span role="columnheader">{t('crm.waManage.colUpdated')}</span>
            </div>
            {loading ? Array.from({ length: 6 }, (_, index) => <div key={index} className={`${GRID} h-[60px] border-b border-[#EEF0F3] px-6`} aria-hidden>
              <span className="flex items-center gap-3"><span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#EEF0F3]" /><span className="h-3.5 w-40 animate-pulse rounded bg-[#EEF0F3]" /></span>
              <span className="h-3.5 w-20 animate-pulse rounded bg-[#EEF0F3]" /><span className="h-3.5 w-8 animate-pulse rounded bg-[#EEF0F3]" />
              <span className="h-3.5 w-20 animate-pulse rounded bg-[#EEF0F3]" /><span className="h-3.5 w-14 animate-pulse rounded bg-[#EEF0F3]" />
            </div>) : filtered.length === 0 ? <EmptyState
              title={templates.length ? t('crm.waManage.notFoundTitle') : t('crm.waManage.emptyTemplatesTitle')}
              description={templates.length ? t('crm.waManage.notFoundText') : t('crm.waManage.emptyTemplatesText')} />
              : filtered.map((template) => {
                const active = String(template.id) === selectedKey
                const state = templateState(template.status)
                const kindTone = TONES[KIND_TONE[templateKind(template.category)]]
                const stateTone = TONES[TEMPLATE_STATE_TONE[state]]
                return <div key={template.id} role="row" tabIndex={0} aria-selected={active}
                  className={`${GRID} h-[60px] cursor-pointer border-b border-[#EEF0F3] px-6 text-[14px] text-[#465066] transition-colors duration-[120ms] ${AXIS_UI.focus} ${active ? 'bg-[#F7F9FF] shadow-[inset_3px_0_0_#2458D3]' : 'hover:bg-[#F8F9FB]'}`}
                  onClick={() => setSelectedId(String(template.id))}
                  onKeyDown={(event) => { if (event.key === 'Enter') setSelectedId(String(template.id)) }}>
                  <div role="cell" className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF8F1] text-[#16734B]"><MessageSquareText size={16} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[#17202E]">{template.name}</span>
                      <span className="block truncate text-[12px] text-[#586174]">{template.content?.text || '—'}</span>
                    </span>
                  </div>
                  <div role="cell" className="min-w-0"><Chip label={kindLabel(template.category)} bg={kindTone.bg} color={kindTone.color} /></div>
                  <div role="cell">{languageLabel(template.language)}</div>
                  <div role="cell" className="min-w-0"><Chip label={stateLabel(template.status)} bg={stateTone.bg} color={stateTone.color} dot={stateTone.color} /></div>
                  <div role="cell" className="text-[13px] tabular-nums">{shortDate(templateUpdated(template), i18n.language)}</div>
                </div>
              })}
          </div>
        </div>
        <footer className="flex h-14 shrink-0 items-center border-t border-[#E6EAF1] px-6 text-[13px] text-[#465066]">
          <span className="tabular-nums">{t('crm.waManage.templatesCount', { count: filtered.length })}</span>
        </footer>
      </section>

      {selected && !loading && <aside aria-label={t('crm.waManage.preview')} className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white xl:w-[340px]">
        <div className="border-b border-[#E6EAF1] px-5 py-4">
          <div className="truncate text-[15px] font-semibold text-[#17202E]">{selected.name}</div>
          <div className="mt-0.5 text-[13px] text-[#586174]">{[kindLabel(selected.category), languageLabel(selected.language), stateLabel(selected.status)].join(' · ')}</div>
        </div>
        <div className="flex min-h-[160px] flex-1 flex-col gap-1.5 overflow-auto bg-[#EFEAE2] p-5">
          <div className="max-w-[280px] self-start whitespace-pre-wrap break-words rounded-[4px_12px_12px_12px] bg-white px-3 py-2.5 text-[14px] leading-5 text-[#17202E] shadow-[0_1px_1px_rgba(16,24,40,0.08)]">
            {selected.content?.text ? templateParts(selected.content.text).map((part, index) => part.variable === null ? <span key={index}>{part.text}</span>
              : <span key={index} className="rounded px-1 bg-[#EDF2FF] text-[#2458D3]">{map[part.variable]?.trim() || part.text}</span>)
              : <span className="text-[#586174]">{t('crm.waManage.noText')}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2.5 border-t border-[#E6EAF1] px-5 py-4">
          {variables.length > 0 && <>
            <span className="text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-[#586174]">{t('crm.waManage.variables')}</span>
            {variables.map((index) => <label key={index} className="grid grid-cols-[44px_1fr] items-center gap-2 text-[13px] text-[#586174]">
              <span className="tabular-nums">{`{{${index}}}`}</span>
              <input className={`${AXIS_UI.inputShell} !h-8 text-[13px] text-[#17202E] outline-none`} aria-label={t('crm.waManage.variableValue', { index })}
                placeholder={t('crm.waManage.variablePlaceholder')} value={map[index] || ''}
                onChange={(event) => setValues({ id: selectedKey, map: { ...map, [index]: event.target.value } })} />
            </label>)}
          </>}
          <button type="button" className={`${AXIS_UI.secondaryButton} mt-1 w-full justify-center`} disabled={!approved} onClick={() => onUse(selected, map)}>
            <Send size={16} />{t('crm.waManage.useInBroadcast')}
          </button>
          {!approved && <p className="text-[12px] leading-4 text-[#586174]">{t('crm.waManage.useHint')}</p>}
        </div>
      </aside>}
    </div>
  </div>
}
