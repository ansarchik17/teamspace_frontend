import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  Video,
  ClipboardList,
  Headset,
  Mail,
  PanelsTopLeft,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MAIL_APP_URL } from '../../../shared/config/mailConfig'
import { SENIMDESK_LAUNCH_PATH } from '../../../shared/config/senimdesk'
import ruShell from '../../../shared/i18n/locales/ru/shell.json'
import EdoIcon from '../../../shared/ui/icons/EdoIcon'

export type WorkspaceAppCategory = 'documents' | 'team' | 'support' | 'tools'

export type WorkspaceAppId =
  | 'iform'
  | 'crm'
  | 'whatsapp'
  | 'edo'
  | 'senimdesk'
  | 'beketos'
  | 'hrm'
  | 'mail'
  | 'meet'
  | 'calendar'
  | 'drive'
  | 'notes'
  | 'whiteboard'
  | 'ai'

interface WorkspaceAppDefinition {
  id: WorkspaceAppId
  icon: LucideIcon
  color: string
  category: WorkspaceAppCategory
  route: string | null
}

export interface WorkspaceApp {
  id: WorkspaceAppId
  label: string
  description: string
  icon: LucideIcon
  color: string
  category: WorkspaceAppCategory
  /** Workspace route or application launch URL; null while not connected yet. */
  route: string | null
}

export const WORKSPACE_APP_CATEGORY_IDS: WorkspaceAppCategory[] = ['documents', 'team', 'support', 'tools']

const WORKSPACE_APP_DEFINITIONS: WorkspaceAppDefinition[] = [
  { id: 'iform', icon: ClipboardList, color: '#5042FF', category: 'documents', route: '/iform' },
  { id: 'edo', icon: EdoIcon, color: '#2458D3', category: 'documents', route: '/eps' },
  { id: 'senimdesk', icon: Headset, color: '#087CC7', category: 'support', route: SENIMDESK_LAUNCH_PATH },
  { id: 'beketos', icon: ShieldCheck, color: '#039C76', category: 'support', route: null },
  { id: 'hrm', icon: Users, color: '#FF8C00', category: 'team', route: '/team-contact' },
  { id: 'mail', icon: Mail, color: '#463CFF', category: 'documents', route: MAIL_APP_URL },
  { id: 'meet', icon: Video, color: '#2458D3', category: 'team', route: '/meet' },
  { id: 'calendar', icon: CalendarDays, color: '#FF8500', category: 'team', route: '/calendar' },
  { id: 'notes', icon: StickyNote, color: '#087AA4', category: 'tools', route: '/notes' },
  { id: 'whiteboard', icon: PanelsTopLeft, color: '#5042FF', category: 'tools', route: '/whiteboard' },
  { id: 'ai', icon: Sparkles, color: '#7045FF', category: 'tools', route: '/team-rag' },
]

export const useWorkspaceApps = (): WorkspaceApp[] => {
  const { t } = useTranslation('shell')
  return useMemo(
    () => WORKSPACE_APP_DEFINITIONS.map((app) => ({
      ...app,
      label: t(`apps.${app.id}.label`),
      description: t(`apps.${app.id}.description`),
    })),
    [t],
  )
}

export const useWorkspaceAppCategories = (): Record<WorkspaceAppCategory, string> => {
  const { t } = useTranslation('shell')
  return useMemo(
    () => Object.fromEntries(WORKSPACE_APP_CATEGORY_IDS.map((id) => [id, t(`apps.categories.${id}`)])) as Record<WorkspaceAppCategory, string>,
    [t],
  )
}

export const WORKSPACE_APPS: WorkspaceApp[] = WORKSPACE_APP_DEFINITIONS.map((app) => ({
  ...app,
  label: ruShell.apps[app.id].label,
  description: ruShell.apps[app.id].description,
}))

export const WORKSPACE_APP_CATEGORIES = Object.fromEntries(
  WORKSPACE_APP_CATEGORY_IDS.map((id) => [id, ruShell.apps.categories[id]]),
) as Record<WorkspaceAppCategory, string>
