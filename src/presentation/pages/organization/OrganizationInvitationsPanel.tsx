import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HttpInvitationRepository, type InvitationPage, type OrganizationInvitation } from '../../../infrastructure/repositories/HttpInvitationRepository'
import { HttpOrganizationRepository, type OrganizationUnit } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { formatDate } from '../../../shared/i18n'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog'
import { AdminPagination, AdminPanel, AdminRowAction, AdminStatus } from './administrationUi'
import '../auth/organizationInvitations.css'

export default function OrganizationInvitationsPanel({ organizationId, disabled, onAccepted }: { organizationId?: string; disabled: boolean; onAccepted: () => void }) {
  const { t } = useTranslation('invitations')
  const store = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const repo = useMemo(() => new HttpInvitationRepository(store), [store])
  const orgRepo = useMemo(() => new HttpOrganizationRepository(store), [store])
  const [page, setPage] = useState<InvitationPage>({ items: [], total: 0 })
  const [units, setUnits] = useState<OrganizationUnit[]>([])
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [teamId, setTeamId] = useState('')
  const [link, setLink] = useState('')
  const [revoke, setRevoke] = useState<OrganizationInvitation | null>(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const abort = new AbortController(); setLoading(true)
    repo.list(organizationId, offset, abort.signal).then(result => { if (!abort.signal.aborted) { setPage(result); setError('') } })
      .catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof HttpError && cause.status < 500 ? cause.message : t('error')) })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [repo, organizationId, offset, revision, t])
  useEffect(() => {
    let alive = true
    const request = organizationId ? orgRepo.listPlatformUnits(organizationId) : orgRepo.listUnits()
    request.then(result => { if (alive) setUnits(result) }).catch(() => { if (alive) setUnits([]) })
    return () => { alive = false }
  }, [orgRepo, organizationId])
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setNotice('')
    try { await operation(); if (mounted.current) setRevision(value => value + 1) }
    catch (cause) { if (mounted.current) setError(cause instanceof HttpError && cause.status < 500 ? cause.message : t('error')) }
    finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  const showLink = (value: string) => { if (mounted.current) { setLink(value); setNotice(t('sent')); setCreateOpen(false) } }
  return <AdminPanel title={t('title')} action={<AppButton disabled={disabled || busy} onClick={() => { setEmail(''); setTeamId(''); setError(''); setCreateOpen(true) }}>{t('invite')}</AppButton>}>
    <p className="company-admin-description">{t('description')}</p>
    {notice && <p className="company-admin-notice" role="status">{notice}</p>}
    {error && <p className="company-admin-form-error" role="alert">{error}</p>}
    {link && <div className="invitation-link"><label>{t('link')}<input readOnly value={link} onFocus={event => event.currentTarget.select()} /></label><AppButton variant="secondary" onClick={() => void navigator.clipboard.writeText(link).then(() => setNotice(t('copied'))).catch(() => setNotice(t('copyManually')))}>{t('copy')}</AppButton><AppButton variant="ghost" onClick={() => setLink('')}>{t('hide')}</AppButton></div>}
    {loading ? <p role="status" className="company-admin-empty">{t('loading')}</p> : <>
      <div className="company-admin-table-scroll"><table><thead><tr><th>{t('email')}</th><th>{t('team')}</th><th>{t('status')}</th><th>{t('expires')}</th><th>{t('actions')}</th></tr></thead><tbody>{page.items.map(item => <tr key={item.id}>
        <td>{item.email}</td><td>{units.find(unit => unit.id === item.team_id)?.name ?? t('noTeam')}</td>
        <td><AdminStatus warning={item.status !== 'accepted'}>{t(`statuses.${item.status}`)}</AdminStatus></td>
        <td>{formatDate(item.expires_at)}</td><td><div className="company-admin-inline">
          {(item.status === 'pending' || item.status === 'expired') && <AdminRowAction disabled={busy || disabled} onClick={() => void run(async () => { const result = await repo.resend(item.id, organizationId); showLink(result.url) })}>{t('resend')}</AdminRowAction>}
          {(item.status === 'pending' || item.status === 'expired') && <AdminRowAction danger disabled={busy} onClick={() => setRevoke(item)}>{t('revoke')}</AdminRowAction>}
        </div></td></tr>)}</tbody></table></div>
      {!page.items.length && <p className="company-admin-empty">{t('empty')}</p>}
      <AdminPagination offset={offset} total={page.total} busy={busy || loading} change={setOffset} />
      <AppButton variant="ghost" disabled={busy} onClick={() => { setRevision(value => value + 1); onAccepted() }}>{t('refresh')}</AppButton>
    </>}
    {!loading && error && <AppButton variant="secondary" onClick={() => setRevision(value => value + 1)}>{t('retry')}</AppButton>}
    {createOpen && <AppModal title={t('invite')} onClose={() => { if (!busy) setCreateOpen(false) }} maxWidth={520}>
      <form className="invitation-form" onSubmit={event => { event.preventDefault(); void run(async () => { const result = await repo.issue(email.trim(), teamId, organizationId); showLink(result.url); if (mounted.current) setOffset(0) }) }}>
        <p>{t('createDescription')}</p><label>{t('email')}<input type="email" autoComplete="off" required maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label>
        <label>{t('team')}<select value={teamId} disabled={busy} onChange={event => setTeamId(event.target.value)}><option value="">{t('noTeam')}</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        {error && <p className="company-admin-form-error" role="alert">{error}</p>}<AppButton type="submit" isLoading={busy}>{t('sendInvitation')}</AppButton>
      </form>
    </AppModal>}
    <AppConfirmDialog open={!!revoke} title={t('revoke')} message={t('revokeDescription', { email: revoke?.email })} confirmText={t('revoke')} isLoading={busy} error={error} onCancel={() => setRevoke(null)} onConfirm={() => { if (revoke) void run(async () => { await repo.revoke(revoke.id, organizationId); if (mounted.current) { setRevoke(null); setLink(''); setNotice(t('revoked')) } }) }} />
  </AdminPanel>
}
