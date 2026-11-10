import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { HttpError } from '../http/HttpError'

export type CrmResource = 'leads' | 'contacts' | 'deals' | 'tasks' | 'lead-stages' | 'task-kanban-columns'
export interface GrowyContext {
  tenant: { id: number; name: string; is_external: boolean; external_name: string; external_id: string }
  user_id: number
  modules: Record<string, boolean>
  capabilities?: Record<string, boolean>
}
export interface CrmRecord {
  id: number
  full_name?: string
  name?: string
  first_name?: string
  last_name?: string
  phone?: string
  whatsapp?: string
  email?: string
  notes?: string
  comment?: string
  title?: string
  description?: string
  status?: string
  source?: string
  amount?: string
  manager_id?: number | null
  manager?: { id: number; full_name?: string; name?: string } | null
  custom_fields?: Record<string, unknown>
  currency?: string
  priority?: string
  task_type?: string
  kanban_position?: number
  kanban_column_id?: number | null
  system_key?: string
  next_action_at?: string | null
  assigned_to?: { id: number; name?: string; full_name?: string } | null
  created_date?: string
  due_at?: string | null
  stage?: { id: number; name: string; color?: string } | null
  contact_id?: number | null
  source_lead_id?: number | null
  lead_id?: number | null
  deal_id?: number | null
  contact?: { id: number; name?: string } | null
  lead?: { id: number; full_name?: string } | null
  is_system?: boolean
  is_active?: boolean
  is_final?: boolean
  order?: number
  color?: string
  created_source?: string
  external_source?: string
  lead_history_count?: number
  deals_count?: number
}
export interface Page<T> { results: T[]; count: number; hasNext: boolean }
export interface WhatsAppMessage {
  id: number; direction: 'inbound' | 'outbound'; text: string; message_type: string
  status: string; created_at: string; attachment?: { url?: string; name?: string; filename?: string; mime_type?: string } | null
  error?: { display_message?: string; message?: string } | null
}
export interface WhatsAppConversation {
  id: number; wa_id: string; profile_name: string; is_open: boolean
  contact: { id: number; name?: string } | null
  lead: { id: number; full_name?: string } | null
  last_message: WhatsAppMessage | null; last_message_at: string | null
}
export interface MessagePage { results: WhatsAppMessage[]; has_more: boolean; next_before_id: number | null }
export interface WhatsAppStatus { provider: string | null; connected: boolean }
export interface WhatsAppTemplate { id: string | number; name: string; status: string; category?: string; language?: string; created_at?: string; updated_at?: string; content?: { text?: string }; variable_indexes?: number[] }

