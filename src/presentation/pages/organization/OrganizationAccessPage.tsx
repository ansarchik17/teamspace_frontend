import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HttpAccessRepository, type OrganizationAccess, type AccessApp, type AccessPosition, type AccessPermission, type AccessSDCompany } from '../../../infrastructure/repositories/HttpAccessRepository'
import { HttpOrganizationRepository, type Organization, type OrganizationMember } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader'
import PositionAccessWorkspace from './PositionAccessWorkspace'
import AppModal from '../../../shared/ui/AppModal'
import { AccessWorkspaceSkeleton } from '../../components/people/PeopleSkeletons'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { ot } from './orgText'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { canToggleAccessManagement } from './positionAccessState'
import { changePermissionSelection, missingPermissionDependencies } from '../../../application/access/permissionSelection'

const input = 'ts-input'
const card = 'rounded-xl border border-[#E2E5EA] bg-white'
const appNames: Record<AccessApp, string> = { get odo() { return ot('access.t00') }, get sd() { return ot('access.t01') }, iform: 'iForm' }
export default function OrganizationAccessPage() {
  useTranslation('administration')
 const { organizationId } = useParams<{ organizationId: string }>()
 const navigate = useNavigate()
 const store = useMemo(() => new LocalStorageAuthSessionStore(), [])
 const repo = useMemo(() => new HttpAccessRepository(store), [store])
 const orgRepo = useMemo(() => new HttpOrganizationRepository(store), [store])
 const auth = useMemo(() => new HttpAuthRepository(store), [store])
 const [org, setOrg] = useState<Organization | null>(null)
 const [companies, setCompanies] = useState<Organization[]>([])
 const [members, setMembers] = useState<OrganizationMember[]>([])
 const [data, setData] = useState<OrganizationAccess | null>(null)
 const [positionId, setPositionId] = useState('')
 const [app, setApp] = useState<AccessApp>('odo')
 const [selected, setSelected] = useState<string[]>([])
 const [modeApp, setModeApp] = useState<AccessApp>('odo')
 const [error, setError] = useState('')
 const [notice, setNotice] = useState('')
 const [busy, setBusy] = useState(false)
 const [refreshRequired, setRefreshRequired] = useState(false)
 const [policyConflict, setPolicyConflict] = useState<{ id: string; application: AccessApp } | null>(null)
 const retainedSelection = useRef<{ id: string; application: AccessApp; permissions: string[] } | null>(null)
 const [loading, setLoading] = useState(true)
 const [dialog, setDialog] = useState<'create' | 'rename' | 'members' | 'link' | 'mode' | 'delete' | null>(null)
 const [name, setName] = useState('')
 const [memberId, setMemberId] = useState('')
 const [sdCompanyId, setSDCompanyId] = useState('')
 const [sdCompanies, setSDCompanies] = useState<AccessSDCompany[]>([])
 const [sdLoading,setSDLoading] = useState(false)
 const generation = useRef(0)
 const mutation = useRef(false)
 const accessRequest = useRef<AbortController | null>(null)
 const positions = data?.positions || []
 const current = positions.find(p => p.id === positionId)
 const policy = current?.policies[app]
 const dirty = !!policy && [...selected].sort().join('|') !== [...policy.permissions].sort().join('|')
 const scopeRef = useRef(organizationId)
 scopeRef.current = organizationId
 const reload = useCallback(async () => {
  const gen = ++generation.current
  accessRequest.current?.abort()
  const controller = new AbortController()
  accessRequest.current = controller
  mutation.current = false
  retainedSelection.current = null
  setLoading(true); setBusy(false); setRefreshRequired(false); setPolicyConflict(null); setError(''); setNotice(''); setData(null); setOrg(null); setDialog(null); setSelected([])
  try {
   const user = await auth.me()
   if (gen !== generation.current) return
   if (organizationId && user.role !== 'admin') throw new Error(ot('access.t02'))
   if (!organizationId && user.role === 'admin') {
    const result = await orgRepo.listPlatformOrganizations({ limit: 100 })
    if (gen !== generation.current) return
    if (result.items.length) navigate(`/platform/organizations/${result.items[0].id}/access`, { replace: true })
    else { setCompanies([]); setNotice(ot('access.t03')) }
    return
   }
   const company = organizationId ? await orgRepo.getPlatformOrganization(organizationId) : await orgRepo.getCurrent()
   if (gen !== generation.current) return
   if (!organizationId && !company.can_manage_structure) throw new Error(ot('access.t04'))
   const [next, people] = await Promise.all([repo.get(organizationId, controller.signal), organizationId ? orgRepo.listPlatformMembers(organizationId) : orgRepo.listMembers()])
   if (gen !== generation.current) return
   setOrg(company); setData(next); setMembers(people); setSDCompanyId(next.sd_company_id || '')
   setPositionId(prev => next.positions.some(p => p.id === prev) ? prev : next.positions[0]?.id || '')
   if (organizationId) {
    const options: Organization[] = []; let offset = 0
    while (true) { const page = await orgRepo.listPlatformOrganizations({ limit: 100, offset }); if (gen !== generation.current) return; options.push(...page.items); offset += page.items.length; if (offset >= page.total || !page.items.length) break }
    if (gen === generation.current) setCompanies(options)
   }
  } catch (e) { if (gen === generation.current) setError(e instanceof Error ? e.message : ot('access.t05')) }
  finally { if (gen === generation.current) setLoading(false) }
 }, [auth, navigate, orgRepo, organizationId, repo])
 useEffect(() => { void reload(); const epoch = generation; return () => { epoch.current++; accessRequest.current?.abort() } }, [reload])
 useEffect(() => {
  const retained = retainedSelection.current
  retainedSelection.current = null
  setSelected(retained?.id === positionId && retained.application === app ? retained.permissions : policy?.permissions || [])
 }, [positionId, app, policy])
 useEffect(() => { setPolicyConflict(null) }, [positionId, app])
 useEffect(() => { if (!dirty) return; const prevent = (event: BeforeUnloadEvent) => { event.preventDefault() }; window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent) }, [dirty])
 const canLeave = () => !dirty || window.confirm(ot('access.t06'))
 const mutate = async (action: string, payload: object, message: string) => {
  if (mutation.current || refreshRequired || org?.status !== 'active') return
  mutation.current = true
  const gen = generation.current
  const requestScope = organizationId
  const isCurrent = () => gen === generation.current && scopeRef.current === requestScope
  let committed = false
  if (action === 'policy') setPolicyConflict(null)
  setBusy(true); setError(''); setNotice('')
  try {
   await repo.change(requestScope, action, payload)
   committed = true
   if (!isCurrent()) return
   setNotice(message)
   if (action !== 'member' && action !== 'unassign') setDialog(null)
   if (action === 'member' || action === 'unassign') setMemberId('')
   const next = await repo.get(requestScope)
   if (!isCurrent()) return
   setData(next)
   const changed = payload as { id?: string; name?: string }
   const destination = action === 'position' && !changed.id ? next.positions.find(p => p.name === changed.name?.trim())?.id : action === 'member' ? changed.id : undefined
   const nextPositionId = next.positions.find(p => p.id === (destination || positionId))?.id || next.positions[0]?.id || ''
   setPositionId(nextPositionId)
   setDialog(previous => (action === 'member' || action === 'unassign') && nextPositionId === positionId && previous === 'members' ? 'members' : null)
   const people = requestScope ? await orgRepo.listPlatformMembers(requestScope) : await orgRepo.listMembers()
   if (isCurrent()) setMembers(people)
  } catch (e) {
   if (!isCurrent()) return
   if (committed) {
    setDialog(null); setRefreshRequired(true); setError(ot('access.refreshAfterSave'))
   } else if (e instanceof HttpError && e.status === 409 && (action === 'policy' || action === 'application')) {
    try {
     const latest = await repo.get(requestScope)
     if (!isCurrent()) return
     if (action === 'policy') {
      const attempted = payload as { id: string; application: AccessApp; permissions: string[]; revision: number }
      const latestPosition = latest.positions.find(p => p.id === attempted.id)
      if (!latestPosition) { setError(ot('access.positionRemoved')); return }
      const latestPolicy = latestPosition.policies[attempted.application]
      if (latestPolicy.revision === attempted.revision) { setError(e.message); return }
      if ([...latestPolicy.permissions].sort().join('|') === [...attempted.permissions].sort().join('|')) {
       setData(latest); setError(''); setNotice(ot('access.policyAlreadyCurrent')); return
      }
      retainedSelection.current = { ...attempted, permissions: [...attempted.permissions] }
      setPolicyConflict({ id: attempted.id, application: attempted.application })
      setError(ot('access.policyConflict'))
     } else {
      const attempted = payload as { application: AccessApp; revision: number }
      setDialog(null); setError(latest.apps[attempted.application].revision !== attempted.revision ? ot('access.modeConflict') : e.message)
     }
     setData(latest)
    } catch { if (isCurrent()) setError(ot('access.conflictRefreshFailed')) }
   } else setError(e instanceof Error ? e.message : ot('access.t07'))
  }
  finally { if (isCurrent()) { mutation.current = false; setBusy(false) } }
 }
 const changeSelection = (codes: string[], enabled: boolean) => {
  const rules = data?.dependencies?.[app]
  if (!rules || !data) return
  const unavailable = new Set(data.unavailable_permissions?.[app] || [])
  const catalog = enabled ? data.catalog[app].filter(p => !unavailable.has(p.code)) : data.catalog[app]
  const next = changePermissionSelection(selected, codes, enabled, catalog, rules)
  const requested = new Set(codes)
  const affected = enabled ? next.filter(code => !selected.includes(code) && !requested.has(code)) : selected.filter(code => !next.includes(code) && !requested.has(code))
  const names = affected.map(code => { const p = data.catalog[app].find(p => p.code === code); return p ? `${p.group}: ${p.name}` : code }).join('; ')
  setNotice(affected.length ? ot(enabled ? 'access.dependenciesAdded' : 'access.dependentsRemoved', { names }) : '')
  setSelected(next)
 }
 const toggle = (code: string) => changeSelection([code], !selected.includes(code))
 const toggleGroup = (permissions: AccessPermission[], enabled: boolean) => changeSelection(permissions.map(p => p.code), enabled)
 const pick = (p: AccessPosition) => { if (canLeave()) { setPositionId(p.id); setSelected(p.policies[app]?.permissions || []); setNotice('') } }
 const open = (kind: typeof dialog) => {
  if (dirty && !canLeave()) return
  setName(kind === 'create' ? '' : current?.name || ''); setMemberId(''); setDialog(kind); setError('')
  if (dirty) { setSelected(policy?.permissions || []); setNotice(ot('access.t08')) }
  if (kind === 'link' && organizationId) {setSDLoading(true); setSDCompanies([]); void repo.sdCompanies(organizationId).then(items => { if (scopeRef.current === organizationId) setSDCompanies(items) }).catch(e => setError(e instanceof Error ? e.message : ot('access.t09'))).finally(() => setSDLoading(false))}
 }
 const openMode = (value: AccessApp) => {
  if (dirty) { setError(ot('access.t10')); return }
  if (refreshRequired || !data || !org || !canToggleAccessManagement(value, org.status, data)) return
  setModeApp(value); open('mode')
 }
 return <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-[#F6F7F9] px-4 py-6 text-[#17202E] [font-family:Inter,sans-serif] md:px-6 xl:px-8">
  {(organizationId || org) && <PeopleSectionHeader active="access" title={ot('access.t11')} structureHref={organizationId ? `/platform/organizations/${organizationId}/structure` : '/organization'} accessHref={organizationId ? `/platform/organizations/${organizationId}/access` : '/organization/access'} importHref={!organizationId && org?.can_manage_structure ? '/organization/import' : undefined} description={ot('access.t12')} actions={<button type="button" className={AXIS_UI.primaryButton} disabled={busy || refreshRequired || !org || org.status !== 'active'} onClick={() => open('create')}><Plus size={18} />{ot('positions.t48')}</button>} />}
  {error && <div role="alert" className="mt-3 shrink-0 rounded-lg bg-[#FFF0F0] p-3 text-sm text-[#C03437]">{error}<button className="ml-3 underline" disabled={busy} onClick={() => { if (refreshRequired || canLeave()) void reload() }}>{ot('access.t13')}</button></div>}
  {policyConflict?.id === current?.id && policyConflict?.application === app && <details className="mt-2 rounded-lg border border-[#E2E5EA] bg-white p-3 text-sm">
   <summary className="cursor-pointer font-medium">{ot('access.serverPolicy', { count: policy?.permissions.length || 0 })}</summary>
   {policy?.permissions.length ? <ul className="mt-2 max-h-40 list-inside list-disc overflow-auto">{policy.permissions.map(code => <li key={code}>{data?.catalog[app].find(p => p.code === code)?.name || code}</li>)}</ul> : <p className="mt-2">{ot('access.serverPolicyEmpty')}</p>}
  </details>}
  {notice && <div role="status" className="mt-3 shrink-0 rounded-lg bg-[#EDF8F1] p-2 text-sm text-[#16734B]">{notice}</div>}
  {loading ? <AccessWorkspaceSkeleton label={ot('access.t14')} /> : data && org ? <PositionAccessWorkspace
   key={org.id}
   organization={org}
   companies={companies}
   platformAdmin={!!organizationId}
   data={data}
   position={current}
   members={members}
   app={app}
   selected={selected}
   dirty={dirty}
   busy={busy}
   refreshRequired={refreshRequired}
   policyConflict={policyConflict?.id === current?.id && policyConflict?.application === app}
   onCompany={id => { if (canLeave()) navigate(`/platform/organizations/${id}/access`) }}
   onPosition={pick}
   onApp={value => { if (canLeave()) { setApp(value); setSelected(current?.policies[value]?.permissions || []); setNotice('') } }}
   onToggle={toggle}
   onGroup={toggleGroup}
   onClear={() => { setSelected([]); setNotice('') }}
   onRemoveUnavailable={() => { setSelected(prev => prev.filter(code => !data.unavailable_permissions?.[app]?.includes(code))); setNotice('') }}
   onSave={() => {
    if (!current || !data.dependencies?.[app]) return
    if (selected.some(code => data.unavailable_permissions?.[app]?.includes(code))) { setError(ot('access.permissionsUnavailable')); return }
    if (missingPermissionDependencies(selected, data.dependencies[app]).length) { setError(ot('access.dependenciesMissing')); return }
    void mutate('policy', { id: current.id, application: app, permissions: selected, revision: policy?.revision || 0 }, ot('access.t15'))
   }}
   onReset={() => { setSelected(policy?.permissions || []); setPolicyConflict(null); setError(''); setNotice('') }}
   onCreate={() => open('create')}
   onRename={() => open('rename')}
   onMemberChange={(member, assigned) => {
    if (!current || (dirty && !canLeave())) return
    if (assigned && !window.confirm(ot('access.unassignConfirm', { name: member.full_name || member.username }))) return
    if (dirty) setSelected(policy?.permissions || [])
    void mutate(assigned ? 'unassign' : 'member', assigned ? { user_id: member.id } : { id: current.id, user_id: member.id }, ot(assigned ? 'access.t34' : 'access.t52'))
   }}
   onDelete={() => open('delete')}
   onMode={openMode}
   onLink={() => open('link')}
  /> : !error && <div className={`${card} mt-5 p-10 text-center`}><p className="text-sm text-[#586174]">{ot('access.t16')}</p><button className={`${AXIS_UI.primaryButton} mt-4`} onClick={() => navigate('/platform/organizations?create=1')}>{ot('access.t17')}</button></div>}
  {dialog && <AppModal
   title={{ create: ot('access.t18'), rename: ot('access.t19'), members: ot('access.membersOf', { name: current?.name || '' }), link: ot('access.t20'), mode: ot('access.modeOf', { app: appNames[modeApp] }), delete: ot('access.t21') }[dialog]}
   onClose={() => { if (!busy) setDialog(null) }}
   maxWidth={640}
   animated
   closeOnBackdrop
   footer={<>
    <button type="button" disabled={busy} className="ts-button ts-button--secondary" onClick={() => setDialog(null)}>{dialog === 'members' ? ot('access.t47') : ot('access.t48')}</button>
    <button type="button" className={dialog === 'delete' ? 'ts-button ts-button--danger' : 'ts-button ts-button--primary'} disabled={busy || org?.status !== 'active' || ((dialog === 'create' || dialog === 'rename') && !name.trim()) || (dialog === 'members' && !memberId) || (dialog === 'link' && (sdLoading || !sdCompanies.some(c => c.id === sdCompanyId)))} onClick={() => {
     if (dialog === 'create') {
      void mutate('position', { name: name.trim() }, ot('access.t50'))
     }
     if (dialog === 'rename') void mutate('position', { id: current?.id, revision: current?.revision, name }, ot('access.t51'))
     if (dialog === 'members') void mutate('member', { id: current?.id, user_id: Number(memberId) }, ot('access.t52'))
     if (dialog === 'link') void mutate('link', { company_id: sdCompanyId }, ot('access.t53'))
     if (dialog === 'mode') void mutate('application', { application: modeApp, enabled: !data?.apps[modeApp].enabled, revision: data?.apps[modeApp].revision || 0 }, ot('access.t54'))
     if (dialog === 'delete') void mutate('delete', { id: current?.id, revision: current?.revision }, ot('access.t55'))
    }}>{busy ? ot('access.t56') : { create: ot('access.t57'), rename: ot('access.t58'), members: ot('access.t59'), link: ot('access.t60'), mode: data?.apps[modeApp].enabled ? ot('access.t61') : ot('access.t62'), delete: ot('access.t63') }[dialog]}</button>
   </>}
  >
    {org?.name && <p className="mb-4 text-[13px] text-[#586174]">{org.name}</p>}
    {(dialog === 'create' || dialog === 'rename') && <label className="block text-[13px] font-medium text-[var(--ts-text-secondary)]">{ot('access.t26')}<input autoFocus className={`${input} mt-2 `} value={name} placeholder={ot('access.t23')} maxLength={255} disabled={busy} onChange={e => setName(e.target.value)} /><span className="mt-3 block text-[13px] font-normal leading-5 text-[#586174]">{dialog === 'rename' ? ot('access.t24') : ot('access.t25')}</span></label>}
    {dialog === 'members' && <>
     <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{ot('access.t33')}</h3><span className={AXIS_UI.countBadge}>{current?.user_count || 0}</span></div>
     <div className="mb-6 max-h-64 overflow-y-auto rounded-lg border border-[#E2E5EA]">
      {members.filter(m => data?.member_positions[String(m.id)] === current?.id).map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5EA] px-4 py-3 last:border-b-0"><div className="min-w-0"><p className="break-words text-sm font-medium">{m.full_name || m.username}</p><p className="mt-1 break-all text-xs text-[#586174]">{m.email}</p></div><button type="button" className={`${AXIS_UI.secondaryButton} !text-xs`} disabled={busy || org?.status !== 'active'} onClick={() => { if (window.confirm(ot('access.unassignConfirm', { name: m.full_name }))) void mutate('unassign', { user_id: m.id }, ot('access.t34')) }}>{ot('access.t35')}</button></div>)}
      {!members.some(m => data?.member_positions[String(m.id)] === current?.id) && <p className="p-5 text-center text-sm text-[#586174]">{ot('access.t36')}</p>}
     </div>
     <label className="block text-[13px] font-medium text-[var(--ts-text-secondary)]">{ot('access.t37')}<select className={`${input} mt-2 `} value={memberId} disabled={busy || org?.status !== 'active'} onChange={e => setMemberId(e.target.value)}><option value="">{ot('access.t29')}</option>{members.filter(m => m.is_active !== false && data?.member_positions[String(m.id)] !== current?.id).map(m => <option key={m.id} value={m.id}>{m.full_name || m.username} · {data?.positions.find(p => p.id === data.member_positions[String(m.id)])?.name || ot('access.t27')}</option>)}</select></label>
     <p className="mt-3 text-[13px] leading-5 text-[#586174]">{ot('access.t38')}</p>
     {!members.some(m => m.is_active !== false) && <p className="mt-3 text-sm text-[#586174]">{ot('access.t31')} <Link to="/team-contact" className="text-[#2458D3] underline">{ot('access.t32')}</Link></p>}
    </>}
    {dialog === 'link' && <>
      <p className="mb-5 text-sm leading-6 text-[#586174]">{ot('access.linkHint', { name: org?.name ?? '' })}</p>
      <label className="block text-[13px] font-medium text-[var(--ts-text-secondary)]">{ot('access.t43')}<select className={`${input} mt-2 `} value={sdCompanyId} disabled={sdLoading || busy} onChange={e => setSDCompanyId(e.target.value)}><option value="">{sdLoading ? ot('access.t39') : ot('access.t40')}</option>{sdCompanies.map(c => <option value={c.id} key={c.id}>{c.name} · {c.is_tenant_root ? ot('access.t41') : ot('access.t42')}</option>)}</select></label>
      {!sdLoading && !sdCompanies.length && !error && <p className="mt-3 text-sm text-[#586174]">{ot('access.t44')}</p>}
    </>}
    {dialog === 'mode' && <p className="text-sm leading-6">{modeApp === 'iform' ? (data?.apps.iform.enabled ? ot('access.t45') : ot('access.t46')) : data?.apps[modeApp].enabled ? ot('access.disableModeHint', { app: appNames[modeApp] }) : ot('access.enableModeHint', { app: appNames[modeApp] })}</p>}
    {dialog === 'delete' && <p className="text-sm leading-6">{ot('access.deleteHint', { name: current?.name ?? '' })}</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-[#FFF0F0] p-3 text-sm text-[#C03437]">{error}</p>}
    {dialog === 'members' && notice && <p role="status" className="mt-4 rounded-lg bg-[#EDF8F1] p-3 text-sm text-[#16734B]">{notice}</p>}
   
  </AppModal>}

 </main>
}
