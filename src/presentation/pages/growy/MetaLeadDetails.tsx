import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CircleDot, Clock3, ExternalLink, FileText, Globe, Mail, Megaphone, Phone, UserRound, X } from 'lucide-react'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import AxisAvatar from '../../components/board/AxisAvatar'
import CrmAssigneePicker from './CrmAssigneePicker'
import CrmSelect from './CrmSelect'
import { ErrorNotice } from './growyUi'
import { dateLabel, inputClass } from './growyShared'

interface Lead { id: number; full_name: string; phone: string; email: string; status: string; notes: string; assigned_to: { id: number; full_name?: string; name?: string } | null; crm_lead_id?: number; form_name?: string; campaign_name?: string; platform?: string; lead_created_at?: string; source_page?: { id: number; page_name: string }; raw_field_data?: { name?: string; values?: unknown[] }[] }
const STATUSES = ['new', 'in_progress', 'won', 'lost'] as const
const HEADER_ICON = 'flex h-8 w-8 items-center justify-center rounded-lg text-[#3C3C43] transition hover:bg-[#F3F4F6]'
const initialsOf = (value: string) => value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
    <dt className="flex min-h-7 items-center gap-2 text-[13px] text-[#8E8E93]"><span className="flex shrink-0 text-[#AEAEB2]">{icon}</span><span className="truncate">{label}</span></dt>
    <dd className="flex min-h-7 min-w-0 items-center text-[13px] text-[#1D1D1F]">{children}</dd>
  </div>
}

