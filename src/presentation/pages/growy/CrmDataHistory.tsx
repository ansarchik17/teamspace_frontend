import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Download, FileDown, FileUp, MoreHorizontal, RotateCcw, Square } from 'lucide-react'
import FloatingMenu, { floatingMenuDangerClass, floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { CRM_ROW_ICON } from './CrmRecordTable'
import { Chip } from './crmTableCells'
import { EmptyState } from './growyUi'
import { dateLabel } from './growyShared'
import { TONES } from './crmTones'
import { JOB_TONE, isRunning, type ExportJob, type ImportJob } from './crmDataFormat'

const PAGER = `flex h-8 w-8 items-center justify-center rounded-[8px] text-[#465066] hover:bg-[#F1F3F6] disabled:text-[#B4BAC5] disabled:hover:bg-transparent ${AXIS_UI.focus}`

function HistoryShell({ title, grid, minWidth, headers, loading, empty, page, hasNext, onPage, children }: {
  title: string; grid: string; minWidth: string; headers: Array<{ label: string; right?: boolean }>
  loading: boolean; empty: { title: string; text: string } | null; page: number; hasNext: boolean; onPage: (page: number) => void; children: ReactNode
}) {
  const { t } = useTranslation('shell')
  return <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white">
    <h2 className="border-b border-[#E6EAF1] px-6 py-4 text-[16px] font-semibold text-[#17202E]">{title}</h2>
    <div className="overflow-x-auto [scrollbar-width:thin]">
      <div className={minWidth} role="table">
        <div className={`${grid} h-11 border-b border-[#E6EAF1] bg-[#FAFBFC] px-6 text-[13px] font-medium text-[#586174]`} role="row">
          {headers.map((header, index) => <span key={index} role="columnheader" className={header.right ? 'text-right' : ''}>{header.label}</span>)}
        </div>
        {loading ? Array.from({ length: 3 }, (_, index) => <div key={index} className={`${grid} h-[60px] border-b border-[#EEF0F3] px-6`} aria-hidden>
          {headers.map((_, cell) => <span key={cell} className={`h-3.5 animate-pulse rounded bg-[#EEF0F3] ${cell === 0 ? 'w-36' : 'w-16'}`} />)}
        </div>) : empty ? <EmptyState title={empty.title} description={empty.text} /> : children}
      </div>
    </div>
    <footer className="flex h-14 shrink-0 items-center justify-between gap-2 border-t border-[#E6EAF1] px-6 text-[13px] text-[#465066]">
      <span className="tabular-nums">{t('crm.data.page', { page })}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={PAGER} aria-label={t('crm.table.prev')} disabled={page === 1 || loading} onClick={() => onPage(page - 1)}><ChevronLeft size={18} /></button>
        <span className="flex h-8 min-w-8 items-center justify-center rounded-[8px] border border-[#2458D3] bg-[#EDF2FF] px-2 font-medium tabular-nums text-[#2458D3]">{page}</span>
        <button type="button" className={PAGER} aria-label={t('crm.table.next')} disabled={!hasNext || loading} onClick={() => onPage(page + 1)}><ChevronRight size={18} /></button>
      </div>
    </footer>
  </section>
}

function StatusChip({ status }: { status: string }) {
  const { t } = useTranslation('shell')
  const tone = TONES[JOB_TONE[status] || 'neutral']
  return <Chip label={t(`crm.data.status.${status}`, { defaultValue: status })} bg={tone.bg} color={tone.color} dot={tone.color} />
}

const IMPORT_GRID = 'grid grid-cols-[minmax(180px,1.4fr)_170px_minmax(150px,1fr)_130px_88px] items-center gap-4'

export function ImportHistory({ jobs, loading, busy, page, hasNext, sourceLabel, onPage, onOpen, onErrors, onStop, onRollback }: {
  jobs: ImportJob[]; loading: boolean; busy: boolean; page: number; hasNext: boolean
  sourceLabel: (source: string) => string; onPage: (page: number) => void
  onOpen: (job: ImportJob) => void; onErrors: (job: ImportJob) => void; onStop: (job: ImportJob) => void; onRollback: (job: ImportJob) => void
}) {
  const { t } = useTranslation('shell')
  const [menu, setMenu] = useState<{ anchor: HTMLElement; job: ImportJob } | null>(null)
  return <HistoryShell title={t('crm.data.importHistory')} grid={IMPORT_GRID} minWidth="min-w-[760px]" loading={loading} page={page} hasNext={hasNext} onPage={onPage}
    empty={jobs.length ? null : { title: t('crm.data.importEmptyTitle'), text: t('crm.data.importEmptyText') }}
    headers={[{ label: t('crm.data.colImport') }, { label: t('crm.data.colStatus') }, { label: t('crm.data.colProgress') }, { label: t('crm.data.colDate') }, { label: t('crm.table.actions'), right: true }]}>
    {jobs.map((job) => {
      const total = job.progress?.total || 0
      const processed = job.progress?.processed || 0
      const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : 0
      return <div key={job.run_id} role="row" tabIndex={0} onClick={() => onOpen(job)} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') onOpen(job) }}
        className={`${IMPORT_GRID} h-[60px] cursor-pointer border-b border-[#EEF0F3] px-6 text-[14px] text-[#465066] last:border-b-0 hover:bg-[#F8F9FB] ${AXIS_UI.focus}`}>
        <div role="cell" className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]"><FileUp size={16} /></span>
          <span className="min-w-0"><span className="block truncate font-semibold text-[#17202E]">{sourceLabel(job.source)}</span><span className="block text-[12px] text-[#586174]">№ {job.run_id}</span></span>
        </div>
        <div role="cell" className="min-w-0"><StatusChip status={job.status} /></div>
        <div role="cell" className="min-w-0">
          {total ? <>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#EEF0F3]"><span className="block h-full rounded-full bg-[#2458D3]" style={{ width: `${percent}%` }} /></div>
            <div className="mt-1 text-[12px] tabular-nums text-[#586174]">{processed} / {total}{job.progress?.failed ? <span className="text-[#C03437]"> · {t('crm.data.failed', { count: job.progress.failed })}</span> : null}</div>
          </> : <span className="text-[#8A93A3]">—</span>}
        </div>
        <div role="cell" className="text-[13px] tabular-nums">{dateLabel(job.created_at)}</div>
        <div role="cell" className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
          <button type="button" className={CRM_ROW_ICON} disabled={busy} title={t('crm.data.errorsExcel')} aria-label={`${t('crm.data.errorsExcel')}: № ${job.run_id}`} onClick={() => onErrors(job)}><Download size={17} /></button>
          {(isRunning(job.status) || job.can_rollback) && <button type="button" className={CRM_ROW_ICON} disabled={busy} title={t('crm.table.more')} aria-label={`${t('crm.table.more')}: № ${job.run_id}`} aria-haspopup="menu"
            onClick={(event) => setMenu({ anchor: event.currentTarget, job })}><MoreHorizontal size={18} /></button>}
        </div>
      </div>
    })}
    <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={() => setMenu(null)} className="w-[220px]">
      {menu && isRunning(menu.job.status) && <button type="button" role="menuitem" className={floatingMenuItemClass} disabled={menu.job.cancel_requested}
        onClick={() => { const job = menu.job; setMenu(null); onStop(job) }}><Square size={15} />{t('crm.data.stop')}</button>}
      {menu?.job.can_rollback && <button type="button" role="menuitem" className={floatingMenuDangerClass}
        onClick={() => { const job = menu.job; setMenu(null); onRollback(job) }}><RotateCcw size={16} />{t('crm.data.rollback')}</button>}
    </FloatingMenu>
  </HistoryShell>
}

