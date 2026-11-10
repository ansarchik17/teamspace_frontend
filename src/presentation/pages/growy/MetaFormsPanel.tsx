import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileText } from 'lucide-react'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import { EmptyState, ErrorNotice } from './growyUi'
import { Chip } from './crmTableCells'
import { TONES, type ToneName } from './crmTones'

interface MetaForm { id: string; name?: string; status?: string; leads_count?: number }
const GRID = 'grid grid-cols-[minmax(220px,1.6fr)_140px_100px_170px] items-center gap-4'
const FORM_TONE: Record<string, ToneName> = { ACTIVE: 'success', ARCHIVED: 'neutral', DELETED: 'error', DRAFT: 'neutral' }

export default function MetaFormsPanel({ repository, pageId }: { repository: HttpGrowyPlatformRepository; pageId: string }) {
  const { t } = useTranslation('shell')
  const [forms, setForms] = useState<MetaForm[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const locked = useRef(false)
  const generation = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    const timer = window.setTimeout(() => {
      setLoading(true); setForms([]); setError(''); setNotice('')
      repository.request<{ forms: MetaForm[] }>(`integrations/meta/forms/?${new URLSearchParams({ page_id: pageId })}`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setForms(result.forms) })
        .catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 150)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, pageId])
  const importLeads = async (form: MetaForm) => {
    if (locked.current) return
    const current = generation.current
    locked.current = true; setBusy(form.id); setError(''); setNotice('')
    try {
      const result = await repository.request<{ imported?: number; created?: number; updated?: number }>('integrations/meta/backfill/', { method: 'POST', body: JSON.stringify({ page_id: pageId, form_id: form.id }) })
      if (current === generation.current) setNotice(result.imported != null
        ? t('crm.integrations.formImported', { name: form.name || form.id, count: result.imported })
        : t('crm.integrations.formDone', { name: form.name || form.id }))
    } catch (error) { if (current === generation.current) setError(growyErrorMessage(error)) }
    finally { locked.current = false; setBusy(null) }
  }
  const statusLabel = (status?: string) => {
    const value = (status || '').toUpperCase()
    return value in FORM_TONE ? t(`crm.integrations.formStatus.${value.toLowerCase() as 'active' | 'archived' | 'deleted' | 'draft'}`) : status || '—'
  }

  return <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white">
    <header className="border-b border-[#E6EAF1] px-6 py-4">
      <h2 className="text-[16px] font-semibold text-[#17202E]">{t('crm.integrations.formsTitle')}</h2>
      <p className="mt-0.5 text-[13px] text-[#586174]">{t('crm.integrations.formsText')}</p>
    </header>
    {(error || notice) && <div className="space-y-2 border-b border-[#E6EAF1] px-6 py-3">
      {error && <ErrorNotice message={error} />}
      {notice && <p role="status" className="rounded-xl border border-[#CFDCF8] bg-[#EDF2FF] px-4 py-3 text-[14px] text-[#173B91]">{notice}</p>}
    </div>}
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <div className="min-w-[680px]" role="table">
        <div className={`${GRID} h-11 border-b border-[#E6EAF1] bg-[#FAFBFC] px-6 text-[13px] font-medium text-[#586174]`} role="row">
          <span role="columnheader">{t('crm.integrations.colForm')}</span>
          <span role="columnheader">{t('crm.integrations.colStatus')}</span>
          <span role="columnheader" className="text-right">{t('crm.integrations.colLeads')}</span>
          <span role="columnheader" className="text-right">{t('crm.table.actions')}</span>
        </div>
        {loading ? Array.from({ length: 3 }, (_, index) => <div key={index} className={`${GRID} h-[60px] border-b border-[#EEF0F3] px-6 last:border-b-0`} aria-hidden>
          <span className="h-3.5 w-48 animate-pulse rounded bg-[#EEF0F3]" /><span className="h-3.5 w-20 animate-pulse rounded bg-[#EEF0F3]" /><span className="ml-auto h-3.5 w-8 animate-pulse rounded bg-[#EEF0F3]" /><span />
        </div>) : forms.length === 0 ? <EmptyState title={t('crm.integrations.formsEmptyTitle')} description={t('crm.integrations.formsEmptyText')} />
          : forms.map((form) => {
            const tone = TONES[FORM_TONE[(form.status || '').toUpperCase()] || 'neutral']
            return <div key={form.id} role="row" className={`${GRID} h-[60px] border-b border-[#EEF0F3] px-6 text-[14px] text-[#465066] last:border-b-0`}>
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]"><FileText size={16} /></span>
                <span className="min-w-0"><span className="block truncate font-semibold text-[#17202E]">{form.name || form.id}</span><span className="block truncate text-[12px] text-[#586174]">ID {form.id}</span></span>
              </div>
              <div role="cell" className="min-w-0"><Chip label={statusLabel(form.status)} bg={tone.bg} color={tone.color} dot={tone.color} /></div>
              <div role="cell" className="text-right tabular-nums">{form.leads_count ?? '—'}</div>
              <div role="cell" className="flex justify-end">
                <AppButton variant="secondary" size="compact" disabled={busy !== null} isLoading={busy === form.id} onClick={() => void importLeads(form)}><Download size={16} />{t('crm.integrations.loadLeads')}</AppButton>
              </div>
            </div>
          })}
      </div>
    </div>
  </section>
}
