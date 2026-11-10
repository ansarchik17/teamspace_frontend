import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { parseHttpError } from '../http/HttpError'
import { i18n } from '../../shared/i18n/i18n'
export { invitationTokenFromHash } from '../../shared/auth/invitationReturn'

export interface OrganizationInvitation {
  id: string; organization_id: string; organization_name: string; email: string; team_id?: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'; expires_at: string; created_at: string
}
export interface InvitationPage { items: OrganizationInvitation[]; total: number }
export interface IssuedInvitation { invitation: OrganizationInvitation; url: string }
export interface InvitationPreview { organization_name: string; email_hint: string; expires_at: string }
export interface InvitationRegistration {
  token: string; code: string; username: string; password: string; first_name: string; last_name: string; iin: string
}
export class HttpInvitationRepository {
  private readonly store: AuthSessionStore
  constructor(store: AuthSessionStore) { this.store = store }
  private base(org?: string): string { return org ? `/api/v1/platform/organizations/${encodeURIComponent(org)}/invitations` : '/api/v1/organizations/current/invitations' }
  private async publicRequest<T>(action: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`/api/v1/auth/invitations/${action}`, { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal, headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Accept-Language': i18n.resolvedLanguage || i18n.language || 'ru' }, body: JSON.stringify(body) })
    if (!response.ok) throw await parseHttpError(response)
    return response.json() as Promise<T>
  }
  preview(token: string, signal?: AbortSignal): Promise<InvitationPreview> { return this.publicRequest('preview', { token }, signal) }
  sendCode(token: string): Promise<{ sent: boolean; retry_after: number }> { return this.publicRequest('code', { token }) }
  register(input: InvitationRegistration): Promise<{ registered: boolean }> { return this.publicRequest('register', input) }
  async accept(token: string, code: string): Promise<void> { await authorizedFetch(this.store, '/api/v1/auth/invitations/accept', { method: 'POST', cache: 'no-store', body: JSON.stringify({ token, code }) }) }
  async list(org?: string, offset = 0, signal?: AbortSignal): Promise<InvitationPage> {
    const response = await authorizedFetch(this.store, `${this.base(org)}?limit=10&offset=${offset}`, { cache: 'no-store', signal }); return response.json() as Promise<InvitationPage>
  }
  async issue(email: string, teamId?: string, org?: string): Promise<IssuedInvitation> {
    const response = await authorizedFetch(this.store, this.base(org), { method: 'POST', cache: 'no-store', body: JSON.stringify({ email, team_id: teamId || null }) }); return response.json() as Promise<IssuedInvitation>
  }
  async resend(id: string, org?: string): Promise<IssuedInvitation> {
    const response = await authorizedFetch(this.store, `${this.base(org)}/${encodeURIComponent(id)}/resend`, { method: 'POST', cache: 'no-store' }); return response.json() as Promise<IssuedInvitation>
  }
  async revoke(id: string, org?: string): Promise<void> { await authorizedFetch(this.store, `${this.base(org)}/${encodeURIComponent(id)}`, { method: 'DELETE', cache: 'no-store' }) }
}
