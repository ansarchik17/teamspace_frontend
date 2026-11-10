import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Archive, Briefcase, Contact, Download, UserPlus } from 'lucide-react'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { useGrowyContext } from './growyShared'
import { EmptyState, ErrorNotice } from './growyUi'
import CrmImportWizard from './CrmImportWizard'
import CrmImportIssues from './CrmImportIssues'
import { ExportHistory, ImportHistory } from './CrmDataHistory'
import { Chip } from './crmTableCells'
import { TONES } from './crmTones'
import { EXPORT_ENTITIES, JOB_TONE, isRunning, type ExportEntity, type ExportJob, type ImportJob } from './crmDataFormat'

type Tab = 'import' | 'export'
const ENTITY_ICON = { lead: UserPlus, contact: Contact, deal: Briefcase, full: Archive }

export default function CrmDataPage() {
  const { t } = useTranslation('shell')
  const { repository, context, error: contextError, loading: contextLoading, retry } = useGrowyContext()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'export' ? 'export' : 'import'
  const enabled = Boolean(context?.modules.crm)
  const [imports, setImports] = useState<ImportJob[]>([])
  const [exports, setExports] = useState<ExportJob[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [importPage, setImportPage] = useState(1)
  const [exportPage, setExportPage] = useState(1)
  const [importHasNext, setImportHasNext] = useState(false)
  const [exportHasNext, setExportHasNext] = useState(false)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [notice, setNotice] = useState('')
  const [exportEntity, setExportEntity] = useState<ExportEntity>('lead')
  const [exportFormat, setExportFormat] = useState('xlsx')
  const [confirmRollback, setConfirmRollback] = useState<ImportJob | null>(null)
  const [selectedJob, setSelectedJob] = useState<ImportJob | null>(null)
  const [sourceNames, setSourceNames] = useState<Record<string, string>>({})
  const lock = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const load = async () => {
      const results = await Promise.allSettled([
        repository.collection<ImportJob>('crm/data-import/jobs/history/', importPage, controller.signal),
        repository.collection<ExportJob>('crm/data-export/jobs/history/', exportPage, controller.signal),
      ])
      if (controller.signal.aborted) return false
      const errors: string[] = []
      if (results[0].status === 'fulfilled') { setImports(results[0].value.results); setImportHasNext(results[0].value.hasNext) } else errors.push(growyErrorMessage(results[0].reason))
      if (results[1].status === 'fulfilled') { setExports(results[1].value.results); setExportHasNext(results[1].value.hasNext) } else errors.push(growyErrorMessage(results[1].reason))
      setHistoryError(errors.join(' · ')); setHistoryLoaded(true)
      return results.some((result) => result.status === 'fulfilled' && result.value.results.some((job) => isRunning(job.status)))
    }
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => { const active = await load(); if (!controller.signal.aborted && active) timer = setTimeout(() => void poll(), 15000) }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [repository, enabled, revision, importPage, exportPage])

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    repository.request<{ types: Array<{ entity: string | null; name: string }> }>('crm/data-import/types/', { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setSourceNames(Object.fromEntries(data.types.filter((item) => item.entity).map((item) => [item.entity as string, item.name]))) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [repository, enabled])

  const action = async (work: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await work() } catch (error) { setError(growyErrorMessage(error)) }
    finally { lock.current = false; setBusy(false) }
  }
  const switchTab = (next: Tab) => { const value = new URLSearchParams(params); value.set('tab', next); setParams(value) }
  const refresh = () => setRevision((value) => value + 1)
  const exportData = () => action(async () => {
    const result = await repository.request<{ job_id: number }>('crm/data-export/jobs/', { method: 'POST', body: JSON.stringify({ entity: exportEntity, file_format: exportFormat }) })
    setExportPage(1); refresh(); setNotice(t('crm.data.exportStarted', { id: result.job_id }))
  })
  const sourceLabel = (source: string) => sourceNames[source] || t(`crm.data.entity.${source}`, { defaultValue: source })
  const selectedTone = selectedJob ? TONES[JOB_TONE[selectedJob.status] || 'neutral'] : null

  return <section className={`flex min-w-0 w-full flex-1 flex-col bg-[#F6F7F9] px-4 pb-6 pt-6 text-[#17202E] md:px-6 xl:px-8 ${AXIS_UI.fontFamily}`}>
    <div className="shrink-0 pb-4">
      <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">{t('crm.data.title')}</h1>
      <p className="mt-0.5 text-[14px] text-[#586174]">{t('crm.data.subtitle')}{context?.tenant.name ? ` · ${context.tenant.name}` : ''}</p>
    </div>

    {contextLoading && <p role="status" className="py-10 text-center text-sm text-[#586174]">{t('crm.data.connecting')}</p>}
    {contextError && <ErrorNotice message={contextError} retry={retry} />}
    {context && !enabled && <EmptyState title={t('crm.data.disabledTitle')} description={t('crm.data.disabledText')} />}

    {enabled && <>
      <nav aria-label={t('crm.data.title')} className="mb-4 flex shrink-0 gap-5 overflow-x-auto border-b border-[#E2E5EA] [scrollbar-width:none]">
        {(['import', 'export'] as const).map((key) => <button key={key} type="button" aria-current={tab === key ? 'page' : undefined} onClick={() => switchTab(key)}
          className={`${AXIS_UI.tab} !h-9 ${tab === key ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}>{t(`crm.data.tab.${key}`)}</button>)}
      </nav>

      <div className="flex max-w-[1120px] flex-col gap-4">
        {error && !confirmRollback && <ErrorNotice message={error} />}
        {notice && <p role="status" className="rounded-xl border border-[#CFDCF8] bg-[#EDF2FF] px-4 py-3 text-[14px] text-[#173B91]">{notice}</p>}

        {tab === 'import' ? <>
          <CrmImportWizard repository={repository} enabled={enabled} busy={busy} action={action}
            onStarted={(runId) => { setImportPage(1); refresh(); setNotice(t('crm.data.importStarted', { id: runId })) }} />
          {historyError && <ErrorNotice message={historyError} retry={refresh} />}
          <ImportHistory jobs={imports} loading={!historyLoaded} busy={busy} page={importPage} hasNext={importHasNext} sourceLabel={sourceLabel}
            onPage={setImportPage}
            onOpen={(job) => void action(async () => { setSelectedJob(await repository.request<ImportJob>(`crm/data-import/${job.run_id}/`)) })}
            onErrors={(job) => void action(() => repository.download(`crm/data-import/${job.run_id}/errors.xlsx`, `import-${job.run_id}-errors.xlsx`))}
            onStop={(job) => void action(async () => { await repository.request(`crm/data-import/jobs/${job.run_id}/`, { method: 'DELETE' }); refresh() })}
            onRollback={(job) => { setError(''); setConfirmRollback(job) }} />
        </> : <>
          <section className="rounded-2xl border border-[#E6EAF1] bg-white">
            <header className="border-b border-[#E6EAF1] px-5 py-4 sm:px-6">
              <h2 className="text-[16px] font-semibold text-[#17202E]">{t('crm.data.exportTitle')}</h2>
              <p className="mt-0.5 text-[13px] text-[#586174]">{t('crm.data.exportText')}</p>
            </header>
            <fieldset disabled={busy} className="space-y-5 px-5 py-5 sm:px-6">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label={t('crm.data.exportSection')}>
                {EXPORT_ENTITIES.map((entity) => {
                  const Icon = ENTITY_ICON[entity]
                  const active = exportEntity === entity
                  return <label key={entity} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${active ? 'border-[#2458D3] bg-[#F5F8FF]' : 'border-[#E2E5EA] hover:border-[#C4C9D2]'}`}>
                    <input type="radio" name="export-entity" className="sr-only" checked={active} onChange={() => setExportEntity(entity)} />
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${active ? 'bg-[#2458D3] text-white' : 'bg-[#F1F2F4] text-[#586174]'}`}><Icon size={16} /></span>
                    <span className="min-w-0"><span className="block text-[14px] font-medium text-[#17202E]">{t(`crm.data.entity.${entity}`)}</span><span className="block text-[12px] leading-4 text-[#586174]">{t(`crm.data.entityHint.${entity}`)}</span></span>
                  </label>
                })}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="mb-2 block text-[13px] font-medium text-[#586174]">{t('crm.data.format')}</span>
                  {exportEntity === 'full' ? <span className="text-[14px] text-[#17202E]">ZIP</span>
                    : <div className="inline-flex rounded-[10px] bg-[#F1F2F4] p-0.5" role="radiogroup" aria-label={t('crm.data.format')}>
                      {[['xlsx', 'Excel'], ['csv', 'CSV']].map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={exportFormat === value}
                        className={`h-8 rounded-[8px] px-4 text-[13px] font-medium transition-colors ${AXIS_UI.focus} ${exportFormat === value ? 'bg-white text-[#17202E] shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#586174] hover:text-[#17202E]'}`}
                        onClick={() => setExportFormat(value)}>{label}</button>)}
                    </div>}
                </div>
                <AppButton isLoading={busy} onClick={() => void exportData()}><Download size={16} />{t('crm.data.prepare')}</AppButton>
              </div>
            </fieldset>
          </section>
          {historyError && <ErrorNotice message={historyError} retry={refresh} />}
          <ExportHistory jobs={exports} loading={!historyLoaded} busy={busy} page={exportPage} hasNext={exportHasNext} onPage={setExportPage}
            onDownload={(job) => void action(() => repository.download(`crm/data-export/jobs/${job.job_id}/download/`, `crm-${job.entity}-${job.job_id}.${job.file_format}`))} />
        </>}
      </div>
    </>}

    {selectedJob && selectedTone && <AppModal maxWidth={640} title={t('crm.data.jobTitle', { id: selectedJob.run_id })} onClose={() => setSelectedJob(null)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-[14px] text-[#465066]">
          <Chip label={t(`crm.data.status.${selectedJob.status}`, { defaultValue: selectedJob.status })} bg={selectedTone.bg} color={selectedTone.color} dot={selectedTone.color} />
          <span>{sourceLabel(selectedJob.source)}</span>
          {selectedJob.progress?.total ? <span className="tabular-nums">{selectedJob.progress.processed || 0} / {selectedJob.progress.total}</span> : null}
        </div>
        {selectedJob.issues?.length ? <CrmImportIssues issues={selectedJob.issues} /> : <p className="text-[14px] text-[#586174]">{t('crm.data.noIssues')}</p>}
        <div className="flex justify-end gap-2">
          <AppButton variant="secondary" disabled={busy} onClick={() => void action(() => repository.download(`crm/data-import/${selectedJob.run_id}/errors.xlsx`, `import-${selectedJob.run_id}-errors.xlsx`))}><Download size={16} />{t('crm.data.errorsExcel')}</AppButton>
          <AppButton onClick={() => setSelectedJob(null)}>{t('crm.data.close')}</AppButton>
        </div>
      </div>
    </AppModal>}

    {confirmRollback && <AppModal title={t('crm.data.rollbackTitle', { id: confirmRollback.run_id })} onClose={() => { if (!busy) setConfirmRollback(null) }}>
      <p className="mb-4 text-[14px] text-[#465066]">{t('crm.data.rollbackText')}</p>
      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}
      <div className="flex justify-end gap-2">
        <AppButton variant="secondary" disabled={busy} onClick={() => setConfirmRollback(null)}>{t('crm.waManage.cancel')}</AppButton>
        <AppButton variant="danger" isLoading={busy} onClick={() => void action(async () => {
          await repository.request(`crm/data-import/${confirmRollback.run_id}/rollback/`, { method: 'POST', body: JSON.stringify({ dry_run: false }) })
          setConfirmRollback(null); refresh(); setNotice(t('crm.data.rollbackDone'))
        })}>{t('crm.data.rollback')}</AppButton>
      </div>
    </AppModal>}
  </section>
}