const EXPORT_GRID = 'grid grid-cols-[minmax(180px,1.4fr)_90px_170px_130px_88px] items-center gap-4'

export function ExportHistory({ jobs, loading, busy, page, hasNext, onPage, onDownload }: {
  jobs: ExportJob[]; loading: boolean; busy: boolean; page: number; hasNext: boolean; onPage: (page: number) => void; onDownload: (job: ExportJob) => void
}) {
  const { t } = useTranslation('shell')
  return <HistoryShell title={t('crm.data.exportHistory')} grid={EXPORT_GRID} minWidth="min-w-[700px]" loading={loading} page={page} hasNext={hasNext} onPage={onPage}
    empty={jobs.length ? null : { title: t('crm.data.exportEmptyTitle'), text: t('crm.data.exportEmptyText') }}
    headers={[{ label: t('crm.data.colExport') }, { label: t('crm.data.colFormat') }, { label: t('crm.data.colStatus') }, { label: t('crm.data.colDate') }, { label: t('crm.table.actions'), right: true }]}>
    {jobs.map((job) => <div key={job.job_id} role="row" className={`${EXPORT_GRID} min-h-[60px] border-b border-[#EEF0F3] px-6 py-2 text-[14px] text-[#465066] last:border-b-0`}>
      <div role="cell" className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF8F1] text-[#16734B]"><FileDown size={16} /></span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[#17202E]">{t(`crm.data.entity.${job.entity}`, { defaultValue: job.entity })}</span>
          <span className="block truncate text-[12px] text-[#586174]">{job.error_message ? <span className="text-[#C03437]">{job.error_message}</span> : `№ ${job.job_id}`}</span>
        </span>
      </div>
      <div role="cell" className="uppercase">{job.file_format}</div>
      <div role="cell" className="min-w-0"><StatusChip status={job.status} /></div>
      <div role="cell" className="text-[13px] tabular-nums">{dateLabel(job.created_at)}</div>
      <div role="cell" className="flex justify-end">
        {job.status === 'completed' && <button type="button" className={CRM_ROW_ICON} disabled={busy} title={t('crm.data.download')} aria-label={`${t('crm.data.download')}: № ${job.job_id}`}
          onClick={() => onDownload(job)}><Download size={17} /></button>}
      </div>
    </div>)}
  </HistoryShell>
}
