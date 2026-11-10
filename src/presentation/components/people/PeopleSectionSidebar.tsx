import { Link } from 'react-router-dom'
import { Building2, Lock, Network, Upload, Users, type LucideIcon } from 'lucide-react'
import { adminText } from '../../../shared/i18n/adminText'
import type { PeopleNavState, PeopleSectionTab } from './peopleNav'

const ICONS: Record<PeopleSectionTab, LucideIcon> = {
  employees: Users,
  structure: Network,
  access: Lock,
  import: Upload,
  administration: Building2,
}

interface PeopleSectionSidebarProps {
  nav: PeopleNavState | null
}

export default function PeopleSectionSidebar({ nav }: PeopleSectionSidebarProps) {
  return (
    <aside className="workspace-people-panel" aria-label={adminText('text008')}>
      <div className="workspace-people-panel__body">
        <h2 className="workspace-people-panel__title">{adminText('text000')}</h2>
        <nav className="workspace-people-panel__nav">
          {(nav?.tabs ?? []).map((tab) => {
            const Icon = ICONS[tab.id]
            const isActive = tab.id === nav?.active
            return (
              <Link
                key={tab.id}
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                className={`workspace-people-panel__item${isActive ? ' is-active' : ''}`}
              >
                <Icon size={20} strokeWidth={1.75} />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