const BASE = '/api/v1/growy/api/'
export class HttpGrowyPlatformRepository {
  private readonly sessionStore: AuthSessionStore
  constructor(sessionStore: AuthSessionStore) { this.sessionStore = sessionStore }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await authorizedFetch(this.sessionStore, BASE + path, init, { preserveIntegrationSession: true })
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }
  telegramResponse(path: string, init: RequestInit = {}) {
    return authorizedFetch(this.sessionStore, BASE + path, init, {
      preserveIntegrationSession: true, returnErrorResponse: true,
    })
  }
  async collection<T>(path: string, page = 1, signal?: AbortSignal): Promise<Page<T>> {
    const query = new URLSearchParams({ page: String(page), page_size: '25' })
    const data = await this.request<T[] | { results: T[]; count: number; next?: string | null; page_size?: number }>(`${path}${path.includes('?') ? '&' : '?'}${query}`, { signal })
    return Array.isArray(data) ? { results: data, count: data.length, hasNext: false } : { results: data.results, count: data.count, hasNext: data.next === undefined ? page * (data.page_size || 25) < data.count : Boolean(data.next) }
  }
  async download(path: string, filename: string) {
    const response = await authorizedFetch(this.sessionStore, BASE + path, {}, { preserveIntegrationSession: true })
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = filename
    document.body.appendChild(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
  }
  context(signal?: AbortSignal) { return this.request<GrowyContext>('context/', { signal }) }
  async list(resource: CrmResource, options: { search?: string; page?: number; filters?: Record<string, string>; signal?: AbortSignal } = {}): Promise<Page<CrmRecord>> {
    const query = new URLSearchParams({ page: String(options.page ?? 1), page_size: '25' })
    if (options.search) query.set('search', options.search)
    Object.entries(options.filters || {}).forEach(([key, value]) => { if (value) query.set(key, value) })
    const data = await this.request<CrmRecord[] | { results: CrmRecord[]; count: number; next: string | null }>(`crm/${resource}/?${query}`, { signal: options.signal })
    return Array.isArray(data) ? { results: data, count: data.length, hasNext: false } : { results: data.results, count: data.count, hasNext: Boolean(data.next) }
  }
  get(resource: CrmResource, id: number, signal?: AbortSignal) { return this.request<CrmRecord>(`crm/${resource}/${id}/`, { signal }) }
  async stages(signal?: AbortSignal) { return this.all('lead-stages', signal) }
  async all(resource: CrmResource, signal?: AbortSignal) {
    const stages: CrmRecord[] = []
    let page = 1
    while (true) {
      const result = await this.list(resource, { page, signal })
      stages.push(...result.results)
      if (!result.hasNext) return stages
      page += 1
    }
  }
  move(resource: 'leads' | 'tasks', id: number, payload: Record<string, unknown>) { return this.request<CrmRecord>(`crm/${resource}/${id}/move/`, { method: 'POST', body: JSON.stringify(payload) }) }
  reorderColumns(resource: 'lead-stages' | 'task-kanban-columns', ids: number[]) { return this.request<CrmRecord[]>(`crm/${resource}/reorder/`, { method: 'POST', body: JSON.stringify(resource === 'lead-stages' ? { stage_ids: ids } : { column_ids: ids }) }) }
  async rejectionReasons(signal?: AbortSignal): Promise<CrmRecord[]> {
    const records: CrmRecord[] = []
    let page = 1
    while (true) {
      const data = await this.request<CrmRecord[] | { results: CrmRecord[]; next: string | null }>(`crm/rejection-reasons/?page=${page}&page_size=25`, { signal })
      records.push(...(Array.isArray(data) ? data : data.results))
      if (Array.isArray(data) || !data.next) return records
      page += 1
    }
  }
  create(resource: CrmResource, data: Record<string, unknown>) { return this.request<CrmRecord>(`crm/${resource}/`, { method: 'POST', body: JSON.stringify(data) }) }
  update(resource: CrmResource, id: number, data: Record<string, unknown>) { return this.request<CrmRecord>(`crm/${resource}/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }) }
  conversations(search = '', signal?: AbortSignal) { return this.request<WhatsAppConversation[]>(`whatsapp/conversations/?${new URLSearchParams({ search })}`, { signal }) }
  conversation(id: number, signal?: AbortSignal) { return this.request<WhatsAppConversation>(`whatsapp/conversations/${id}/`, { signal }) }
  openConversation(target: { lead_id: number } | { contact_id: number }) { return this.request<WhatsAppConversation>('whatsapp/conversations/', { method: 'POST', body: JSON.stringify(target) }) }
  whatsappStatus(signal?: AbortSignal) { return this.request<WhatsAppStatus>('whatsapp/integration-status/', { signal }) }
  messages(id: number, beforeId?: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ limit: '50' })
    if (beforeId) query.set('before_id', String(beforeId))
    return this.request<MessagePage>(`whatsapp/conversations/${id}/messages/?${query}`, { signal })
  }
  searchMessages(id: number, search: string, beforeId?: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ q: search, limit: '50' })
    if (beforeId) query.set('before_id', String(beforeId))
    return this.request<MessagePage>(`whatsapp/conversations/${id}/messages/search/?${query}`, { signal })
  }
  sendMessage(id: number, text: string) { return this.request<WhatsAppMessage>(`whatsapp/conversations/${id}/messages/`, { method: 'POST', body: JSON.stringify({ text }) }) }
  markRead(id: number) { return this.request<unknown>(`whatsapp/conversations/${id}/read/`, { method: 'POST', body: '{}' }) }
  templates(signal?: AbortSignal) { return this.request<WhatsAppTemplate[]>('whatsapp/templates/', { signal }) }
  sendTemplate(id: number, template: WhatsAppTemplate, variables: string[], headerVariables: string[] = [], buttonVariables: string[] = [], attachment?: { url: string; name: string } | null) { return this.request<WhatsAppMessage>(`whatsapp/conversations/${id}/template-messages/`, { method: 'POST', body: JSON.stringify({ template_id: template.id, template_name: template.name, text_variables: variables, header_variables: headerVariables, button_variables: buttonVariables, ...(attachment ? { attachment } : {}) }) }) }
}

export const growyErrorMessage = (error: unknown): string => {
  if (error instanceof HttpError) {
    if (error.status === 403) return 'Нет доступа к этому разделу. Обратитесь к администратору компании.'
    if (error.status === 409 && error.code === 'growy_exchange_failed') return 'Для аккаунта требуется подтверждённая привязка к Growy. Обратитесь к администратору.'
    if (error.status === 401 && error.code?.startsWith('growy_')) return 'Доступ к Growy изменился. Обновите страницу или обратитесь к администратору.'
    if (error.status >= 500) return 'CRM и WhatsApp временно недоступны. Попробуйте обновить раздел позже.'
    if (error.status === 400 && error.details) {
      const details = Object.entries(error.details as Record<string, unknown>).map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ')
      return details || error.message
    }
    return error.message
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.'
}
