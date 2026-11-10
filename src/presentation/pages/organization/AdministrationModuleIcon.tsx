import { BriefcaseBusiness, GraduationCap, LayoutGrid } from 'lucide-react'
import { WORKSPACE_APPS } from '../../components/workspace/workspaceApps'

export default function AdministrationModuleIcon({ application }: { application: string }) {
  const aliases: Record<string, string> = { odo: 'edo', sd: 'senimdesk', axismail: 'mail', alemdrive: 'drive' }
  const app = WORKSPACE_APPS.find(item => item.id === (aliases[application] ?? application))
  const Icon = app?.icon ?? (application === 'growy' ? GraduationCap : application === 'crm' ? BriefcaseBusiness : LayoutGrid)
  return <div className="company-admin-icon" style={{ color: app?.color ?? '#2458D3' }}><Icon size={23} aria-hidden="true" /></div>
}
