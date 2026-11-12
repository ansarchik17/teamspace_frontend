import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GROWY_HOME_URL } from '../../../shared/config/growy'
import { MAIL_APP_URL, openWorkspaceMail } from '../../../shared/config/mailConfig'
import { openWorkspaceServiceInNewTab } from '../../../shared/config/serviceLaunch'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronsLeft, LayoutGrid, Bookmark } from 'lucide-react'
import { useWorkspaceFavoriteIds, usePublicSidebarApps, workspaceFavoriteId, publicAppRoute } from './workspaceFavorites'
import { useWorkspaceApps } from './workspaceApps'
import { WORKSPACE_NAVIGATION } from '../../../shared/config/workspaceNavigation'
import { isPeopleSectionPath } from '../people/peopleNav'

const primary = WORKSPACE_NAVIGATION.map(({ id, labelKey, Icon, route }) => ({ id, labelKey, icon: Icon, route }))
// «Люди» объединяет справочник сотрудников и структуру (включая админский список компаний)

interface WorkspaceReferenceSidebarProps {
  /** Не используется: структура теперь вкладка раздела «Люди» и сама выбирает адрес по роли */
  userRole?: string
  collapsed: boolean
  onToggleCollapsed: () => void
  onNavigate?: () => void
  messengerUnreadCount?: number
}

export default function WorkspaceReferenceSidebar({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  messengerUnreadCount = 0,
}: WorkspaceReferenceSidebarProps) {
  const { t } = useTranslation(['shell', 'common'])
  const workspaceApps = useWorkspaceApps()
  const navigate = useNavigate()
  const { pathname, hash } = useLocation()
  const [favoritesOpen, setFavoritesOpen] = useState(true)
  const { ids } = useWorkspaceFavoriteIds()
  const { catalog, favorites } = usePublicSidebarApps()
  const selectedApps = ids.flatMap(id => {
    const app = workspaceApps.find(item => item.id === id)
    if (!app) return []
    const connected = catalog.find(item => workspaceFavoriteId(item.appName) === id)
    return [{ ...app, route: app.route ?? (connected ? publicAppRoute(connected) : '/teamstore') }]
  })
  const extraApps = favorites.filter(app => app.appName.trim().toLowerCase() !== 'crm' && !workspaceFavoriteId(app.appName))
  const open = (route: string) => {
    if (openWorkspaceServiceInNewTab(route)) {
      onNavigate?.()
      return
    }
    if (route === MAIL_APP_URL) openWorkspaceMail()
    else if (route === GROWY_HOME_URL || route.startsWith('https:')) window.open(route, '_blank', 'noopener,noreferrer')
    else navigate(route)
    onNavigate?.()
  }
  return <aside id="workspace-sidebar" className="workspace-ref-sidebar" data-collapsed={collapsed}>
    <div className="workspace-ref-sidebar__head">
      <button type="button" className="workspace-ref-sidebar__brand" onClick={() => navigate('/workspace')} aria-label="UniteSpace">
        <img src={`${import.meta.env.BASE_URL}axis-workspace-mark.png`} alt="" className="workspace-ref-sidebar__mark" />
        <span className="flex whitespace-nowrap text-[19px] tracking-[-0.055em] text-[#0A1628]" style={{ fontFamily: 'Manrope, sans-serif' }}>
          <span className="font-bold">Unite</span><span className="font-light">Space</span>
        </span>
      </button>
      <button
        type="button"
        className="workspace-ref-sidebar__collapse absolute"
        data-no-tooltip
        onClick={onToggleCollapsed}
        aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        aria-expanded={!collapsed}
        aria-controls="workspace-sidebar"
      >
        <ChevronsLeft size={18} strokeWidth={2} />
      </button>
    </div>
    <nav className="workspace-ref-sidebar__nav" aria-label={t('sidebar.label')}>
      <div className="workspace-ref-sidebar__primary">{primary.map(({id,labelKey,icon:Icon,route}) => {
        const label = t(labelKey)
        const targetRoute = route
        // «Люди» объединяет справочник сотрудников и структуру (включая админский список компаний)
        const isActive = id === 'alem-contact'
          ? isPeopleSectionPath(pathname)
          : (pathname === route || pathname.startsWith(`${route}/`)) && !hash
        const isMessenger = id === 'chat'
        const itemIsActive = isMessenger ? pathname.startsWith('/messenger') : id === 'meet' ? pathname.startsWith('/meet') : id === 'crm' ? pathname.startsWith('/crm') : isActive
        return <button type="button" key={id} aria-label={label} title={label} className={'workspace-ref-sidebar__item' + (itemIsActive ? ' is-active' : '')} aria-current={itemIsActive ? 'page' : undefined} onClick={() => open(targetRoute)}><b className="workspace-ref-sidebar__icon"><Icon size={21} fill={id === 'workspace' && itemIsActive ? 'currentColor' : 'none'}><title>{label}</title></Icon>{isMessenger && messengerUnreadCount > 0 ? <em className="workspace-ref-sidebar__badge" aria-label={t('sidebar.unreadMessages', { count: messengerUnreadCount })}>{messengerUnreadCount > 99 ? '99+' : messengerUnreadCount}</em> : null}</b><span>{label}</span></button>
      })}</div>
      <div className="workspace-ref-sidebar__divider" />
      <button type="button" className="workspace-ref-sidebar__item workspace-ref-sidebar__favorites-toggle" aria-label={t('sidebar.favorites')} aria-expanded={favoritesOpen} aria-controls="workspace-sidebar-favorites" onClick={() => setFavoritesOpen(value => !value)}><Bookmark size={21} strokeWidth={1.75} /><span>{t('sidebar.favorites')}</span><ChevronDown className={favoritesOpen ? 'is-open' : ''} size={15} /></button>
      {favoritesOpen ? <div id="workspace-sidebar-favorites" className="workspace-ref-sidebar__apps">
        {selectedApps.map(({id,label,icon:Icon,route,color}) => <button type="button" className={'workspace-ref-sidebar__item' + (pathname === route ? ' is-active' : '')} key={id} aria-label={label} title={label} onClick={() => open(route)}><Icon size={20} color={color} /><span>{label}</span></button>)}
        {extraApps.map(app => <button type="button" className="workspace-ref-sidebar__item" key={`public-${app.id}`} aria-label={app.appName} title={app.appName} onClick={() => open(publicAppRoute(app))}><LayoutGrid size={20} /><span>{app.appName}</span></button>)}
      </div> : null}
    </nav>
  </aside>
}
