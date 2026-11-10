import type { ReactNode } from 'react'
import { ArrowRight, ChevronRight, Clock3, HardDrive, Info, LayoutGrid, Users, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AdministrationOverview, HttpAdministrationRepository } from '../../../infrastructure/repositories/HttpAdministrationRepository'
import { formatDate } from '../../../shared/i18n'
import { adminText } from '../../../shared/i18n/adminText'
import AdminAuditDetails from './AdminAuditDetails'
import { ADMIN_ROW_ACTION } from './administrationUi'
import { auditLabel, storageSize } from './administrationHelpers'

type Target = 'users' | 'modules' | 'storage' | 'integrations' | 'audit'

interface AdminOverviewSectionProps {
  overview: AdministrationOverview
  repo: HttpAdministrationRepository
  organizationId?: string
  platform: boolean
  busy: boolean
  actorName: (id: number | null | undefined) => string
  onOpen: (target: Target) => void
}

const CARD = 'rounded-2xl border border-[#E6EAF1] bg-white'
const TIME: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }

const usedShare = (used: number | undefined, total: number | null | undefined) => {
  if (!used || !total) return 0
  return Math.min(1, used / total)
}

const percentText = (share: number) => new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: share > 0 && share < 0.01 ? 2 : 0 }).format(share)

function IconTile({ icon: Icon, size = 'md' }: { icon: LucideIcon; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 rounded-[14px]' : 'h-10 w-10 rounded-[10px]'
  return <span className={`flex shrink-0 items-center justify-center bg-[#EDF2FF] text-[#2458D3] ${box}`}><Icon size={size === 'lg' ? 24 : 20} strokeWidth={1.8} /></span>
}

function Meter({ share }: { share: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF1F5]">
      <div className="h-full min-w-[6px] rounded-full bg-[#2458D3]" style={{ width: `${share * 100}%` }} />
    </div>
  )
}

function StatCard({ icon, label, onClick, disabled, children }: { icon: LucideIcon; label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${CARD} group flex min-w-0 items-start gap-4 p-5 text-left transition-[border-color,box-shadow] hover:border-[#C9D6F6] hover:shadow-[0_4px_16px_rgba(23,32,46,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)] disabled:cursor-default`}>
      <IconTile icon={icon} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-[#586174]">{label}</div>
        {children}
      </div>
      <ChevronRight size={18} className="mt-1 shrink-0 text-[#586174] transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

export default function AdminOverviewSection({ overview, repo, organizationId, busy, actorName, onOpen }: AdminOverviewSectionProps) {
  useTranslation('administration')
  const storage = overview.storage
  const share = usedShare(storage?.used_bytes, storage?.quota_bytes)
  const storageTotal = storage?.quota_bytes == null ? adminText('text152') : storageSize(storage.quota_bytes)
  const events = overview.recent_audit?.items ?? []

  return (
    <div className="@container flex flex-col gap-4">
      <div className="grid gap-4 @min-[560px]:grid-cols-2 @min-[560px]:[&>*:last-child]:col-span-2 @min-[900px]:grid-cols-3 @min-[900px]:[&>*:last-child]:col-span-1">
        <StatCard icon={Users} label={adminText('text002')} disabled={busy} onClick={() => onOpen('users')}>
          <div className="mt-1 text-[28px] font-semibold leading-9 text-[#17202E]">{overview.users.total}</div>
          <div className="mt-1 text-[13px] text-[#586174]">{adminText('overviewEmployeesHint')}</div>
        </StatCard>
        <StatCard icon={LayoutGrid} label={adminText('text100')} disabled={busy} onClick={() => onOpen('modules')}>
          <div className="mt-1 text-[28px] font-semibold leading-9 text-[#17202E]">{overview.modules.filter((item) => item.effective).length}</div>
          <div className="mt-1 text-[13px] text-[#586174]">{adminText('overviewModulesHint')}</div>
        </StatCard>
        <StatCard icon={HardDrive} label={adminText('text101')} disabled={busy} onClick={() => onOpen('storage')}>
          <div className="mt-1 truncate text-[20px] font-semibold leading-9 text-[#17202E]">{storageSize(storage?.used_bytes)} / {storageTotal}</div>
          <div className="mt-2"><Meter share={share} /></div>
          <div className="mt-2 text-[13px] text-[#586174]">{adminText('overviewUsedPercent', { value: percentText(share) })}</div>
        </StatCard>
      </div>

      <div className="grid gap-4 @min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className={`${CARD} flex flex-col p-6`}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-semibold leading-6 text-[#17202E]">{adminText('text115')}</h2>
            <button type="button" onClick={() => onOpen('audit')} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#1967D2] hover:underline">{adminText('text116')}<ArrowRight size={16} /></button>
          </div>
          {events.length ? (
            <div className="mt-3 divide-y divide-[#EEF0F3] border-t border-[#EEF0F3]">
              {events.slice(0, 3).map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F3F6] text-[#586174]"><Clock3 size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium leading-5 text-[#17202E]" title={item.action}>{auditLabel(item.action)}</div>
                    <div className="truncate text-[13px] leading-5 text-[#586174]">{actorName(item.actor_id)}</div>
                  </div>
                  <AdminAuditDetails repo={repo} org={organizationId} id={item.id} className={ADMIN_ROW_ACTION} />
                  <time className="w-[128px] shrink-0 text-right text-[13px] tabular-nums text-[#586174]">{formatDate(item.created_at, TIME)}</time>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-[14px] text-[#586174]">{adminText('text118')}</p>}
        </section>

        <section className={`${CARD} flex flex-col p-6`}>
          <h2 className="text-[18px] font-semibold leading-6 text-[#17202E]">{adminText('text110')}</h2>
          {storage ? (
            <>
              <div className="mt-5 flex items-start gap-4">
                <IconTile icon={HardDrive} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold text-[#17202E]">Drive</span>
                    <span className="text-[14px] text-[#586174]">{storageSize(storage.used_bytes)} / {storageTotal}</span>
                  </div>
                  <div className="mt-3"><Meter share={share} /></div>
                  <div className="mt-2 text-[13px] text-[#586174]">{adminText('overviewUsedPercent', { value: percentText(share) })}</div>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-[#EEF0F3] pt-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F3F6] text-[#586174]"><Info size={18} /></span>
                <span className="min-w-0 flex-1 text-[13px] leading-5 text-[#586174]">{overview.capabilities.set_company_quota ? adminText('text111') : adminText('text112')}</span>
                <button type="button" disabled={busy} onClick={() => onOpen('storage')} className="ts-button ts-button--secondary ts-button--compact">{adminText('text113')}</button>
              </div>
            </>
          ) : <p className="mt-3 text-[14px] text-[#586174]">{adminText('text114')}</p>}
        </section>
      </div>
    </div>
  )
}
