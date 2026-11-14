import { lazy, Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import AppLoader from './shared/ui/AppLoader'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LEGACY_TEAM_ROUTES, toTeamPath } from './shared/config/teamBranding'
import CrmMessengerPage, { CrmMessengerRedirect } from './presentation/pages/growy/CrmMessengerPage'
import ProtectedRoute from './presentation/routes/ProtectedRoute'
import PublicOnlyRoute from './presentation/routes/PublicOnlyRoute'

const PasswordRecoveryPage = lazy(() => import('./presentation/pages/auth/PasswordRecoveryPage'))
const LoginPage = lazy(() => import('./presentation/pages/auth/LoginPage'))
const InvitationJoinPage = lazy(() => import('./presentation/pages/auth/InvitationJoinPage'))
const LogoutCompletePage = lazy(() => import('./presentation/pages/auth/LogoutCompletePage'))
const AuthCallbackPage = lazy(() => import('./presentation/pages/auth/AuthCallbackPage'))
const WorkspaceLayout = lazy(() => import('./presentation/pages/dashboard/WorkspaceLayout'))
const MessengerPage = lazy(() => import('./presentation/pages/messenger/MessengerPage'))
const WorkspacePage = lazy(() => import('./presentation/pages/workspace/WorkspacePage'))
const ContactsSyncPage = lazy(() => import('./presentation/pages/organization/ContactsSyncPage'))
const OrganizationAccessPage = lazy(() => import('./presentation/pages/organization/OrganizationAccessPage'))
const OrganizationStructurePage = lazy(() => import('./presentation/pages/organization/OrganizationStructurePage'))
const PlatformStructureEntryPage = lazy(() => import('./presentation/pages/platform/PlatformStructureEntryPage'))
const PlatformOrganizationsPage = lazy(() => import('./presentation/pages/platform/PlatformOrganizationsPage'))
const PlatformOrganizationStructurePage = lazy(() => import('./presentation/pages/platform/PlatformOrganizationStructurePage'))
const AlemStorePage = lazy(() => import('./presentation/pages/alemstore/AlemStorePage'))
const CrmPage = lazy(() => import('./presentation/pages/growy/CrmPage'))
const WhatsAppManagementPage = lazy(() => import('./presentation/pages/growy/WhatsAppManagementPage'))
const MetaBoardPage = lazy(() => import('./presentation/pages/growy/MetaBoardPage'))
const CrmSettingsPage = lazy(() => import('./presentation/pages/growy/CrmSettingsPage'))
const CrmDataPage = lazy(() => import('./presentation/pages/growy/CrmDataPage'))
const CrmIntegrationsPage = lazy(() => import('./presentation/pages/growy/CrmIntegrationsPage'))
const WhatsAppPage = lazy(() => import('./presentation/pages/growy/WhatsAppPage'))
const TelegramPage = lazy(() => import('./presentation/pages/growy/TelegramPage'))
const ProfilePage = lazy(() => import('./presentation/pages/profile/ProfilePage'))
const CalendarPage = lazy(() => import('./presentation/pages/calendar/CalendarPage'))
const MeetPage = lazy(() => import('./presentation/pages/meet/MeetPage'))
const MeetCallPage = lazy(() => import('./presentation/pages/meet/MeetCallPage'))
const CalendarCallPage = lazy(() => import('./presentation/pages/calendar/CalendarCallPage'))
const BoardPage = lazy(() => import('./presentation/pages/board/BoardPage'))
const AlemAiPage = lazy(() => import('./presentation/pages/alemai/AlemAiPage'))
const AlemRagPage = lazy(() => import('./presentation/pages/alemrag'))
const AlemDrivePage = lazy(() => import('./presentation/pages/alemdrive/AlemDrivePage'))
const NotesPage = lazy(() => import('./presentation/pages/notes/NotesPage'))
const NewsPage = lazy(() => import('./presentation/pages/news/NewsPage'))
const WhiteboardPage = lazy(() => import('./presentation/pages/whiteboard/WhiteboardPage'))
const AlemContactPage = lazy(() => import('./presentation/pages/alem-contact/AlemContactPage'))
const EpsPage = lazy(() => import('./presentation/pages/eps/EpsPage'))
const SenimDeskPage = lazy(() => import('./presentation/pages/senimdesk/SenimDeskPage'))
const IFormPage = lazy(() => import('./presentation/pages/iform/IFormPage'))
const DesignSystemPage = lazy(() => import('./presentation/pages/design/DesignSystemPage'))
const CompanyAdministrationPage = lazy(() => import('./presentation/pages/organization/CompanyAdministrationPage'))
const PlatformAdministrationPage = lazy(() => import('./presentation/pages/platform/PlatformAdministrationPage'))
const PlatformSecurityAuditPage = lazy(() => import('./presentation/pages/platform/PlatformSecurityAuditPage'))

function LegacyTeamRedirect() {
  const location = useLocation()
  return <Navigate to={toTeamPath(location.pathname) + location.search + location.hash} state={location.state} replace />
}

export default function App() {
  const { t } = useTranslation('common')
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

      <Suspense fallback={<AppLoader label={t('status.loading')} />}>
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
      </Suspense>
    </BrowserRouter>
  )
}
