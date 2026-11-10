import { BriefcaseBusiness, CalendarDays, FileText, GraduationCap, House, LayoutGrid, MessageCircle, Newspaper, PanelsTopLeft, Sparkles, SquareCheck, StickyNote, Users, Video, type LucideIcon } from 'lucide-react'
import { GROWY_HOME_URL } from './growy'
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
  { id: 'news', labelKey: 'navigation.news', route: '/news', icon: 'feed', Icon: Newspaper },
  { id: 'board', labelKey: 'navigation.board', route: '/board', icon: 'view_kanban', Icon: SquareCheck },
  { id: 'alemdrive', labelKey: 'navigation.alemdrive', route: '/drive', icon: 'folder_open', Icon: FileText },
  { id: 'chat', labelKey: 'navigation.chat', route: '/messenger', icon: 'forum', Icon: MessageCircle },
  { id: 'alem-contact', labelKey: 'navigation.alem-contact', route: '/team-contact', icon: 'contacts', Icon: Users },
  { id: 'meet', labelKey: 'navigation.meet', route: '/meet', icon: 'videocam', Icon: Video },
  { id: 'crm', labelKey: 'navigation.crm', route: '/crm', icon: 'business_center', Icon: BriefcaseBusiness },
  { id: 'alem-edu', labelKey: 'navigation.alem-edu', route: GROWY_HOME_URL, icon: 'school', Icon: GraduationCap, isExternal: true },
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
