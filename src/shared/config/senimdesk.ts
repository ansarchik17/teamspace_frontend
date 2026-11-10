import { openWorkspaceServiceInNewTab } from './serviceLaunch'

// The launch page verifies the Workspace session before leaving the SPA.
export const SENIMDESK_LAUNCH_PATH = '/senimdesk'

export function isSenimDeskApp(name: string): boolean {
  return name.replace(/\s+/g, '').toLowerCase() === 'senimdesk'
}

export function openWorkspaceSenimDesk(): void {
  openWorkspaceServiceInNewTab(SENIMDESK_LAUNCH_PATH)
}
