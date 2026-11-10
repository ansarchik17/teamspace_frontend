import PasswordRecoveryPage from './presentation/pages/auth/PasswordRecoveryPage'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LEGACY_TEAM_ROUTES, toTeamPath } from './shared/config/teamBranding'
import LoginPage from './presentation/pages/auth/LoginPage'
import InvitationJoinPage from './presentation/pages/auth/InvitationJoinPage'
import LogoutCompletePage from './presentation/pages/auth/LogoutCompletePage'
import AuthCallbackPage from './presentation/pages/auth/AuthCallbackPage'
import WorkspaceLayout from './presentation/pages/dashboard/WorkspaceLayout'
import MessengerPage from './presentation/pages/messenger/MessengerPage'
import CrmMessengerPage, { CrmMessengerRedirect } from './presentation/pages/growy/CrmMessengerPage'
import WorkspacePage from './presentation/pages/workspace/WorkspacePage'
import ContactsSyncPage from './presentation/pages/organization/ContactsSyncPage'
import OrganizationAccessPage from './presentation/pages/organization/OrganizationAccessPage'
import OrganizationStructurePage from './presentation/pages/organization/OrganizationStructurePage'
import PlatformStructureEntryPage from './presentation/pages/platform/PlatformStructureEntryPage'
import PlatformOrganizationsPage from './presentation/pages/platform/PlatformOrganizationsPage'
import PlatformOrganizationStructurePage from './presentation/pages/platform/PlatformOrganizationStructurePage'
import AlemStorePage from './presentation/pages/alemstore/AlemStorePage'
import CrmPage from './presentation/pages/growy/CrmPage'
import WhatsAppManagementPage from './presentation/pages/growy/WhatsAppManagementPage'
import MetaBoardPage from './presentation/pages/growy/MetaBoardPage'
import CrmSettingsPage from './presentation/pages/growy/CrmSettingsPage'
import CrmDataPage from './presentation/pages/growy/CrmDataPage'
import CrmIntegrationsPage from './presentation/pages/growy/CrmIntegrationsPage'
import WhatsAppPage from './presentation/pages/growy/WhatsAppPage'
import TelegramPage from './presentation/pages/growy/TelegramPage'
import ProfilePage from './presentation/pages/profile/ProfilePage'
import CalendarPage from './presentation/pages/calendar/CalendarPage'
import MeetPage from './presentation/pages/meet/MeetPage'
import MeetCallPage from './presentation/pages/meet/MeetCallPage'
import CalendarCallPage from './presentation/pages/calendar/CalendarCallPage'
import BoardPage from './presentation/pages/board/BoardPage'
import AlemAiPage from './presentation/pages/alemai/AlemAiPage'
import AlemRagPage from './presentation/pages/alemrag'
import AlemDrivePage from './presentation/pages/alemdrive/AlemDrivePage'
import NotesPage from './presentation/pages/notes/NotesPage'
import NewsPage from './presentation/pages/news/NewsPage'
import WhiteboardPage from './presentation/pages/whiteboard/WhiteboardPage'
import AlemContactPage from './presentation/pages/alem-contact/AlemContactPage'
import EpsPage from './presentation/pages/eps/EpsPage'
import SenimDeskPage from './presentation/pages/senimdesk/SenimDeskPage'
import IFormPage from './presentation/pages/iform/IFormPage'
import ProtectedRoute from './presentation/routes/ProtectedRoute'
import PublicOnlyRoute from './presentation/routes/PublicOnlyRoute'
import DesignSystemPage from './presentation/pages/design/DesignSystemPage'
import CompanyAdministrationPage from './presentation/pages/organization/CompanyAdministrationPage'
import PlatformAdministrationPage from './presentation/pages/platform/PlatformAdministrationPage'
import PlatformSecurityAuditPage from './presentation/pages/platform/PlatformSecurityAuditPage'

function LegacyTeamRedirect() {
  const location = useLocation()
  return <Navigate to={toTeamPath(location.pathname) + location.search + location.hash} state={location.state} replace />
}

