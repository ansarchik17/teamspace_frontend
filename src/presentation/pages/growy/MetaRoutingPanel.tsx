import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, Pencil, Plus } from 'lucide-react'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { EmptyState, ErrorNotice, Field } from './growyUi'
import { inputClass } from './growyShared'
import { CRM_ROW_ICON } from './CrmRecordTable'
import { Chip } from './crmTableCells'
import { TONES } from './crmTones'
import CrmSelect from './CrmSelect'

interface Rule { id: number; source_level: string; source_external_id: string; source_name: string; branch: number | null; branch_name: string; course?: number | null; is_active: boolean }
interface Branch { id: number; name: string }
const LEVELS = ['form', 'campaign', 'ad_account', 'meta_account'] as const
type Level = typeof LEVELS[number]
const GRID = 'grid grid-cols-[minmax(220px,1.6fr)_150px_minmax(140px,1fr)_120px_64px] items-center gap-4'

export default function MetaRoutingPanel({ repository }: { repository: HttpGrowyPlatformRepository }) {
  const { t } = useTranslation('shell')
  const [rules, setRules] = useState<Rule[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState<Rule | 'new' | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const result = await repository.request<{ results: Rule[] }>('integrations/meta/routing-rules/', { signal: controller.signal })
        if (!controller.signal.aborted) { setRules(result.results); setError(''); setLoaded(true) }
        let page = 1
        const locations: Branch[] = []
        while (!controller.signal.aborted) {
          const result = await repository.collection<Branch>('crm/reference-branches/', page, controller.signal)
          locations.push(...result.results)
          if (!result.hasNext) break
          page += 1
        }
        if (!controller.signal.aborted) setBranches(locations)
      } catch (error) { if (!controller.signal.aborted) { setError(growyErrorMessage(error)); setLoaded(true) } }
    }
    void load()
    return () => controller.abort()
  }, [repository, revision])
  const levelLabel = (level: string) => LEVELS.includes(level as Level) ? t(`crm.integrations.level.${level as Level}`) : level

  return <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E6EAF1] px-6 py-4">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold text-[#17202E]">{t('crm.integrations.routingTitle')}</h2>
        <p className="mt-0.5 max-w-[640px] text-[13px] text-[#586174]">{t('crm.integrations.routingText')}</p>
      </div>
      <button type="button" className={AXIS_UI.secondaryButton} onClick={() => setEditor('new')}><Plus size={16} />{t('crm.integrations.addRule')}</button>
    </header>
    {error && <div className="border-b border-[#E6EAF1] px-6 py-3"><ErrorNotice message={error} retry={() => setRevision((value) => value + 1)} /></div>}
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <div className="min-w-[720px]" role="table">
        <div className={`${GRID} h-11 border-b border-[#E6EAF1] bg-[#FAFBFC] px-6 text-[13px] font-medium text-[#586174]`} role="row">
          <span role="columnheader">{t('crm.integrations.colSource')}</span>
          <span role="columnheader">{t('crm.integrations.colLevel')}</span>
          <span role="columnheader">{t('crm.integrations.colBranch')}</span>
          <span role="columnheader">{t('crm.integrations.colStatus')}</span>
          <span role="columnheader" />
        </div>
        {!loaded ? Array.from({ length: 2 }, (_, index) => <div key={index} className={`${GRID} h-[60px] border-b border-[#EEF0F3] px-6 last:border-b-0`} aria-hidden>
          <span className="h-3.5 w-44 animate-pulse rounded bg-[#EEF0F3]" /><span className="h-3.5 w-20 animate-pulse rounded bg-[#EEF0F3]" /><span className="h-3.5 w-24 animate-pulse rounded bg-[#EEF0F3]" /><span className="h-3.5 w-16 animate-pulse rounded bg-[#EEF0F3]" /><span />
        </div>) : rules.length === 0 ? (error ? null : <EmptyState title={t('crm.integrations.rulesEmptyTitle')} description={t('crm.integrations.rulesEmptyText')} />)
          : rules.map((rule) => {
            const tone = rule.is_active ? TONES.success : TONES.neutral
            return <div key={rule.id} role="row" tabIndex={0} onClick={() => setEditor(rule)} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') setEditor(rule) }}
              className={`${GRID} h-[60px] cursor-pointer border-b border-[#EEF0F3] px-6 text-[14px] text-[#465066] last:border-b-0 hover:bg-[#F8F9FB] ${AXIS_UI.focus}`}>
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#586174]"><GitBranch size={16} /></span>
                <span className="min-w-0"><span className="block truncate font-semibold text-[#17202E]">{rule.source_name || rule.source_external_id}</span><span className="block truncate text-[12px] text-[#586174]">ID {rule.source_external_id}</span></span>
              </div>
              <div role="cell" className="truncate">{levelLabel(rule.source_level)}</div>
              <div role="cell" className="truncate">{rule.branch_name || <span className="text-[#8A93A3]">{t('crm.integrations.noBranch')}</span>}</div>
              <div role="cell" className="min-w-0"><Chip label={rule.is_active ? t('crm.integrations.active') : t('crm.integrations.inactive')} bg={tone.bg} color={tone.color} dot={tone.color} /></div>
              <div role="cell" className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                <button type="button" className={CRM_ROW_ICON} title={t('crm.integrations.editRule')} aria-label={`${t('crm.integrations.editRule')}: ${rule.source_name || rule.source_external_id}`} onClick={() => setEditor(rule)}><Pencil size={16} /></button>
              </div>
            </div>
          })}
      </div>
    </div>
    {editor && <RuleForm key={editor === 'new' ? 'new' : editor.id} repository={repository} branches={branches} rule={editor === 'new' ? undefined : editor}
      onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setRevision((value) => value + 1) }} />}
  </section>
}

