import { normalizeBackendAssetUrl } from '../http/normalizeBackendAssetUrl'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'

export interface Organization {
  id: string
  name: string
  slug: string
  status: string
  owner_id?: number | null
  owner_name?: string
  owner_email?: string
  can_manage_structure?: boolean
}

export interface PlatformOrganization extends Organization {
  user_count: number
  unit_count: number
}

export interface PlatformOrganizationList {
  items: PlatformOrganization[]
  total: number
  limit: number
  offset: number
}

export interface OrganizationOwnerCandidate {
  id: number
  full_name: string
  email: string
  username: string
}

export interface OrganizationUnit {
  id: string
  organization_id: string
  parent_unit_id?: string | null
  name: string
  unit_type: string
  description?: string | null
  manager_id?: number | null
  display_order: number
}

export interface OrganizationMember {
  id: number
  full_name: string
  email: string
  username: string
  position?: string | null
  avatar_url?: string | null
  availability_status?: string | null
  unit_id?: string | null
  manager_id?: number | null
  is_active?: boolean
}

export type GrowyRoleCode = 'employee' | 'manager' | 'tenant_admin' | 'issuer'

export interface GrowyPositionRoleMapping {
  position: string
  growy_role: GrowyRoleCode
  growy_roles?: GrowyRoleCode[]
  user_count: number
}

export interface CreateOrganizationInput {
  name: string
  slug?: string
}

export interface PlatformOrganizationFilter {
  q?: string
  status?: 'active' | 'suspended' | ''
  limit?: number
  offset?: number
}

export interface UpdatePlatformOrganizationInput {
  name?: string
  status?: 'active' | 'suspended'
}

export type OrganizationIdentityProviderType = 'oidc' | 'saml'

export interface OrganizationIdentityProvider {
  id: string
  organization_id: string
  provider_type: OrganizationIdentityProviderType
  alias: string
  display_name: string
  enabled: boolean
  settings?: Record<string, string>
  secret_set: boolean
  status: 'pending' | 'active' | 'error' | 'disabled' | string
  last_error?: string
  last_tested_at?: string | null
  created_at: string
  updated_at: string
}

export interface CreateOrganizationIdentityProviderInput {
  provider_type: OrganizationIdentityProviderType
  display_name: string
  settings: Record<string, string>
  client_secret?: string
  enabled?: boolean
}

export interface UpdateOrganizationIdentityProviderInput {
  display_name?: string
  settings?: Record<string, string>
  client_secret?: string
  enabled?: boolean
}

export interface OrganizationTreeNode {
  id: string
  parent_unit_id?: string | null
  name: string
  unit_type: string
  description?: string | null
  display_order: number
  manager?: { id: number; full_name: string; position?: string | null; avatar_url?: string | null } | null
  employee_count: number
  subtree_employee_count: number
  children: OrganizationTreeNode[]
}

export interface OrganizationTree {
  organization_id: string
  can_manage_structure: boolean
  items: OrganizationTreeNode[]
  total_units: number
  active_employee_count: number
  unassigned_employee_count: number
}

export interface CreateOrganizationUnitInput {
  name: string
  unit_type?: string
  parent_unit_id?: string | null
  description?: string
  manager_id?: number | null
  display_order?: number
}

export interface UpdateOrganizationUnitInput {
  name?: string
  unit_type?: string
  parent_unit_id?: string | null
  clear_parent?: boolean
  description?: string | null
  manager_id?: number | null
  clear_manager?: boolean
  display_order?: number
}

