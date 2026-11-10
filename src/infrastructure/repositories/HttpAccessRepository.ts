import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import type { AccessPermission, AccessDependency } from '../../domain/entities/AccessPermission'
export type { AccessPermission, AccessDependency } from '../../domain/entities/AccessPermission'
export interface AccessSDCompany { id: string; name: string; is_tenant_root: boolean }
export type AccessApp = 'odo' | 'sd' | 'iform'
export interface CurrentApplicationAccess { active: boolean; managed: boolean; organization_id: string; permissions: string[] }
export interface AccessPolicy { permissions: string[]; revision: number; configured: boolean }
export interface AccessPosition { id: string; name: string; revision: number; user_count: number; policies: Record<AccessApp, AccessPolicy> }
export interface AccessApplication { available: boolean; module_enabled: boolean; enabled: boolean; revision: number }
export interface OrganizationAccess { member_positions: Record<string, string>; positions: AccessPosition[]; catalog: Record<AccessApp, AccessPermission[]>; dependencies: Record<AccessApp, AccessDependency[]>; unavailable_permissions?: Record<AccessApp, string[]>; apps: Record<AccessApp, AccessApplication>; sd_company_id: string | null }
export class HttpAccessRepository {
 private readonly store: AuthSessionStore
 constructor(store: AuthSessionStore) { this.store = store }
 async current(app: AccessApp, signal?: AbortSignal): Promise<CurrentApplicationAccess> {
  const data = await (await authorizedFetch(this.store, `/api/v1/organizations/current/access?application=${app}`, { signal })).json() as Partial<CurrentApplicationAccess> | null
  return { active: data?.active === true, managed: data?.managed !== false, organization_id: typeof data?.organization_id === 'string' ? data.organization_id : '', permissions: Array.isArray(data?.permissions) ? data.permissions.filter((permission): permission is string => typeof permission === 'string') : [] }
 }
 private path(org?: string) { return org ? `/api/v1/platform/organizations/${encodeURIComponent(org)}/access-management` : '/api/v1/organizations/current/access-management' }
 async sdCompanies(org: string): Promise<AccessSDCompany[]> { return (await authorizedFetch(this.store, `${this.path(org)}/sd-companies`)).json() }
 async get(org?: string, signal?: AbortSignal): Promise<OrganizationAccess> { return (await authorizedFetch(this.store, this.path(org), { signal })).json() }
 async change(org: string | undefined, action: string, data: object) { await authorizedFetch(this.store, `${this.path(org)}/${action}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) }
}