function RuleForm({ repository, branches, rule, onClose, onSaved }: { repository: HttpGrowyPlatformRepository; branches: Branch[]; rule?: Rule; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation('shell')
  const [level, setLevel] = useState(rule?.source_level || 'form')
  const [source, setSource] = useState(rule?.source_external_id || '')
  const [name, setName] = useState(rule?.source_name || '')
  const [branch, setBranch] = useState(String(rule?.branch || ''))
  const [active, setActive] = useState(rule?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try { await repository.request(`integrations/meta/routing-rules/${rule ? `${rule.id}/` : ''}`, { method: rule ? 'PATCH' : 'POST', body: JSON.stringify({ source_level: level, source_external_id: source.trim(), source_name: name.trim(), branch: branch ? Number(branch) : null, is_active: active }) }); onSaved() }
    catch (error) { setError(growyErrorMessage(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  return <AppModal title={rule ? t('crm.integrations.editRule') : t('crm.integrations.newRule')} onClose={() => { if (!busy) onClose() }}>
    <form className="grid gap-4" onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy} className="grid gap-4">
        <Field label={t('crm.integrations.colLevel')}>
          <CrmSelect value={level} onChange={setLevel} options={LEVELS.map((key) => ({ value: key, label: t(`crm.integrations.level.${key}`) }))} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('crm.integrations.sourceId')}><input required maxLength={128} className={inputClass} value={source} onChange={(event) => setSource(event.target.value)} /></Field>
          <Field label={t('crm.integrations.sourceName')}><input maxLength={255} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></Field>
        </div>
        <Field label={t('crm.integrations.colBranch')}>
          <CrmSelect required={!rule?.course} value={branch} onChange={setBranch} placeholder={t('crm.integrations.branchPlaceholder')}
            options={[
              ...(branch && !branches.some((item) => String(item.id) === branch) ? [{ value: branch, label: rule?.branch_name || t('crm.integrations.currentBranch') }] : []),
              ...branches.map((item) => ({ value: String(item.id), label: item.name })),
            ]} />
        </Field>
        <label className="flex items-center gap-2 text-[14px] text-[#17202E]"><input type="checkbox" className="h-4 w-4 accent-[#2458D3]" checked={active} onChange={(event) => setActive(event.target.checked)} />{t('crm.integrations.ruleActive')}</label>
      </fieldset>
      {error && <ErrorNotice message={error} />}
      <div className="flex justify-end gap-2 border-t border-[#E6EAF1] pt-4">
        <AppButton variant="secondary" disabled={busy} onClick={onClose}>{t('crm.waManage.cancel')}</AppButton>
        <AppButton type="submit" disabled={busy} isLoading={busy}>{t('crm.integrations.save')}</AppButton>
      </div>
    </form>
  </AppModal>
}
