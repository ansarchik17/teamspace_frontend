import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { BriefcaseBusiness, CalendarDays, CircleDot, Clock3, Link2, Mail, MessageCircle, MessageSquareText, MoreVertical, Pencil, Phone, Radio, SquareCheck, UserRound, Wallet, X } from 'lucide-react'
import type { CrmRecord, CrmResource, HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import AxisAvatar from '../../components/board/AxisAvatar'
import CrmRecordDetails from './CrmRecordDetails'
import { recordName, statusLabels } from './growyShared'

const HEADER_ICON = 'flex h-8 w-8 items-center justify-center rounded-lg text-[#3C3C43] transition hover:bg-[#F3F4F6]'
const ACTION = 'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition disabled:opacity-50'

function PropertyRow({ icon, label, children, alignTop = false }: { icon: ReactNode; label: string; children: ReactNode; alignTop?: boolean }) {
  return (
    <div className={`grid grid-cols-[120px_minmax(0,1fr)] gap-3 sm:grid-cols-[150px_minmax(0,1fr)] ${alignTop ? 'items-start' : 'items-center'}`}>
      <dt className="flex min-h-7 items-center gap-2 text-[13px] text-[#8E8E93]">
        <span className="flex shrink-0 text-[#AEAEB2]">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-h-7 min-w-0 items-center text-[13px] text-[#1D1D1F]">{children}</dd>
    </div>
  )
}

const longDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
const time = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
const initialsOf = (value: string) => value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')

export default function CrmRecordDrawer({ repository, resource, recordId, record, revision, sourceLabels, whatsappEnabled, opening, onClose, onEdit, onCreateDeal, onWhatsApp, onTask, onChanged }: {
  repository: HttpGrowyPlatformRepository; resource: CrmResource; recordId: number; record: CrmRecord | null; revision: number
  sourceLabels: Record<string, string>; whatsappEnabled: boolean; opening: number | null
  onClose: () => void; onEdit: (record: CrmRecord) => void; onCreateDeal: (record: CrmRecord) => void
  onWhatsApp: (record: CrmRecord) => void; onTask: (task?: CrmRecord) => void; onChanged: () => void
}) {
  const { t } = useTranslation('shell')
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('.ts-dialog-backdrop')) return
      closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const name = record ? recordName(record) : ''
  const person = record?.assigned_to || record?.manager
  const personName = person?.full_name || person?.name || ''
  const phone = record?.phone || record?.whatsapp || ''
  const source = record?.source || record?.created_source || record?.external_source || ''
  const status = record?.stage?.name || statusLabels[record?.status ?? ''] || record?.status || ''
  const statusColor = record?.stage?.color || record?.color || '#7B8494'
  const subtitleKey = resource === 'leads' ? 'crm.record.leadFrom' : resource === 'deals' ? 'crm.record.dealFrom' : resource === 'contacts' ? 'crm.record.contactFrom' : 'crm.record.recordFrom'
  const withFeed = resource === 'leads' || resource === 'deals' || resource === 'contacts'
  const canChat = whatsappEnabled && (resource === 'leads' || resource === 'contacts') && Boolean(record?.whatsapp || record?.phone)
  const empty = <span className="text-[#AEAEB2]">{t('crm.record.noValue')}</span>

  return createPortal(
    <div className="task-detail-backdrop fixed inset-0 z-[600] bg-[#0A1628]/[0.22]" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-label={name || t('crm.record.loading')}
        className="task-detail-drawer absolute bottom-3 right-3 top-3 flex w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(10,22,40,0.22)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#F0F1F3] px-5">
          <button type="button" onClick={onClose} className={`-ml-1.5 ${HEADER_ICON}`} aria-label={t('crm.record.close')}>
            <X size={19} strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-1">
            <button type="button" className={HEADER_ICON} title={t('crm.record.copyLink')} aria-label={t('crm.record.copyLink')}
              onClick={() => void navigator.clipboard?.writeText(window.location.href)}>
              <Link2 size={17} strokeWidth={1.75} />
            </button>
            {record && <button type="button" className={HEADER_ICON} title={t('crm.record.edit')} aria-label={t('crm.record.edit')} onClick={() => onEdit(record)}>
              <Pencil size={16} strokeWidth={1.75} />
            </button>}
            <button type="button" className={`-mr-1.5 ${HEADER_ICON}`} aria-label={t('crm.record.more')} aria-haspopup="menu"
              disabled={!record} onClick={(event) => setMoreAnchor(moreAnchor ? null : event.currentTarget)}>
              <MoreVertical size={17} strokeWidth={1.75} />
            </button>
            <FloatingMenu anchor={moreAnchor} open={Boolean(moreAnchor && record)} onClose={() => setMoreAnchor(null)}>
              {record && <>
                <button type="button" className={floatingMenuItemClass} onClick={() => { setMoreAnchor(null); onEdit(record) }}><Pencil size={16} />{t('crm.record.edit')}</button>
                {(resource === 'leads' || resource === 'deals') && <button type="button" className={floatingMenuItemClass} onClick={() => { setMoreAnchor(null); onTask() }}><SquareCheck size={16} />{t('crm.record.addTask')}</button>}
                <button type="button" className={floatingMenuItemClass} onClick={() => { setMoreAnchor(null); void navigator.clipboard?.writeText(window.location.href) }}><Link2 size={16} />{t('crm.record.copyLink')}</button>
              </>}
            </FloatingMenu>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#D1D5DB_transparent] [scrollbar-width:thin]">
          {!record || record.id !== recordId ? (
            <div className="space-y-4 px-5 pt-5" role="status" aria-label={t('crm.record.loading')}>
              <span className="block h-6 w-2/3 animate-pulse rounded bg-[#EEF1F5]" />
              <span className="block h-4 w-1/3 animate-pulse rounded bg-[#EEF1F5]" />
              {[0, 1, 2, 3, 4].map((index) => <span key={index} className="block h-5 w-full animate-pulse rounded bg-[#F5F6F8]" />)}
            </div>
          ) : <>
            <div className="px-5 pt-5">
              <div className="flex items-start gap-3">
                {resource !== 'lead-stages' && <AxisAvatar initials={/^[+\d<]/.test(name) ? '#' : initialsOf(name) || '#'} size={44} seed={record.id} />}
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-[20px] font-semibold leading-[26px] tracking-[-0.015em] text-[#1D1D1F]">{name}</h2>
                  {record.created_date && <p className="mt-0.5 text-[13px] text-[#8E8E93]">{t(subtitleKey, { date: longDate(record.created_date) })}</p>}
                </div>
              </div>

              {(canChat || phone || resource === 'leads' || resource === 'contacts') && <div className="mt-4 flex flex-wrap gap-2">
                {canChat && <button type="button" className={`${ACTION} bg-[#2458D3] text-white hover:bg-[#1D4AB8]`} disabled={opening !== null} onClick={() => onWhatsApp(record)}>
                  <MessageCircle size={15} />{t('crm.record.write')}
                </button>}
                {phone && !/^</.test(phone) && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={`${ACTION} border border-[#E2E5EA] bg-white text-[#1D1D1F] hover:bg-[#F6F7F9]`}>
                  <Phone size={15} />{t('crm.record.call')}
                </a>}
                {(resource === 'leads' || resource === 'contacts') && <button type="button" className={`${ACTION} border border-[#E2E5EA] bg-white text-[#1D1D1F] hover:bg-[#F6F7F9]`} onClick={() => onCreateDeal(record)}>
                  <BriefcaseBusiness size={15} />{t('crm.record.createDeal')}
                </button>}
              </div>}

              <dl className="mt-5 space-y-1.5">
                <PropertyRow icon={<Clock3 size={15} strokeWidth={1.75} />} label={t('crm.record.created')}>
                  {record.created_date ? <span>{longDate(record.created_date)}<span className="ml-2 text-[#8E8E93]">{time(record.created_date)}</span></span> : empty}
                </PropertyRow>
                {status && <PropertyRow icon={<CircleDot size={15} strokeWidth={1.75} />} label={resource === 'leads' ? t('crm.record.stage') : t('crm.record.status')}>
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-[#F2F2F7] px-2 text-[12px] font-medium text-[#3C3C43]">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />{status}
                  </span>
                </PropertyRow>}
                {resource === 'deals' && <PropertyRow icon={<Wallet size={15} strokeWidth={1.75} />} label={t('crm.record.amount')}>
                  <span className="tabular-nums">{Number(record.amount || 0).toLocaleString('ru-RU')} {record.currency || 'KZT'}</span>
                </PropertyRow>}
                {resource === 'tasks' && <PropertyRow icon={<CalendarDays size={15} strokeWidth={1.75} />} label={t('crm.record.due')}>
                  {record.due_at ? <span>{longDate(record.due_at)}<span className="ml-2 text-[#8E8E93]">{time(record.due_at)}</span></span> : empty}
                </PropertyRow>}
                {resource !== 'lead-stages' && resource !== 'tasks' && <>
                  <PropertyRow icon={<Phone size={15} strokeWidth={1.75} />} label={t('crm.record.phone')}>{record.phone ? <span className="truncate tabular-nums">{record.phone}</span> : empty}</PropertyRow>
                  {record.whatsapp && record.whatsapp !== record.phone && <PropertyRow icon={<MessageCircle size={15} strokeWidth={1.75} />} label={t('crm.record.whatsapp')}><span className="truncate tabular-nums">{record.whatsapp}</span></PropertyRow>}
                  <PropertyRow icon={<Mail size={15} strokeWidth={1.75} />} label={t('crm.record.email')}>{record.email ? <a href={`mailto:${record.email}`} className="truncate hover:text-[#2458D3]">{record.email}</a> : empty}</PropertyRow>
                  <PropertyRow icon={<Radio size={15} strokeWidth={1.75} />} label={t('crm.record.source')}>
                    {source ? <span className="inline-flex h-6 items-center rounded-full bg-[#F2F2F7] px-2.5 text-[12px] text-[#3C3C43]">{sourceLabels[source] || source}</span> : empty}
                  </PropertyRow>
                </>}
                {resource !== 'contacts' && resource !== 'lead-stages' && <PropertyRow icon={<UserRound size={15} strokeWidth={1.75} />} label={t('crm.record.manager')}>
                  {person ? <span className="flex min-w-0 items-center gap-2"><AxisAvatar initials={initialsOf(personName) || String(person.id).slice(-2)} size={22} seed={person.id} title={personName} /><span className="truncate">{personName}</span></span> : empty}
                </PropertyRow>}
                {(record.comment || record.notes || record.description) && <PropertyRow icon={<MessageSquareText size={15} strokeWidth={1.75} />} label={t('crm.record.comment')} alignTop>
                  <p className="whitespace-pre-wrap break-words py-1 leading-5">{record.comment || record.notes || record.description}</p>
                </PropertyRow>}
              </dl>
            </div>
            {withFeed && <CrmRecordDetails key={`${resource}-${record.id}`} repository={repository} resource={resource} record={record}
              revision={revision} onChanged={onChanged} onTask={onTask} />}
            {!withFeed && <div className="h-6" />}
          </>}
        </div>
      </section>
    </div>,
    document.body,
  )
}
