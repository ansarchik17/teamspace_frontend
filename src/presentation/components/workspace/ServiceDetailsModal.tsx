import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Bookmark, Info, Layers, LayoutGrid, Link2, LoaderCircle, MoreHorizontal, ShieldCheck, Star, Users, X, Zap, type LucideIcon } from 'lucide-react'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { isSenimDeskApp, openWorkspaceSenimDesk } from '../../../shared/config/senimdesk'
import { SERVICE_DESCRIPTIONS } from './workspaceAppDetails'
import { WORKSPACE_APPS, useWorkspaceAppCategories, type WorkspaceApp, type WorkspaceAppId } from './workspaceApps'
import type { AlemStoreAppViewModel } from '../../view-models/AlemStoreViewModel'

export type ServiceSelection = { kind: 'workspace'; app: WorkspaceApp } | { kind: 'catalog'; app: AlemStoreAppViewModel }
type PanelTab = 'overview' | 'capabilities' | 'access' | 'support'

const HIGHLIGHT_ICONS: LucideIcon[] = [Zap, Users, ShieldCheck]
const SQUARE_BUTTON = `flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E2E5EA] bg-white text-[#465066] transition-colors duration-200 hover:border-[#C9D3E6] hover:bg-[#F8F9FB] disabled:opacity-60 ${AXIS_UI.focus}`