export default function MetaLeadDetails({ repository, id, pageId, onClose, onSaved }: { repository: HttpGrowyPlatformRepository; id: number; pageId: number; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation('shell')
  const [lead, setLead] = useState<Lead | null>(null)
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('new')
  const [assignee, setAssignee] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !locked.current && !document.querySelector('.ts-dialog-backdrop')) closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    repository.request<Lead>(`integrations/meta/leads/${id}/`, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      if (result.source_page?.id !== pageId) { setError(t('crm.meta.otherPage')); return }
      setLead(result); setNotes(result.notes || ''); setStatus(result.status); setAssignee(String(result.assigned_to?.id || ''))
    }).catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
    return () => controller.abort()
  }, [repository, id, pageId, t])
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!lead || locked.current) return
    locked.current = true; setBusy(true); setError('')
    const payload: Record<string, unknown> = { status, notes }
    if (assignee !== String(lead.assigned_to?.id || '')) payload.assigned_to_id = assignee ? Number(assignee) : null
    try { await repository.request(`integrations/meta/leads/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) }); onSaved(); onClose() }
    catch (error) { setError(growyErrorMessage(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  const name = lead?.full_name || t('crm.meta.leadNumber', { id })
  const empty = <span className="text-[#AEAEB2]">{t('crm.record.noValue')}</span>
  const close = () => { if (!busy) onClose() }

  return createPortal(
    <div className="task-detail-backdrop fixed inset-0 z-[600] bg-[#0A1628]/[0.22]" onClick={(event) => { if (event.target === event.currentTarget) close() }}>
      <section role="dialog" aria-modal="true" aria-label={name}
        className="task-detail-drawer absolute bottom-3 right-3 top-3 flex w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(10,22,40,0.22)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#F0F1F3] px-5">
          <button type="button" onClick={close} className={`-ml-1.5 ${HEADER_ICON}`} aria-label={t('crm.record.close')}><X size={19} strokeWidth={1.75} /></button>
          {lead?.crm_lead_id && <Link to={`/crm?tab=leads&id=${lead.crm_lead_id}`} onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-[#2458D3] transition hover:bg-[#EDF2FF]">
            <ExternalLink size={15} />{t('crm.meta.openInCrm')}
          </Link>}
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void save(event)}>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5 [scrollbar-color:#D1D5DB_transparent] [scrollbar-width:thin]">
            {error && <div className="mb-4"><ErrorNotice message={error} /></div>}
            {!lead && !error && <div className="space-y-4" role="status" aria-label={t('crm.record.loading')}>
              <span className="block h-6 w-2/3 animate-pulse rounded bg-[#EEF1F5]" />
              <span className="block h-4 w-1/3 animate-pulse rounded bg-[#EEF1F5]" />
              {[0, 1, 2, 3, 4].map((index) => <span key={index} className="block h-5 w-full animate-pulse rounded bg-[#F5F6F8]" />)}
            </div>}
            {lead && <>
              <div className="flex items-start gap-3">
                <AxisAvatar initials={initialsOf(lead.full_name) || '#'} size={44} seed={lead.id} />
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-[20px] font-semibold leading-[26px] tracking-[-0.015em] text-[#1D1D1F]">{name}</h2>
                  <p className="mt-0.5 text-[13px] text-[#8E8E93]">{t('crm.meta.receivedFrom', { platform: lead.platform || 'Meta' })}</p>
                </div>
              </div>

              <dl className="mt-5 space-y-1.5">
                <Row icon={<Clock3 size={15} strokeWidth={1.75} />} label={t('crm.meta.received')}>{lead.lead_created_at ? dateLabel(lead.lead_created_at) : empty}</Row>
                <Row icon={<Phone size={15} strokeWidth={1.75} />} label={t('crm.record.phone')}>{lead.phone ? <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="truncate tabular-nums hover:text-[#2458D3]">{lead.phone}</a> : empty}</Row>
                <Row icon={<Mail size={15} strokeWidth={1.75} />} label={t('crm.record.email')}>{lead.email ? <a href={`mailto:${lead.email}`} className="truncate hover:text-[#2458D3]">{lead.email}</a> : empty}</Row>
                <Row icon={<Globe size={15} strokeWidth={1.75} />} label={t('crm.meta.page')}>{lead.source_page?.page_name || empty}</Row>
                <Row icon={<Megaphone size={15} strokeWidth={1.75} />} label={t('crm.meta.campaign')}>{lead.campaign_name ? <span className="truncate">{lead.campaign_name}</span> : empty}</Row>
                <Row icon={<FileText size={15} strokeWidth={1.75} />} label={t('crm.integrations.colForm')}>{lead.form_name ? <span className="truncate">{lead.form_name}</span> : empty}</Row>
              </dl>

              {lead.raw_field_data?.length ? <section className="mt-6">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8E8E93]">{t('crm.meta.answers')}</h3>
                <dl className="divide-y divide-[#F0F1F3] overflow-hidden rounded-xl border border-[#EEF0F3]">
                  {lead.raw_field_data.map((field, index) => <div key={`${field.name}-${index}`} className="px-3.5 py-2.5">
                    <dt className="text-[12px] text-[#8E8E93]">{field.name || t('crm.meta.formField')}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words text-[14px] text-[#1D1D1F]">{(field.values || []).map((value) => typeof value === 'string' || typeof value === 'number' ? String(value) : '—').join(', ') || '—'}</dd>
                  </div>)}
                </dl>
              </section> : null}

              <fieldset disabled={busy} className="mt-6 space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8E8E93]">{t('crm.meta.work')}</h3>
                <dl className="space-y-3">
                  <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <dt className="flex items-center gap-2 text-[13px] text-[#8E8E93]"><CircleDot size={15} strokeWidth={1.75} className="text-[#AEAEB2]" />{t('crm.record.status')}</dt>
                    <dd><CrmSelect value={status} onChange={setStatus} options={STATUSES.map((value) => ({ value, label: t(`crm.meta.status.${value}`) }))} /></dd>
                  </div>
                  <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <dt className="flex h-9 items-center gap-2 text-[13px] text-[#8E8E93]"><UserRound size={15} strokeWidth={1.75} className="text-[#AEAEB2]" />{t('crm.record.manager')}</dt>
                    <dd><CrmAssigneePicker repository={repository} entity="lead" value={assignee} initialName={lead.assigned_to?.full_name || lead.assigned_to?.name} onChange={setAssignee} /></dd>
                  </div>
                </dl>
                <label className="grid gap-1.5 text-[13px] text-[#8E8E93]">{t('crm.meta.notes')}
                  <textarea rows={4} className={inputClass} value={notes} placeholder={t('crm.meta.notesPlaceholder')} onChange={(event) => setNotes(event.target.value)} />
                </label>
              </fieldset>
            </>}
          </div>
          {lead && <footer className="flex shrink-0 justify-end gap-2 border-t border-[#F0F1F3] px-5 py-3.5">
            <AppButton variant="secondary" disabled={busy} onClick={close}>{t('crm.waManage.cancel')}</AppButton>
            <AppButton type="submit" disabled={busy} isLoading={busy}>{t('crm.integrations.save')}</AppButton>
          </footer>}
        </form>
      </section>
    </div>,
    document.body,
  )
}