export class HttpOrganizationRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async getCurrent(): Promise<Organization> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/organizations/current')
    return response.json() as Promise<Organization>
  }

  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<Organization>
  }

  async listPlatformOrganizations(filter: PlatformOrganizationFilter = {}): Promise<PlatformOrganizationList> {
    const params = new URLSearchParams()
    if (filter.q?.trim()) params.set('q', filter.q.trim())
    if (filter.status) params.set('status', filter.status)
    if (filter.limit) params.set('limit', String(filter.limit))
    if (typeof filter.offset === 'number') params.set('offset', String(filter.offset))
    const query = params.toString()
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations${query ? `?${query}` : ''}`)
    return response.json() as Promise<PlatformOrganizationList>
  }

  async createPlatformOrganization(input: CreateOrganizationInput): Promise<PlatformOrganization> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/platform/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<PlatformOrganization>
  }

  async listPlatformOrganizationOwnerCandidates(organizationId: string, query = ''): Promise<OrganizationOwnerCandidate[]> {
    const params = new URLSearchParams({ limit: '100', organization_id: organizationId })
    if (query.trim()) params.set('q', query.trim())
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/owner-candidates?${params.toString()}`)
    const data = await response.json()
    return Array.isArray(data) ? (data as OrganizationOwnerCandidate[]) : []
  }

  async assignPlatformOrganizationOwner(organizationId: string, userId: number): Promise<PlatformOrganization> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/owner`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    return response.json() as Promise<PlatformOrganization>
  }

  async updatePlatformOrganization(organizationId: string, input: UpdatePlatformOrganizationInput): Promise<PlatformOrganization> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<PlatformOrganization>
  }

  async deletePlatformOrganization(organizationId: string): Promise<void> {
    await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${encodeURIComponent(organizationId)}`, { method: 'DELETE' })
  }

  async getPlatformOrganization(organizationId: string): Promise<PlatformOrganization> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}`)
    return response.json() as Promise<PlatformOrganization>
  }

  async listPlatformIdentityProviders(organizationId: string): Promise<OrganizationIdentityProvider[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/identity-providers`)
    const data = await response.json()
    return Array.isArray(data) ? (data as OrganizationIdentityProvider[]) : []
  }

  async createPlatformIdentityProvider(organizationId: string, input: CreateOrganizationIdentityProviderInput): Promise<OrganizationIdentityProvider> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/identity-providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<OrganizationIdentityProvider>
  }

  async updatePlatformIdentityProvider(organizationId: string, providerId: string, input: UpdateOrganizationIdentityProviderInput): Promise<OrganizationIdentityProvider> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/identity-providers/${providerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<OrganizationIdentityProvider>
  }

  async deletePlatformIdentityProvider(organizationId: string, providerId: string): Promise<void> {
    await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/identity-providers/${providerId}`, { method: 'DELETE' })
  }

  async listPlatformUnits(organizationId: string): Promise<OrganizationUnit[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/units`)
    const data = await response.json()
    return Array.isArray(data) ? (data as OrganizationUnit[]) : []
  }

  async listPlatformMembers(organizationId: string): Promise<OrganizationMember[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/users`)
    const data = await response.json()
    return Array.isArray(data) ? (data as OrganizationMember[]) : []
  }

  async listPlatformGrowyPositionRoles(organizationId: string): Promise<GrowyPositionRoleMapping[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/growy-role-mappings`)
    const data = await response.json()
    return Array.isArray(data) ? (data as GrowyPositionRoleMapping[]) : []
  }

  async savePlatformGrowyPositionRoles(organizationId: string, mappings: GrowyPositionRoleMapping[]): Promise<GrowyPositionRoleMapping[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/growy-role-mappings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: mappings.map(({ position, growy_role, growy_roles }) => ({ position, growy_roles: growy_roles ?? [growy_role] })) }),
    })
    const data = await response.json()
    return Array.isArray(data) ? (data as GrowyPositionRoleMapping[]) : []
  }

  async createPlatformUnit(organizationId: string, input: CreateOrganizationUnitInput): Promise<OrganizationUnit> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<OrganizationUnit>
  }

  async updatePlatformUnit(organizationId: string, unitId: string, input: UpdateOrganizationUnitInput): Promise<OrganizationUnit> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<OrganizationUnit>
  }

  async archivePlatformUnit(organizationId: string, unitId: string): Promise<void> {
    await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/units/${unitId}`, { method: 'DELETE' })
  }

  async assignPlatformUser(organizationId: string, userId: number, input: { unit_id?: string | null; manager_id?: number | null }): Promise<void> {
    await authorizedFetch(this.sessionStore, `/api/v1/platform/organizations/${organizationId}/users/${userId}/assignment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  }

  async getTree(): Promise<OrganizationTree> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/organizations/current/tree')
    const data = await response.json() as Partial<OrganizationTree>
    return {
      organization_id: data.organization_id ?? '',
      can_manage_structure: Boolean(data.can_manage_structure),
      items: Array.isArray(data.items) ? data.items : [],
      total_units: Number(data.total_units) || 0,
      active_employee_count: Number(data.active_employee_count) || 0,
      unassigned_employee_count: Number(data.unassigned_employee_count) || 0,
    }
  }

  async listContactsAsMembers(): Promise<OrganizationMember[]> {
    const members: OrganizationMember[] = []
    const limit = 100
    for (let offset = 0; offset < 5000; offset += limit) {
      const response = await authorizedFetch(this.sessionStore, `/api/v1/contacts?limit=${limit}&offset=${offset}`)
      const data = await response.json() as { items?: Array<{ id: number; full_name?: string; email?: string; username?: string; position?: string | null; avatar_url?: string | null; availability_status?: string | null; unit_id?: string | null; manager_id?: number | null }>; total?: number }
      const items = Array.isArray(data.items) ? data.items : []
      items.forEach((item) => members.push({
        id: item.id,
        full_name: item.full_name?.trim() || item.username || item.email || `Сотрудник ${item.id}`,
        email: item.email ?? '',
        username: item.username ?? '',
        position: item.position ?? null,
        avatar_url: normalizeBackendAssetUrl(item.avatar_url ?? null) ?? item.avatar_url ?? null,
        availability_status: item.availability_status ?? null,
        unit_id: item.unit_id ?? null,
        manager_id: item.manager_id ?? null,
        is_active: true,
      }))
      if (items.length < limit || members.length >= (Number(data.total) || 0)) break
    }
    return members
  }

  async listUnits(): Promise<OrganizationUnit[]> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/organizations/current/units')
    const data = await response.json()
    return Array.isArray(data) ? (data as OrganizationUnit[]) : []
  }

  async listMembers(): Promise<OrganizationMember[]> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/organizations/current/users')
    const data = await response.json()
    return Array.isArray(data) ? (data as OrganizationMember[]) : []
  }

  async listGrowyPositionRoles(): Promise<GrowyPositionRoleMapping[]> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/organizations/current/growy-role-mappings')
    const data = await response.json()
    return Array.isArray(data) ? (data as GrowyPositionRoleMapping[]) : []
  }

  async saveGrowyPositionRoles(mappings: GrowyPositionRoleMapping[]): Promise<GrowyPositionRoleMapping[]> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/organizations/current/growy-role-mappings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: mappings.map(({ position, growy_role, growy_roles }) => ({ position, growy_roles: growy_roles ?? [growy_role] })) }),
    })
    const data = await response.json()
    return Array.isArray(data) ? (data as GrowyPositionRoleMapping[]) : []
  }

  async createUnit(input: CreateOrganizationUnitInput): Promise<OrganizationUnit> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/organizations/current/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<OrganizationUnit>
  }

  async updateUnit(unitId: string, input: UpdateOrganizationUnitInput): Promise<OrganizationUnit> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/organizations/current/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return response.json() as Promise<OrganizationUnit>
  }

  async archiveUnit(unitId: string): Promise<void> {
    await authorizedFetch(this.sessionStore, `/api/v1/organizations/current/units/${unitId}`, { method: 'DELETE' })
  }

  async assignUser(userId: number, input: { unit_id?: string | null; manager_id?: number | null }): Promise<void> {
    await authorizedFetch(this.sessionStore, `/api/v1/organizations/current/users/${userId}/assignment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  }
}
