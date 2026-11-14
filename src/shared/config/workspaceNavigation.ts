import { BriefcaseBusiness, CalendarDays, FileText, House, LayoutGrid, PanelsTopLeft, Sparkles, SquareCheck, StickyNote, Users, type LucideIcon } from 'lucide-react'
import type shell from '../i18n/locales/ru/shell.json'
import EdoIcon from '../ui/icons/EdoIcon'

export type NavigationLabelKey = `navigation.${keyof typeof shell.navigation & string}`

interface WorkspaceNavigationItem {
  id: string
  labelKey: NavigationLabelKey
  route: string
  icon: string
  Icon: LucideIcon
  isExternal?: boolean
  isAi?: boolean
}

/** One navigation model for desktop sidebar and mobile drawer. */
export const WORKSPACE_NAVIGATION: WorkspaceNavigationItem[] = [
  { id: 'workspace', labelKey: 'navigation.workspace', route: '/workspace', icon: 'home', Icon: House },
  { id: 'board', labelKey: 'navigation.board', route: '/board', icon: 'view_kanban', Icon: SquareCheck },
  { id: 'alemdrive', labelKey: 'navigation.alemdrive', route: '/drive', icon: 'folder_open', Icon: FileText },
  { id: 'alem-contact', labelKey: 'navigation.alem-contact', route: '/team-contact', icon: 'contacts', Icon: Users },
  { id: 'crm', labelKey: 'navigation.crm', route: '/crm', icon: 'business_center', Icon: BriefcaseBusiness },
  { id: 'teamstore', labelKey: 'navigation.teamstore', route: '/teamstore', icon: 'apps', Icon: LayoutGrid },
]

export const WORKSPACE_TOOL_NAVIGATION: WorkspaceNavigationItem[] = [
  { id: 'calendar', labelKey: 'navigation.calendar', route: '/calendar', icon: 'calendar_today', Icon: CalendarDays },
  { id: 'notes', labelKey: 'navigation.notes', route: '/notes', icon: 'notes', Icon: StickyNote },
  { id: 'whiteboard', labelKey: 'navigation.whiteboard', route: '/whiteboard', icon: 'draw', Icon: PanelsTopLeft },
  { id: 'alem-rag', labelKey: 'navigation.alem-rag', route: '/team-rag', icon: 'auto_awesome', Icon: Sparkles, isAi: true },
  { id: 'iform', labelKey: 'navigation.iform', route: '/iform', icon: 'assignment', Icon: SquareCheck },
  { id: 'eps', labelKey: 'navigation.eps', route: '/eps', icon: 'description', Icon: EdoIcon },
  { id: 'senimdesk', labelKey: 'navigation.senimdesk', route: '/senimdesk', icon: 'support_agent', Icon: Users },
]
