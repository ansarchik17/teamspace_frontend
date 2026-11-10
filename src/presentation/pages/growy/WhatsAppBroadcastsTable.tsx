import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Megaphone, MoreHorizontal, Pause, Play, Users, X } from 'lucide-react'
import FloatingMenu, { floatingMenuDangerClass, floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { CRM_ROW_ICON } from './CrmRecordTable'
import { Chip } from './crmTableCells'
import { EmptyState } from './growyUi'
import { dateLabel } from './growyShared'
import { BROADCAST_TONE, TONES, type WhatsAppBroadcast } from './whatsAppManageFormat'

export type BroadcastAction = 'start' | 'pause' | 'cancel'
const GRID = 'grid grid-cols-[minmax(220px,1.6fr)_180px_96px_minmax(160px,1fr)_130px_88px] items-center gap-4'

const actionsFor = (status: string): BroadcastAction[] => [
  ...(['draft', 'paused', 'scheduled'].includes(status) ? ['start' as const] : []),
  ...(status === 'running' ? ['pause' as const] : []),
  ...(['draft', 'scheduled', 'running', 'paused'].includes(status) ? ['cancel' as const] : []),
]
const ACTION_ICON = { start: Play, pause: Pause, cancel: X }

export default function WhatsAppBroadcastsTable({ broadcasts, loading, busy, onDetails, onAction }: {
  broadcasts: WhatsAppBroadcast[]
  loading: boolean
  busy: boolean
  onDetails: (id: number) => void
  onAction: (broadcast: WhatsAppBroadcast, action: BroadcastAction) => void
}) {
  const { t } = useTranslation('shell')
  const [menu, setMenu] = useState<{ anchor: HTMLElement; broadcast: WhatsAppBroadcast } | null>(null)

  return <section className="flex min-h-[320px] min-w-0 flex-1 flex-col overflow-hidden max-xl:flex-none rounded-2xl border border-[#E6EAF1] bg-white">
    <div className="min-h-0 flex-1 overflow-auto [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin]">
      <div className="min-w-[890px]" role="table">
        <div className={`${GRID} sticky top-0 z-10 h-11 border-b border-[#E6EAF1] bg-[#FAFBFC] px-6 text-[13px] font-medium text-[#586174]`} role="row">
          <span role="columnheader">{t('crm.waManage.colBroadcast')}</span>
          <span role="columnheader">{t('crm.waManage.colStatus')}</span>
          <span role="columnheader" className="text-right">{t('crm.waManage.colRecipients')}</span>
          <span role="columnheader">{t('crm.waManage.colDelivery')}</span>
          <span role="columnheader">{t('crm.waManage.colSchedule')}</span>
          <span role="columnheader" className="text-right">{t('crm.table.actions')}</span>
        </div>
        {loading ? Array.from({ length: 5 }, (_, index) => <div key={index} className={`${GRID} h-[64px] border-b border-[#EEF0F3] px-6`} aria-hidden>
          <span className="flex items-center gap-3"><span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#EEF0F3]" /><span className="h-3.5 w-40 animate-pulse rounded bg-[#EEF0F3]" /></span>
          <span className="h-3.5 w-24 animate-pulse rounded bg-[#EEF0F3]" /><span className="ml-auto h-3.5 w-10 animate-pulse rounded bg-[#EEF0F3]" />
          <span className="h-2 w-full animate-pulse rounded bg-[#EEF0F3]" /><span className="h-3.5 w-20 animate-pulse rounded bg-[#EEF0F3]" /><span />
        </div>) : broadcasts.length === 0 ? <EmptyState title={t('crm.waManage.emptyBroadcastsTitle')} description={t('crm.waManage.emptyBroadcastsText')} />
          : broadcasts.map((broadcast) => {
            const counts = broadcast.recipient_counts
            const tone = TONES[BROADCAST_TONE[broadcast.status] || 'neutral']
            const delivered = counts.total ? Math.min(100, Math.round(((counts.delivered + counts.read) / counts.total) * 100)) : 0
            const read = counts.total ? Math.min(100, Math.round((counts.read / counts.total) * 100)) : 0
            const actions = actionsFor(broadcast.status)
            return <div key={broadcast.id} role="row" tabIndex={0}
              className={`${GRID} h-[64px] cursor-pointer border-b border-[#EEF0F3] px-6 text-[14px] text-[#465066] transition-colors duration-[120ms] hover:bg-[#F8F9FB] ${AXIS_UI.focus}`}
              onClick={() => onDetails(broadcast.id)}
              onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') onDetails(broadcast.id) }}>
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]"><Megaphone size={16} /></span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[#17202E]">{broadcast.name}</span>
                  <span className="block truncate text-[12px] text-[#586174]">{t('crm.waManage.templateOf', { name: broadcast.template_name })}</span>
                </span>
              </div>
              <div role="cell" className="min-w-0"><Chip label={t(`crm.waManage.broadcastStatus.${broadcast.status}`, { defaultValue: broadcast.status })} bg={tone.bg} color={tone.color} dot={tone.color} /></div>
              <div role="cell" className="text-right tabular-nums">{counts.total}</div>
              <div role="cell" className="min-w-0">
                <div className="relative h-1.5 overflow-hidden rounded-full bg-[#EEF0F3]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={delivered} aria-label={t('crm.waManage.colDelivery')}>
                  <span className="absolute inset-y-0 left-0 rounded-full bg-[#A9C1F5]" style={{ width: `${delivered}%` }} />
                  <span className="absolute inset-y-0 left-0 rounded-full bg-[#2458D3]" style={{ width: `${read}%` }} />
                </div>
                <div className="mt-1 truncate text-[12px] text-[#586174] tabular-nums">
                  {t('crm.waManage.deliveryStats', { delivered: counts.delivered + counts.read, read: counts.read })}
                  {counts.failed > 0 && <span className="text-[#C03437]"> · {t('crm.waManage.failedStats', { count: counts.failed })}</span>}
                </div>
              </div>
              <div role="cell" className="text-[13px] tabular-nums">{broadcast.scheduled_at ? dateLabel(broadcast.scheduled_at) : '—'}</div>
              <div role="cell" className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
                <button type="button" className={CRM_ROW_ICON} title={t('crm.waManage.recipients')} aria-label={`${t('crm.waManage.recipients')}: ${broadcast.name}`}
                  onClick={() => onDetails(broadcast.id)}><Users size={17} /></button>
                {actions.length > 0 && <button type="button" className={CRM_ROW_ICON} disabled={busy} title={t('crm.table.more')} aria-label={`${t('crm.table.more')}: ${broadcast.name}`} aria-haspopup="menu"
                  onClick={(event) => setMenu({ anchor: event.currentTarget, broadcast })}><MoreHorizontal size={18} /></button>}
              </div>
            </div>
          })}
      </div>
    </div>
    <footer className="flex h-14 shrink-0 items-center border-t border-[#E6EAF1] px-6 text-[13px] text-[#465066]">
      <span className="tabular-nums">{t('crm.waManage.broadcastsCount', { count: broadcasts.length })}</span>
    </footer>
    <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={() => setMenu(null)} className="w-[220px]">
      {menu && actionsFor(menu.broadcast.status).map((action) => {
        const Icon = ACTION_ICON[action]
        return <button key={action} type="button" role="menuitem" className={action === 'cancel' ? floatingMenuDangerClass : floatingMenuItemClass}
          onClick={() => { const broadcast = menu.broadcast; setMenu(null); onAction(broadcast, action) }}>
          <Icon size={16} />{t(`crm.waManage.action.${action}`)}
        </button>
      })}
    </FloatingMenu>
  </section>
}
