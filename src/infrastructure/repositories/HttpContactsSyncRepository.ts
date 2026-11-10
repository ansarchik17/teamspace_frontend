import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'

export interface ContactImportIssue {
  row: number
  field: string
  message: string
}

export interface ContactImportResult {
  dry_run: boolean
  applied: boolean
  total: number
  created: number
  updated: number
  issues: ContactImportIssue[]
}

export type DirectoryType = 'ldap' | 'ad'

export interface DirectorySettings {
  type: DirectoryType
  url: string
  base_dn: string
  bind_dn: string
  filter: string
  attributes: Record<string, string>
  ca_cert_pem?: string
  enabled: boolean
}

export interface DirectoryConfig extends DirectorySettings {
  revision: number
  has_bind_password: boolean
  last_sync_at?: string | null
  last_sync_count: number
}

export class ContactsSyncError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const readError = async (response: Response, fallback: string): Promise<ContactsSyncError> => {
  let message = fallback
  try {
    const data = await response.json() as { error?: unknown; message?: unknown }
    if (typeof data.error === 'string' && data.error.trim()) message = data.error
    else if (typeof data.message === 'string' && data.message.trim()) message = data.message
  } catch {
    message = fallback
  }
  return new ContactsSyncError(message, response.status)
}

const normalizeResult = (data: Partial<ContactImportResult>): ContactImportResult => ({
  dry_run: Boolean(data.dry_run),
  applied: Boolean(data.applied),
  total: Number(data.total) || 0,
  created: Number(data.created) || 0,
  updated: Number(data.updated) || 0,
  issues: Array.isArray(data.issues) ? data.issues : [],
})

export class HttpContactsSyncRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async importFile(file: File, dryRun: boolean): Promise<ContactImportResult> {
    const body = new FormData()
    body.append('file', file)
    const response = await authorizedFetch(this.sessionStore, `/api/v1/contacts/import?dry_run=${dryRun ? 'true' : 'false'}`, { method: 'POST', body }, { returnErrorResponse: true })
    if (!response.ok) throw await readError(response, response.status === 403 ? 'Импорт доступен только владельцу компании' : 'Не удалось обработать файл')
    return normalizeResult(await response.json() as Partial<ContactImportResult>)
  }

  async getDirectoryConfig(): Promise<DirectoryConfig | null> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/contacts/directory', {}, { returnErrorResponse: true })
    if (response.status === 404) return null
    if (!response.ok) throw await readError(response, 'Не удалось загрузить настройки каталога')
    const data = await response.json() as Partial<DirectoryConfig>
    return {
      type: data.type === 'ad' ? 'ad' : 'ldap',
      url: data.url ?? '',
      base_dn: data.base_dn ?? '',
      bind_dn: data.bind_dn ?? '',
      filter: data.filter ?? '',
      attributes: data.attributes && typeof data.attributes === 'object' ? data.attributes : {},
      ca_cert_pem: data.ca_cert_pem ?? '',
      enabled: Boolean(data.enabled),
      revision: Number(data.revision) || 0,
      has_bind_password: Boolean(data.has_bind_password),
      last_sync_at: data.last_sync_at ?? null,
      last_sync_count: Number(data.last_sync_count) || 0,
    }
  }

  async saveDirectoryConfig(settings: DirectorySettings, bindPassword: string | null): Promise<void> {
    const payload: Record<string, unknown> = { ...settings }
    if (bindPassword !== null) payload.bind_password = bindPassword
    const response = await authorizedFetch(this.sessionStore, '/api/v1/contacts/directory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, { returnErrorResponse: true })
    if (!response.ok) throw await readError(response, 'Не удалось сохранить настройки каталога')
  }

  async syncDirectory(dryRun: boolean): Promise<ContactImportResult> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/contacts/directory/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: dryRun }),
    }, { returnErrorResponse: true })
    if (!response.ok) throw await readError(response, 'Не удалось выполнить синхронизацию')
    return normalizeResult(await response.json() as Partial<ContactImportResult>)
  }
}