export default function ServiceDetailsModal({ selection, active, pending, onClose, onLaunch, onFavorite }: {
  selection: ServiceSelection; active: boolean; pending: boolean; onClose: () => void; onLaunch: () => void; onFavorite: () => void
}) {
  const { t } = useTranslation('shell')
  const categories = useWorkspaceAppCategories()
  const [tab, setTab] = useState<PanelTab>('overview')
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const normalizedName = selection.kind === 'catalog' ? selection.app.appName.trim().toLowerCase().replace(/\s+/g, '') : ''
  const aliases: Record<string, string> = { axismail: 'mail', mail: 'mail', alemdrive: 'drive' }
  const workspace = selection.kind === 'workspace' ? selection.app : WORKSPACE_APPS.find(app => app.id === (aliases[normalizedName] ?? normalizedName) || app.label.toLowerCase().replace(/\s+/g, '') === normalizedName)
  const catalog = selection.kind === 'catalog' ? selection.app : null
  const label = workspace?.label ?? catalog?.appName ?? ''
  const key = workspace?.id ?? (catalog?.id === 38 ? 'board' : catalog?.id === 42 ? 'teamai' : label.trim().toLowerCase())
  const category = workspace ? categories[workspace.category] : catalog?.category || t('services.panel.company')
  const details = SERVICE_DESCRIPTIONS[key] ?? { description: `«${label}» — сервис рабочего пространства вашей компании.${catalog?.tags.length ? ` Направления работы: ${catalog.tags.join(', ')}.` : ''} Нажмите «Открыть», чтобы перейти к подключённому приложению.`, features: catalog?.tags.length ? catalog.tags : ['Доступ из рабочего пространства', 'Быстрый запуск из избранного'] }
  const available = Boolean(workspace?.route ?? catalog?.link) || catalog?.id === 38 || catalog?.id === 42 || Boolean(catalog && isSenimDeskApp(catalog.appName))
  const Icon = workspace?.icon ?? LayoutGrid
  const color = available ? workspace?.color ?? '#2458D3' : '#7B8494'
  const infoId = workspace?.id as Exclude<WorkspaceAppId, 'crm'> | undefined
  const hasInfo = Boolean(infoId && t(`services.info.${infoId}.h1`, { defaultValue: '' }))
  const highlights = hasInfo && infoId ? [t(`services.info.${infoId}.h1`), t(`services.info.${infoId}.h2`), t(`services.info.${infoId}.h3`)] : []
  const notes = hasInfo && infoId ? [t(`services.info.${infoId}.n1`), t(`services.info.${infoId}.n2`), t(`services.info.${infoId}.n3`)] : []
  const featureIcons: LucideIcon[] = [Zap, Layers, Icon]
  const route = workspace?.route ?? catalog?.link ?? ''
  const newTab = workspace ? workspace.id === 'mail' || route.startsWith('http') : Boolean(catalog?.link)
  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'overview', label: t('services.panel.overview') },
    { id: 'capabilities', label: t('services.panel.capabilities') },
    { id: 'access', label: t('services.panel.access') },
    { id: 'support', label: t('services.panel.support') },
  ]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !menuAnchor) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuAnchor, onClose])

  const copyLink = () => {
    const url = route.startsWith('/') ? `${window.location.origin}/web${route}` : route
    if (url) void navigator.clipboard?.writeText(url).catch(() => undefined)
  }

  const features = <ul className="overflow-hidden rounded-2xl border border-[#EEF0F3]">
    {details.features.map((feature, index) => {
      const FeatureIcon = featureIcons[index % featureIcons.length]
      return <li key={feature} className="flex items-center gap-4 border-b border-[#EEF0F3] px-3 py-3 last:border-b-0">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F1F3FF] text-[#4B4DED]"><FeatureIcon size={20} strokeWidth={1.75} /></span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium leading-6 text-[#17202E]">{feature}</span>
          {notes[index] && <span className="block text-[13px] leading-5 text-[#586174]">{notes[index]}</span>}
        </span>
      </li>
    })}
  </ul>

  const summary = <div className="flex items-start gap-4 rounded-2xl bg-[#F6F7FB] px-5 py-4">
    <Info size={22} strokeWidth={1.75} className="mt-0.5 shrink-0 text-[#4B4DED]" />
    <dl className="grid flex-1 grid-cols-2 gap-4">
      <div><dt className="text-[13px] text-[#586174]">{t('services.panel.category')}</dt><dd className="mt-1 text-[14px] font-medium text-[#17202E]">{category}</dd></div>
      <div><dt className="text-[13px] text-[#586174]">{t('services.panel.status')}</dt><dd className="mt-1 flex items-center gap-2 text-[14px] font-medium text-[#17202E]"><span className={`h-2 w-2 rounded-full ${available ? 'bg-[#1E8E5A]' : 'bg-[#C98A00]'}`} />{available ? t('services.panel.canOpen') : t('services.panel.waiting')}</dd></div>
    </dl>
  </div>

  return createPortal(<div className="task-detail-backdrop fixed inset-0 z-[600] bg-[#0A1628]/[0.22]" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-label={label} className="task-detail-drawer absolute bottom-3 right-3 top-3 flex w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_24px_70px_rgba(10,22,40,0.22)]">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#D1D5DB_transparent] [scrollbar-width:thin]">
        <div className="relative isolate overflow-hidden px-6 pb-5 pt-6">
          <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 h-72 w-72 rounded-full opacity-70 blur-3xl" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }} />
          <Icon aria-hidden="true" size={150} strokeWidth={1.2} className="pointer-events-none absolute -right-4 top-6 -z-10 rotate-[-14deg] opacity-[0.13]" style={{ color }} />
          <button type="button" onClick={onClose} aria-label={t('services.panel.close')} className={`absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-[#465066] transition-colors hover:bg-white/80 ${AXIS_UI.focus}`}><X size={20} strokeWidth={1.75} /></button>
          <div className="flex items-center gap-5 pr-10">
            <span className="flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[28px] border border-[#E8ECF4] bg-white shadow-[0_8px_24px_-12px_rgba(23,32,46,0.18)]" style={{ color }}>
              {catalog?.appPhoto ? <img src={catalog.appPhoto} alt="" className="h-16 w-16 object-contain" /> : <Icon size={52} strokeWidth={1.6} />}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[28px] font-bold leading-9 tracking-[-0.01em] text-[#17202E]">{label}</h2>
              <span className={`mt-2 inline-flex h-7 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium ${available ? 'bg-[#E8F6EE] text-[#16734B]' : 'bg-[#FFF6E5] text-[#946000]'}`}><span className="h-2 w-2 rounded-full bg-current" />{available ? t('services.panel.available') : t('services.panel.preparing')}</span>
            </div>
          </div>
          <p className="mt-5 text-[15px] leading-6 text-[#465066]">{details.description}</p>
          <div className="mt-5 flex gap-3">
            <button type="button" disabled={!available} onClick={onLaunch} className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#2F55EB] text-[15px] font-medium text-white transition-colors duration-200 hover:bg-[#2445CF] disabled:cursor-not-allowed disabled:bg-[#B4BAC5] ${AXIS_UI.focus}`}>
              {available ? t('services.panel.open') : t('services.panel.soon')}<ArrowUpRight size={18} />
            </button>
            <button type="button" aria-pressed={active} disabled={pending} onClick={onFavorite} aria-label={active ? t('services.panel.removeFavorite') : t('services.panel.addFavorite')} title={active ? t('services.panel.removeFavorite') : t('services.panel.addFavorite')} className={`${SQUARE_BUTTON} ${active ? 'text-[#2F55EB]' : ''}`}>
              {pending ? <LoaderCircle size={18} className="animate-spin" /> : <Bookmark size={19} strokeWidth={1.75} fill={active ? 'currentColor' : 'none'} />}
            </button>
            <button type="button" aria-label={t('services.panel.more')} aria-haspopup="menu" aria-expanded={Boolean(menuAnchor)} onClick={(event) => setMenuAnchor(menuAnchor ? null : event.currentTarget)} className={SQUARE_BUTTON}><MoreHorizontal size={20} /></button>
          </div>
        </div>

        <div role="tablist" aria-label={label} className="flex gap-1 border-b border-[#EEF0F3] px-6">
          {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={`-mb-px h-12 border-b-2 px-3 text-[15px] transition-colors duration-200 first:-ml-3 ${tab === item.id ? 'border-[#2F55EB] font-medium text-[#17202E]' : 'border-transparent text-[#586174] hover:text-[#17202E]'} ${AXIS_UI.focus}`}>{item.label}</button>)}
        </div>

        <div className="space-y-6 px-6 pb-6 pt-5">
          {tab === 'overview' && <>
            {highlights.length > 0 && <div className="grid grid-cols-3 divide-x divide-[#E6E9F2] rounded-2xl bg-[#F6F7FB] py-4">
              {highlights.map((text, index) => {
                const HighlightIcon = HIGHLIGHT_ICONS[index]
                return <div key={text} className="px-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ECEEFE] text-[#4B4DED]"><HighlightIcon size={18} strokeWidth={1.75} /></span>
                  <p className="mt-2.5 text-[13px] leading-5 text-[#465066]">{text}</p>
                </div>
              })}
            </div>}
            <div>
              <h3 className="mb-3 text-[17px] font-semibold text-[#17202E]">{t('services.panel.mainFeatures')}</h3>
              {features}
            </div>
            {summary}
          </>}
          {tab === 'capabilities' && features}
          {tab === 'access' && <>
            {summary}
            <dl className="overflow-hidden rounded-2xl border border-[#EEF0F3] text-[14px]">
              <div className="flex justify-between gap-4 px-4 py-3"><dt className="text-[#586174]">{t('services.panel.opensIn')}</dt><dd className="text-right font-medium text-[#17202E]">{newTab ? t('services.panel.inNewTab') : t('services.panel.inWorkspace')}</dd></div>
            </dl>
            <p className="text-[14px] leading-6 text-[#586174]">{t('services.panel.accessText')}</p>
          </>}
          {tab === 'support' && <div className="rounded-2xl bg-[#F6F7FB] p-5">
            <h3 className="text-[16px] font-semibold text-[#17202E]">{t('services.panel.supportTitle')}</h3>
            <p className="mt-1.5 text-[14px] leading-6 text-[#465066]">{t('services.panel.supportText')}</p>
            <button type="button" onClick={openWorkspaceSenimDesk} className={`mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-[#E2E5EA] bg-white px-4 text-[14px] font-medium text-[#17202E] transition-colors hover:bg-[#F8F9FB] ${AXIS_UI.focus}`}>{t('services.panel.contactSupport')}<ArrowUpRight size={16} /></button>
          </div>}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-[#EEF0F3] px-6 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <Star size={20} className={`mt-0.5 shrink-0 ${active ? 'fill-[#F5B014] text-[#F5B014]' : 'text-[#B4BAC5]'}`} />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[#17202E]">{active ? t('services.panel.inFavorites') : t('services.panel.notInFavorites')}</p>
            <p className="text-[12px] leading-5 text-[#586174]">{active ? t('services.panel.inFavoritesText') : t('services.panel.notInFavoritesText')}</p>
          </div>
        </div>
        <button type="button" disabled={pending} onClick={onFavorite} className={`h-10 shrink-0 rounded-xl border border-[#E2E5EA] bg-white px-4 text-[14px] font-medium text-[#17202E] transition-colors hover:bg-[#F8F9FB] disabled:opacity-60 ${AXIS_UI.focus}`}>{active ? t('services.panel.removeFavorite') : t('services.panel.addFavorite')}</button>
      </footer>
    </section>
    <FloatingMenu anchor={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)} className="min-w-[220px]">
      <button type="button" className={floatingMenuItemClass} disabled={!route} onClick={() => { setMenuAnchor(null); copyLink() }}><Link2 size={17} />{t('services.panel.copyLink')}</button>
      <button type="button" className={floatingMenuItemClass} onClick={() => { setMenuAnchor(null); openWorkspaceSenimDesk() }}><ArrowUpRight size={17} />{t('services.panel.contactSupport')}</button>
    </FloatingMenu>
  </div>, document.body)
}
