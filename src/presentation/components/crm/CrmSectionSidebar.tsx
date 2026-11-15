import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BriefcaseBusiness, ChevronDown, Contact, Database, Layers, MessageCircle, MessagesSquare, Plug, Plus, Settings, SquareCheck, UserPlus, type LucideIcon } from 'lucide-react'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'

type NavKey = 'leads' | 'contacts' | 'deals' | 'tasks' | 'messenger' | 'whatsapp' | 'leadStages' | 'data' | 'integrations' | 'settings'
type CreateKey = 'leads' | 'contacts' | 'deals' | 'tasks'

interface NavItem {
  key: string
  label: NavKey
  to: string
  Icon: LucideIcon
}

const MAIN: NavItem[] = [
  { key: 'leads', label: 'leads', to: '/crm?tab=leads', Icon: UserPlus },
  { key: 'contacts', label: 'contacts', to: '/crm?tab=contacts', Icon: Contact },
  { key: 'deals', label: 'deals', to: '/crm?tab=deals', Icon: BriefcaseBusiness },
  { key: 'tasks', label: 'tasks', to: '/crm?tab=tasks', Icon: SquareCheck },
  { key: 'messenger', label: 'messenger', to: '/crm/messenger/whatsapp', Icon: MessagesSquare },
]

const SETTINGS: NavItem[] = [
  { key: 'lead-stages', label: 'leadStages', to: '/crm?tab=lead-stages', Icon: Layers },
  { key: 'data', label: 'data', to: '/crm/data', Icon: Database },
  { key: 'integrations', label: 'integrations', to: '/crm/integrations', Icon: Plug },
  { key: 'settings', label: 'settings', to: '/crm/settings', Icon: Settings },
]

const CHANNELS: NavItem[] = [
  { key: 'whatsapp', label: 'whatsapp', to: '/crm/messenger/whatsapp', Icon: MessageCircle },
]

const CREATE: { resource: CreateKey; Icon: LucideIcon }[] = [
  { resource: 'leads', Icon: UserPlus },
  { resource: 'contacts', Icon: Contact },
  { resource: 'deals', Icon: BriefcaseBusiness },
  { resource: 'tasks', Icon: SquareCheck },
]

const activeKey = (pathname: string, search: string) => {
  if (pathname.startsWith('/crm/messenger')) return 'whatsapp'
  if (pathname.startsWith('/crm/data')) return 'data'
  if (pathname.startsWith('/crm/integrations') || pathname.startsWith('/crm/meta')) return 'integrations'
  if (pathname.startsWith('/crm/settings')) return 'settings'
  return new URLSearchParams(search).get('tab') || 'leads'
}

export default function CrmSectionSidebar() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation('shell')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const active = activeKey(pathname, search)
  const inMessenger = active === 'whatsapp'
  const [messengerOpen, setMessengerOpen] = useState(inMessenger)
  const [lastPath, setLastPath] = useState(pathname)
  if (lastPath !== pathname) {
    setLastPath(pathname)
    if (inMessenger && !messengerOpen) setMessengerOpen(true)
  }

  const renderItem = (item: NavItem, nested = false) => (
    <Link
      key={item.key}
      to={item.to}
      aria-current={item.key === active ? 'page' : undefined}
      className={`workspace-people-panel__item${nested ? ' is-nested' : ''}${item.key === active ? ' is-active' : ''}`}
    >
      <item.Icon size={20} strokeWidth={1.75} />
      <span>{t(`crm.nav.${item.label}`)}</span>
    </Link>
  )

  return (
    <aside className="workspace-people-panel" aria-label={t('crm.title')}>
      <div className="workspace-people-panel__body">
        <h2 className="workspace-people-panel__title">{t('crm.title')}</h2>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
          className="ts-button ts-button--primary ts-button--compact workspace-people-panel__add"
        >
          <Plus size={16} />
          <span>{t('crm.create')}</span>
          <ChevronDown size={16} />
        </button>
        <FloatingMenu anchor={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} align="start" className="w-[248px]">
          {CREATE.map((item) => (
            <button
              key={item.resource}
              type="button"
              role="menuitem"
              className={`${floatingMenuItemClass} !py-2`}
              onClick={() => { setAnchor(null); navigate(`/crm?tab=${item.resource}&create=1`) }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]"><item.Icon size={16} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-[#17202E]">{t(`crm.createItems.${item.resource}`)}</span>
                <span className="block text-[12px] text-[#586174]">{t(`crm.createItems.${item.resource}Hint`)}</span>
              </span>
            </button>
          ))}
        </FloatingMenu>
        <nav className="workspace-people-panel__nav" aria-label={t('crm.sections')}>
          {MAIN.map((item) => item.key === 'messenger'
            ? <div key={item.key}>
              <button type="button" aria-expanded={messengerOpen} onClick={() => setMessengerOpen((value) => !value)}
                className={`workspace-people-panel__item w-full cursor-pointer border-0 bg-transparent text-left font-[inherit]${inMessenger && !messengerOpen ? ' is-active' : ''}`}>
                <item.Icon size={20} strokeWidth={1.75} /><span>{t(`crm.nav.${item.label}`)}</span>
                <ChevronDown size={16} className={`!h-4 !w-4 transition-transform duration-150 ${messengerOpen ? 'rotate-180' : ''}`} />
              </button>
              {messengerOpen && <div className="flex flex-col gap-0.5">{CHANNELS.map((channel) => renderItem(channel, true))}</div>}
            </div>
            : renderItem(item))}
        </nav>
        <div className="mt-5 px-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-[#586174]">{t('crm.setup')}</div>
        <nav className="workspace-people-panel__nav !mt-2" aria-label={t('crm.setupNav')}>
          {SETTINGS.map((item) => renderItem(item))}
        </nav>
      </div>
    </aside>
  )
}
