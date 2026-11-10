import type { MinistryDirectoryUser, MinistryLeader, MinistryPortal, MinistryProfile, MinistryStructureItem } from '../../domain/entities/MinistryPortal'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'

export class HttpMinistryRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async getPortal(ministryId: number): Promise<MinistryPortal> {
    try {
      const response = await authorizedFetch(this.sessionStore, `/api/v1/ministries/${ministryId}/portal`)
      if (!response.ok) return { id: ministryId, name: '', description: '', is_active: true } as any
      return (await response.json()) as MinistryPortal
    } catch {
      return { id: ministryId, name: '', description: '', is_active: true } as any
    }
  }

  async getDirectoryUsers(ministryId: number): Promise<MinistryDirectoryUser[]> {
    try {
      const response = await authorizedFetch(this.sessionStore, `/api/v1/ministries/${ministryId}/employees`)
      if (!response.ok) return []
      const data = await response.json()
      return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []
    } catch {
      return []
    }
  }

  async getEmployees(_ministryId: number, _params?: any): Promise<{ items: any[]; total: number }> {
    return { items: [], total: 0 }
  }

  async uploadFile(_file: File, _type?: string): Promise<{ url: string }> {
    return { url: '' }
  }

  async getLeaders(ministryId: number): Promise<MinistryLeader[]> {
    try {
      const response = await authorizedFetch(this.sessionStore, `/api/v1/ministries/${ministryId}/leaders`)
      if (!response.ok) return []
      return (await response.json()) as MinistryLeader[]
    } catch {
      return []
    }
  }

  async getStructure(ministryId: number): Promise<MinistryStructureItem[]> {
    try {
      const response = await authorizedFetch(this.sessionStore, `/api/v1/ministries/${ministryId}/structure`)
      if (!response.ok) return []
      return (await response.json()) as MinistryStructureItem[]
    } catch {
      return []
    }
  }

  async getProfile(ministryId: number): Promise<MinistryProfile> {
    try {
      const response = await authorizedFetch(this.sessionStore, `/api/v1/ministries/${ministryId}/profile`)
      if (!response.ok) return {} as any
      return (await response.json()) as MinistryProfile
    } catch {
      return {} as any
    }
  }

  async updateProfile(ministryId: number, data: Partial<MinistryProfile>): Promise<MinistryProfile> {
    try {
      const response = await authorizedFetch(this.sessionStore, `/api/v1/ministries/${ministryId}/profile`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      if (!response.ok) return {} as any
      return (await response.json()) as MinistryProfile
    } catch {
      return {} as any
    }
  }
}
