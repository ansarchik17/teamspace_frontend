import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MessageCircle } from 'lucide-react'

const channels = [
  { label: 'WhatsApp', route: '/crm/messenger/whatsapp', icon: MessageCircle },
]

export function CrmMessengerRedirect({ channel }: { channel: 'whatsapp' | 'whatsapp/manage' }) {
  const { search, hash } = useLocation()
  return <Navigate to={`/crm/messenger/${channel}${search}${hash}`} replace />
}

export default function CrmMessengerPage() {
  const { t } = useTranslation('shell')
  const activeRoute = '/crm/messenger/whatsapp'
  return <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[#F6F7F9]">
    <nav aria-label={t('crm.nav.messenger')} className="people-section-tabs flex shrink-0 items-center gap-2 border-b border-[#E2E5EA] bg-white px-4 py-2">
      {channels.map(({ label, route, icon: Icon }) => <Link key={route} to={route} aria-current={activeRoute === route ? 'page' : undefined}
        className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-[14px] font-medium transition-colors ${activeRoute === route ? 'bg-[#EDF2FF] text-[#2458D3]' : 'text-[#586174] hover:bg-[#F1F3F6]'}`}><Icon size={16} />{label}</Link>)}
    </nav>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto"><Outlet /></div>
  </section>
}
