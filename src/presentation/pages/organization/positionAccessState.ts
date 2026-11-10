import type { AccessApp, OrganizationAccess } from '../../../infrastructure/repositories/HttpAccessRepository'

export type AccessApplicationState = 'suspended' | 'unknown' | 'unavailable' | 'module_disabled' | 'link_required' | 'iform_disabled' | 'legacy' | 'managed'

// Module availability and company activation are independent of the stored
// management switch. Preparing a policy must never turn either switch on.
export function getAccessApplicationState(app: AccessApp, organizationStatus: string, data: OrganizationAccess): AccessApplicationState {
  if (organizationStatus !== 'active') return 'suspended'
  const settings = data.apps[app]
  if (typeof settings?.available !== 'boolean' || typeof settings?.module_enabled !== 'boolean' || typeof settings?.enabled !== 'boolean') return 'unknown'
  if (!settings.available) return 'unavailable'
  if (!settings.module_enabled) return 'module_disabled'
  if (app === 'sd' && !data.sd_company_id) return 'link_required'
  if (!settings.enabled) return app === 'iform' ? 'iform_disabled' : 'legacy'
  return 'managed'
}

export function canToggleAccessManagement(app: AccessApp, organizationStatus: string, data: OrganizationAccess): boolean {
  if (organizationStatus !== 'active') return false
  // Disabling management remains possible even if a module was switched off.
  if (data.apps[app]?.enabled === true) return true
  const state = getAccessApplicationState(app, organizationStatus, data)
  return state === 'legacy' || state === 'iform_disabled'
}
