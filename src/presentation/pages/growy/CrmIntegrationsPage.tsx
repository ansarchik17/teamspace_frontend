import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { Download, Megaphone, MoreHorizontal, MessageCircle, MessagesSquare, RefreshCw, SquareKanban, TriangleAlert, Unplug } from 'lucide-react'
import MetaRoutingPanel from './MetaRoutingPanel'
import MetaFormsPanel from './MetaFormsPanel'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import FloatingMenu, { floatingMenuDangerClass, floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { CRM_ROW_ICON } from './CrmRecordTable'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { EmptyState, ErrorNotice } from './growyUi'
import { dateLabel, useGrowyContext } from './growyShared'
import { Chip } from './crmTableCells'
import { TONES, type ToneName } from './crmTones'
import CrmSelect from './CrmSelect'

interface MetaPage { id: number; page_id: string; page_name: string; instagram_business_account_name?: string; is_selected?: boolean }
interface MetaStatus { is_connected: boolean; expires_at: string | null; pages: MetaPage[]; selected_page: MetaPage | null }
interface ChannelStatus { connected: boolean; provider: string | null; edna?: { subject_id?: string; sender_status?: string; operational_status?: string; status_reason?: string }; meta?: { phone_number?: string } }

function StatusChip({ tone, label }: { tone: ToneName; label: string }) {
  const value = TONES[tone]
  return <Chip label={label} bg={value.bg} color={value.color} dot={value.color} />
}

function IntegrationCard({ icon, iconClass, title, description, status, actions, children, footer }: {
  icon: ReactNode; iconClass: string; title: string; description: string; status: ReactNode; actions?: ReactNode; children?: ReactNode; footer?: ReactNode
}) {
  return <section className="flex min-w-0 flex-col rounded-2xl border border-[#E6EAF1] bg-white">
    <header className="flex items-start gap-3 px-5 pt-5 sm:px-6">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-semibold text-[#17202E]">{title}</h2>
          {status}
        </div>
        <p className="mt-0.5 text-[13px] leading-5 text-[#586174]">{description}</p>
      </div>
      {actions}
    </header>
    <div className="flex-1 space-y-4 px-5 py-4 sm:px-6">{children}</div>
    {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-[#E6EAF1] px-5 py-3.5 sm:px-6">{footer}</footer>}
  </section>
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="grid grid-cols-[minmax(120px,0.8fr)_minmax(0,1.2fr)] gap-3 py-2 text-[14px]">
    <dt className="text-[#586174]">{label}</dt>
    <dd className="min-w-0 truncate text-[#17202E]">{children}</dd>
  </div>
}

export default function CrmIntegrationsPage() {
  const { t } = useTranslation('shell')
  const { repository, context, loading, error: contextError, retry } = useGrowyContext()
  const [params, setParams] = useSearchParams()
  const [meta, setMeta] = useState<MetaStatus | null>(null)
  const [channel, setChannel] = useState<ChannelStatus | null>(null)
  const [metaError, setMetaError] = useState('')
  const [channelError, setChannelError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [pageId, setPageId] = useState('')
  const [notice, setNotice] = useState('')
  const [disconnect, setDisconnect] = useState(false)
  const [metaMenu, setMetaMenu] = useState<HTMLElement | null>(null)
  const enabled = Boolean(context?.modules.crm)
  const whatsappEnabled = Boolean(context?.modules.whatsapp)

  useEffect(() => {
    if (!context?.modules.crm) return
    const controller = new AbortController()
    setMetaError(''); setChannelError('')
    repository.request<MetaStatus>('integrations/meta/status/', { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) { setMeta(value); setPageId(value.selected_page?.page_id || '') } })
      .catch((error) => { if (!controller.signal.aborted) setMetaError(growyErrorMessage(error)) })
    if (context.modules.whatsapp) repository.whatsappStatus(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setChannel(value) })
      .catch((error) => { if (!controller.signal.aborted) setChannelError(growyErrorMessage(error)) })
    return () => controller.abort()
  }, [repository, context, revision])

  useEffect(() => {
    if (!params.has('meta_connected') && !params.has('meta_error')) return
    setNotice(params.get('meta_connected') === 'true' ? t('crm.integrations.metaConnectedNotice') : t('crm.integrations.metaFailedNotice'))
    const next = new URLSearchParams(params); next.delete('meta_connected'); next.delete('meta_error'); setParams(next, { replace: true })
  }, [params, setParams, t])

  const action = async (path: string, payload?: Record<string, unknown>) => {
    if (busy) return
    setBusy(true); setActionError(''); setNotice('')
    try {
      if (path === 'connect/') {
        const response = await repository.request<{ auth_url: string }>('integrations/meta/connect/')
        const destination = new URL(response.auth_url)
        if (destination.protocol !== 'https:' || !['facebook.com', 'www.facebook.com', 'business.facebook.com'].includes(destination.hostname)) throw new Error(t('crm.integrations.badConnectUrl'))
        window.location.assign(destination.href)
      } else {
        await repository.request(`integrations/meta/${path}`, { method: 'POST', body: JSON.stringify(payload || {}) })
        setDisconnect(false); setRevision((value) => value + 1)
        setNotice(path === 'backfill/' ? t('crm.integrations.backfillDone') : t('crm.integrations.saved'))
      }
    } catch (error) { setActionError(growyErrorMessage(error)) }
    finally { setBusy(false) }
  }

  const selectedPageId = meta?.selected_page?.page_id || ''
  const ednaWarning = channel?.edna?.status_reason

  return <section className={`flex min-w-0 w-full flex-1 flex-col bg-[#F6F7F9] px-4 pb-6 pt-6 text-[#17202E] md:px-6 xl:px-8 ${AXIS_UI.fontFamily}`}>
    <div className="shrink-0 pb-4">
      <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">{t('crm.integrations.title')}</h1>
      <p className="mt-0.5 text-[14px] text-[#586174]">{t('crm.integrations.subtitle')}{context?.tenant.name ? ` · ${context.tenant.name}` : ''}</p>
    </div>

    {loading && <p role="status" className="py-10 text-center text-sm text-[#586174]">{t('crm.data.connecting')}</p>}
    {contextError && <ErrorNotice message={contextError} retry={retry} />}
    {context && !enabled && <EmptyState title={t('crm.data.disabledTitle')} description={t('crm.data.disabledText')} />}

    {enabled && <div className="flex max-w-[1120px] flex-col gap-4">
      {notice && <p role="status" className="rounded-xl border border-[#CFDCF8] bg-[#EDF2FF] px-4 py-3 text-[14px] text-[#173B91]">{notice}</p>}
      {actionError && !disconnect && <ErrorNotice message={actionError} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <IntegrationCard icon={<Megaphone size={20} />} iconClass="bg-[#EDF2FF] text-[#2458D3]" title={t('crm.integrations.metaTitle')} description={t('crm.integrations.metaText')}
          actions={meta?.is_connected ? <button type="button" className={CRM_ROW_ICON} disabled={busy} title={t('crm.table.more')} aria-label={`${t('crm.table.more')}: ${t('crm.integrations.metaTitle')}`} aria-haspopup="menu"
            onClick={(event) => setMetaMenu(event.currentTarget)}><MoreHorizontal size={18} /></button> : null}
          status={meta ? <StatusChip tone={meta.is_connected ? 'success' : 'neutral'} label={meta.is_connected ? t('crm.integrations.connected') : t('crm.integrations.notConnected')} /> : null}
          footer={meta ? (meta.is_connected ? <>
            <button type="button" className={AXIS_UI.secondaryButton} disabled={!selectedPageId || busy} onClick={() => void action('backfill/', { page_id: selectedPageId })}><Download size={16} />{t('crm.integrations.loadLeads')}</button>
            <Link to="/crm/meta" className={AXIS_UI.secondaryButton}><SquareKanban size={16} />{t('crm.integrations.metaBoard')}</Link>
          </> : <AppButton isLoading={busy} onClick={() => void action('connect/')}>{t('crm.integrations.connectMeta')}</AppButton>) : null}>
          {metaError && <ErrorNotice message={metaError} retry={() => setRevision((value) => value + 1)} />}
          {!meta && !metaError && <div className="space-y-2" aria-hidden><span className="block h-3.5 w-2/3 animate-pulse rounded bg-[#EEF0F3]" /><span className="block h-3.5 w-1/2 animate-pulse rounded bg-[#EEF0F3]" /></div>}
          {meta && !meta.is_connected && <p className="text-[14px] leading-5 text-[#465066]">{t('crm.integrations.metaHint')}</p>}
          {meta?.is_connected && <>
            <dl className="divide-y divide-[#EEF0F3]">
              <Detail label={t('crm.integrations.page')}>{meta.selected_page ? meta.selected_page.page_name : <span className="text-[#946000]">{t('crm.integrations.pageNotSelected')}</span>}</Detail>
              {meta.selected_page?.instagram_business_account_name && <Detail label="Instagram">{meta.selected_page.instagram_business_account_name}</Detail>}
              <Detail label={t('crm.integrations.accessUntil')}>{meta.expires_at ? dateLabel(meta.expires_at) : t('crm.integrations.noExpiry')}</Detail>
            </dl>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-[#586174]">{t('crm.integrations.choosePage')}</span>
              <div className="flex flex-wrap gap-2">
                <CrmSelect className="flex-1" ariaLabel={t('crm.integrations.choosePage')} value={pageId} disabled={busy} onChange={setPageId}
                  placeholder={t('crm.integrations.pagePlaceholder')}
                  options={meta.pages.map((page) => ({ value: page.page_id, label: page.page_name, description: page.instagram_business_account_name }))} />
                <AppButton disabled={!pageId || pageId === selectedPageId || busy} onClick={() => void action('select-page/', { page_id: pageId })}>{t('crm.integrations.save')}</AppButton>
              </div>
            </div>
          </>}
        </IntegrationCard>

        <IntegrationCard icon={<MessageCircle size={20} />} iconClass="bg-[#EDF8F1] text-[#16734B]" title="WhatsApp" description={t('crm.integrations.waText')}
          status={!whatsappEnabled ? <StatusChip tone="neutral" label={t('crm.integrations.moduleOff')} />
            : channel ? <StatusChip tone={channel.connected ? (ednaWarning ? 'warning' : 'success') : 'neutral'} label={channel.connected ? t('crm.integrations.connected') : t('crm.integrations.notConnected')} /> : null}
          footer={whatsappEnabled ? <>
            <Link to="/crm/messenger/whatsapp" className={AXIS_UI.secondaryButton}><MessagesSquare size={16} />{t('crm.integrations.openChats')}</Link>
            <Link to="/crm/messenger/whatsapp/manage" className={AXIS_UI.secondaryButton}>{t('crm.integrations.templates')}</Link>
          </> : null}>
          {!whatsappEnabled && <p className="text-[14px] leading-5 text-[#465066]">{t('crm.integrations.waOff')}</p>}
          {whatsappEnabled && channelError && <ErrorNotice message={channelError} retry={() => setRevision((value) => value + 1)} />}
          {whatsappEnabled && !channel && !channelError && <div className="space-y-2" aria-hidden><span className="block h-3.5 w-2/3 animate-pulse rounded bg-[#EEF0F3]" /><span className="block h-3.5 w-1/2 animate-pulse rounded bg-[#EEF0F3]" /></div>}
          {channel && !channel.connected && <p className="text-[14px] leading-5 text-[#465066]">{t('crm.integrations.waHint')}</p>}
          {channel?.connected && <dl className="divide-y divide-[#EEF0F3]">
            <Detail label={t('crm.integrations.provider')}><span className="capitalize">{channel.provider || '—'}</span></Detail>
            {channel.meta?.phone_number && <Detail label={t('crm.integrations.phone')}>{channel.meta.phone_number}</Detail>}
            {channel.edna?.subject_id && <Detail label={t('crm.integrations.ednaChannel')}>{channel.edna.subject_id}</Detail>}
            {channel.edna?.sender_status && <Detail label={t('crm.integrations.senderStatus')}>{channel.edna.sender_status}</Detail>}
          </dl>}
          {ednaWarning && <div className="flex items-start gap-2.5 rounded-xl border border-[#F5DFB3] bg-[#FFF6E5] px-3.5 py-3 text-[13px] leading-5 text-[#6B4600]">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-[#946000]" />{ednaWarning}
          </div>}
        </IntegrationCard>
      </div>

      {meta?.is_connected && selectedPageId && <MetaFormsPanel repository={repository} pageId={selectedPageId} />}
      {meta?.is_connected && <MetaRoutingPanel repository={repository} />}
    </div>}

    <FloatingMenu anchor={metaMenu} open={Boolean(metaMenu)} onClose={() => setMetaMenu(null)} className="w-[220px]">
      <button type="button" role="menuitem" className={floatingMenuItemClass} onClick={() => { setMetaMenu(null); void action('connect/') }}><RefreshCw size={16} />{t('crm.integrations.reconnect')}</button>
      <button type="button" role="menuitem" className={floatingMenuDangerClass} onClick={() => { setMetaMenu(null); setActionError(''); setDisconnect(true) }}><Unplug size={16} />{t('crm.integrations.disconnect')}</button>
    </FloatingMenu>

    {disconnect && <AppModal title={t('crm.integrations.disconnectTitle')} onClose={() => { if (!busy) setDisconnect(false) }}>
      <p className="mb-4 text-[14px] text-[#465066]">{t('crm.integrations.disconnectText')}</p>
      {actionError && <div className="mb-4"><ErrorNotice message={actionError} /></div>}
      <div className="flex justify-end gap-2">
        <AppButton variant="secondary" disabled={busy} onClick={() => setDisconnect(false)}>{t('crm.waManage.cancel')}</AppButton>
        <AppButton variant="danger" isLoading={busy} onClick={() => void action('disconnect/')}>{t('crm.integrations.disconnect')}</AppButton>
      </div>
    </AppModal>}
  </section>
}