export default function App() {
  useEffect(() => {
    const enhanceIconButton = (button: HTMLButtonElement) => {
      // data-no-tooltip — явный отказ от глобальной подсказки (например, у кнопок-меню)
      if (button.hasAttribute('data-tooltip') || button.closest('[data-no-tooltip]')) {
        button.removeAttribute('data-app-tooltip')
        if (button.hasAttribute('title')) button.removeAttribute('title')
        return
      }
      const isIconOnly = Boolean(button.querySelector('svg')) && button.innerText.trim() === ''
      if (!isIconOnly) {
        button.removeAttribute('data-app-tooltip')
        return
      }

      const label = button.getAttribute('title')?.trim() || button.getAttribute('aria-label')?.trim()
      if (!label) return

      button.setAttribute('data-app-tooltip', label)
      if (button.hasAttribute('title')) button.removeAttribute('title')
    }

    const enhanceTree = (root: ParentNode) => {
      if (root instanceof HTMLButtonElement) enhanceIconButton(root)
      root.querySelectorAll<HTMLButtonElement>('button').forEach(enhanceIconButton)
    }

    enhanceTree(document.body)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLButtonElement) {
          enhanceIconButton(mutation.target)
          return
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) enhanceTree(node)
        })
      })
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title', 'aria-label'] })
    return () => observer.disconnect()
  }, [])

  // Global guard: Ensure we are always within the /web/ basename.
  // This prevents the router from breaking if some code redirects to /login instead of /web/login.
  if (!window.location.pathname.startsWith('/web') && !window.location.pathname.startsWith('/api')) {
    const currentPath = window.location.pathname === '/' ? '' : window.location.pathname;
    const newPath = '/web' + currentPath + '/' + window.location.search + window.location.hash;
    window.location.assign(newPath.replace(/\/+$/, '/').replace(/\/\//g, '/'));
    return null;
  }

  return (
    <BrowserRouter basename="/web/">

      <Routes>
        {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystemPage />} />}
        {Object.keys(LEGACY_TEAM_ROUTES).map((path) => (
          <Route key={path} path={`${path}/*`} element={<LegacyTeamRedirect />} />
        ))}
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/logout/complete" element={<LogoutCompletePage />} />
        <Route path="/join" element={<InvitationJoinPage />} />
        <Route path="/recover" element={<PasswordRecoveryPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<WorkspaceLayout />}>
            <Route path="/" element={<Navigate to="/workspace" replace />} />
            <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
            <Route path="/main/dashboard" element={<Navigate to="/workspace" replace />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/organization" element={<OrganizationStructurePage />} />
            <Route path="/organization/access" element={<OrganizationAccessPage />} />
            <Route path="/organization/admin-preview" element={<Navigate to="/organization/administration" replace />} />
            <Route path="/organization/administration/:section?" element={<CompanyAdministrationPage />} />
            <Route path="/platform/administration" element={<PlatformAdministrationPage />} />
            <Route path="/platform/administration/audit" element={<PlatformSecurityAuditPage />} />
            <Route path="/platform/organizations/:organizationId/administration/:section?" element={<CompanyAdministrationPage />} />
            <Route path="/organization/import" element={<ContactsSyncPage />} />
            <Route path="/platform/organizations/:organizationId/access" element={<OrganizationAccessPage />} />
            <Route path="/platform/organizations" element={<PlatformOrganizationsPage />} />
            <Route path="/platform/structure" element={<PlatformStructureEntryPage />} />
            <Route path="/platform/organizations/:organizationId/structure" element={<PlatformOrganizationStructurePage />} />
            <Route path="/teamstore" element={<AlemStorePage />} />
            <Route path="/crm/data" element={<CrmDataPage />} />
            <Route path="/crm/settings" element={<CrmSettingsPage />} />
            <Route path="/crm/meta" element={<MetaBoardPage />} />
            <Route path="/crm/integrations" element={<CrmIntegrationsPage />} />
            <Route path="/crm" element={<CrmPage />} />
            <Route path="/meet" element={<MeetPage />} />
            <Route path="/meet/:meetingId" element={<MeetCallPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/calls/calendar/:roomName" element={<CalendarCallPage />} />
            <Route path="/board" element={<BoardPage />} />
            <Route path="/kanban" element={<BoardPage />} />
            <Route path="/assignments" element={<Navigate to="/board" replace />} />
            <Route path="/teamai" element={<AlemAiPage />} />
            <Route path="/team-rag" element={<AlemRagPage />} />
            <Route path="/team-rag/tablet" element={<AlemRagPage />} />
            <Route path="/drive/*" element={<AlemDrivePage />} />
            <Route path="/drive/tablet/*" element={<AlemDrivePage />} />
            <Route path="/news/:publicationId" element={<NewsPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/whiteboard" element={<WhiteboardPage />} />
            <Route path="/team-contact" element={<AlemContactPage />} />
            <Route path="/team-contact/org-map" element={<OrganizationStructurePage />} />
            <Route path="/eps" element={<EpsPage />} />
            <Route path="/senimdesk" element={<SenimDeskPage />} />
            <Route path="/iform" element={<IFormPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/crm/messenger" element={<CrmMessengerPage />}>
              <Route index element={<Navigate to="whatsapp" replace />} />
              <Route path="whatsapp/manage" element={<WhatsAppManagementPage />} />
              <Route path="whatsapp" element={<WhatsAppPage />} />
              <Route path="telegram" element={<TelegramPage />} />
            </Route>
            <Route path="/whatsapp/manage" element={<CrmMessengerRedirect channel="whatsapp/manage" />} />
            <Route path="/whatsapp" element={<CrmMessengerRedirect channel="whatsapp" />} />
            <Route path="/telegram" element={<CrmMessengerRedirect channel="telegram" />} />
            <Route path="/messenger" element={<MessengerPage />} />
            <Route path="/messenger/:username" element={<MessengerPage />} />
            <Route path="/:username" element={<MessengerPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
