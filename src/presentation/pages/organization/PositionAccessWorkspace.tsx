import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Briefcase, ChevronDown, Pencil, Search, Trash2 } from 'lucide-react'
import AppSelect from '../../../shared/ui/AppSelect'
import type { AccessApp, AccessDependency, AccessPermission, AccessPosition, OrganizationAccess } from '../../../infrastructure/repositories/HttpAccessRepository'
import type { Organization, OrganizationMember } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { ot } from './orgText'
import { getAccessApplicationState } from './positionAccessState'
import { missingPermissionDependencies } from '../../../application/access/permissionSelection'

const apps: AccessApp[] = ['odo', 'sd', 'iform']
const appNames: Record<AccessApp, string> = { get odo() { return ot('positions.t00') }, sd: 'SenimDesk', iform: 'iForm' }
const priority = () => [ot('positions.t01'), ot('positions.t02'), ot('positions.t03'), ot('positions.t04'), ot('positions.t05'), ot('positions.t06'), ot('positions.t07'), ot('positions.t08'), ot('positions.t09'), ot('positions.t10'), ot('positions.t11'), ot('positions.t12'), ot('positions.t13'), ot('positions.t14'), ot('positions.t15'), ot('positions.t16'), ot('positions.t17'), ot('positions.t18'), ot('positions.t19')]

interface Props {
  organization: Organization
  companies: Organization[]
  platformAdmin: boolean
  data: OrganizationAccess
  position?: AccessPosition
  members: OrganizationMember[]
  app: AccessApp
  selected: string[]
  dirty: boolean
  busy: boolean
  refreshRequired?: boolean
  policyConflict?: boolean
  onCompany: (id: string) => void
  onPosition: (position: AccessPosition) => void
  onApp: (app: AccessApp) => void
  onToggle: (code: string) => void
  onGroup: (permissions: AccessPermission[], enabled: boolean) => void
  onClear: () => void
  onRemoveUnavailable: () => void
  onSave: () => void
  onReset: () => void
  onCreate: () => void
  onRename: () => void
  onMemberChange: (member: OrganizationMember, assigned: boolean) => void
  onDelete: () => void
  onMode: (app: AccessApp) => void
  onLink: () => void
}

const CARD = 'rounded-2xl border border-[#E6EAF1] bg-white'
const SELECT_BUTTON = '!h-9 !rounded-[var(--ts-radius-control)] !border-[var(--ts-border)] !bg-white !text-[14px]'
const ICON_OUTLINE = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[#E6EAF1] bg-white text-[#3C4043] transition-colors hover:bg-[#F6F7F9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)] disabled:cursor-not-allowed disabled:opacity-40'

function PermissionList({ permissions, rules, unavailable, selected, disabled, search, setSearch, appTabs, onToggle, onGroup, onClear }: {
  permissions: AccessPermission[]
  appTabs: ReactNode
  search: string
  setSearch: (value: string) => void
  rules: AccessDependency[]
  unavailable: string[]
  selected: string[]
  disabled: boolean
  onToggle: Props['onToggle']
  onGroup: Props['onGroup']
  onClear: Props['onClear']
}) {
  const [group, setGroup] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const groups = [...new Set(permissions.map(p => p.group))].sort((a, b) => {
    const order = priority()
    const rank = (name: string) => { const index = order.indexOf(name); return index === -1 ? order.length : index }
    return rank(a) - rank(b)
  })
  const query = search.trim().toLowerCase()
  const visible = permissions.filter(p => (
    (!group || p.group === group) &&
    (!onlySelected || selected.includes(p.code)) &&
    (!query || `${p.name} ${p.group} ${p.description} ${p.code}`.toLowerCase().includes(query))
  ))

  return (
    <div className="flex shrink-0 flex-col @min-[800px]/access:min-h-0 @min-[800px]/access:flex-1">
      <div className="shrink-0 border-b border-[#E2E5EA] px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          {appTabs}
          <div className="w-full sm:w-[220px]">
            <AppSelect value={group} onChange={setGroup} ariaLabel={ot('positions.t22')} showButtonAvatar={false} showOptionAvatar={false} buttonClassName={SELECT_BUTTON} options={[{ value: '', label: ot('positions.t23') }, ...groups.map(name => ({ value: name, label: name }))]} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#586174]">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className={`size-4 accent-[#2458D3] ${AXIS_UI.focus}`} checked={onlySelected} onChange={e => setOnlySelected(e.target.checked)} />
            {ot('positions.onlySelected', { count: selected.length })}
          </label>
          <button type="button" disabled={disabled || !selected.length} onClick={onClear} className={`font-medium text-[#1967D2] hover:underline disabled:text-[#9AA0A6] disabled:no-underline ${AXIS_UI.focus}`}>{ot('positions.t24')}</button>
        </div>
      </div>
      <div className="h-64 overflow-y-auto overscroll-contain @min-[800px]/access:h-auto @min-[800px]/access:min-h-0 @min-[800px]/access:flex-1" aria-label={ot('positions.t25')} tabIndex={0}>
        {visible.length > 0 ? <div className="min-w-[420px]">
          <div className="flex items-center gap-3 border-b border-[#E2E5EA] bg-[#F6F7F9] px-4 py-3 text-[12px] font-medium text-[#586174]">
            <input type="checkbox" className="size-[18px] shrink-0 accent-[#2458D3]" aria-label={ot('positions.selectVisible')} checked={visible.filter(p => !unavailable.includes(p.code) || selected.includes(p.code)).length > 0 && visible.filter(p => !unavailable.includes(p.code) || selected.includes(p.code)).every(p => selected.includes(p.code))} disabled={disabled || !visible.some(p => !unavailable.includes(p.code) || selected.includes(p.code))} onChange={e => onGroup(visible.filter(p => !unavailable.includes(p.code) || selected.includes(p.code)), e.target.checked)} />
            <span className="min-w-0 flex-1">{ot('positions.t25')}</span><span className="w-1/3">{ot('positions.t22')}</span>
          </div>
          {visible.map(permission => {
            const checked = selected.includes(permission.code)
            const requirements = rules.filter(rule => rule.permission === permission.code).map(rule => rule.any_of.map(code => { const p = permissions.find(item => item.code === code); return p ? `${p.group}: ${p.name}` : code }).join(ot('positions.dependencyOr'))).join('; ')
            return <label key={permission.code} className={`flex min-h-[64px] items-center gap-3 border-b border-[#EEF0F3] px-4 py-3 last:border-b-0 ${disabled ? 'cursor-default' : 'cursor-pointer hover:bg-[#FAFBFC]'}`}>
              <input type="checkbox" className={`size-[18px] shrink-0 accent-[#2458D3] ${AXIS_UI.focus}`} checked={checked} disabled={disabled || unavailable.includes(permission.code) && !checked} onChange={() => onToggle(permission.code)} />
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium text-[#17202E]">{permission.name}</span>{permission.description && <span className="mt-0.5 block text-[12px] text-[#586174]">{permission.description}</span>}{requirements && <span className="mt-0.5 block text-[12px] text-[#586174]">{ot('positions.requiresPermissions', { names: requirements })}</span>}{unavailable.includes(permission.code) && <span className="mt-0.5 block text-[12px] text-[#8A6317]">{ot('positions.permissionUnavailable')}</span>}</span>
              <span className="w-1/3 text-[13px] text-[#586174]">{permission.group}</span>
            </label>
          })}
        </div> : <div className="px-4 py-12 text-center">
          <Search size={28} className="mx-auto text-[#7B8494]" />
          <p className="mt-3 text-[14px] font-medium">{onlySelected && !selected.length ? ot('positions.t26') : ot('positions.t27')}</p>
          <button type="button" className={`${AXIS_UI.secondaryButton} mt-4`} onClick={() => { setSearch(''); setGroup(''); setOnlySelected(false) }}>{ot('positions.t28')}</button>
        </div>}
      </div>
    </div>
  )
}

export default function PositionAccessWorkspace(props: Props) {
  const { organization, companies, platformAdmin, data, position, app, selected, dirty, busy } = props
  const [search, setSearch] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const memberMenu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => { if (memberMenu.current && !memberMenu.current.contains(event.target as Node)) memberMenu.current.open = false }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && memberMenu.current?.open) { memberMenu.current.open = false; memberMenu.current.querySelector('summary')?.focus() } }
    document.addEventListener('click', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', escape) }
  }, [])
  const disabled = busy || props.refreshRequired || organization.status !== 'active'
  const policy = position?.policies[app]
  const permissions = data.catalog[app]
  const rules = data.dependencies?.[app]
  const unavailable = data.unavailable_permissions?.[app] || []
  const hasUnavailable = selected.some(code => unavailable.includes(code))
  const missingDependencies = missingPermissionDependencies(selected, rules || [])
  const applicationState = getAccessApplicationState(app, organization.status, data)
  const saveState = dirty ? 'draft' : hasUnavailable ? 'unavailable' : !policy?.configured ? 'unconfigured' : applicationState !== 'managed' ? 'saved_inactive' : !policy.permissions.length ? 'saved_empty' : 'saved_active'

  return (
    <div className="@container/access mt-4 flex min-h-[420px] flex-1 flex-col gap-3">
      {organization.status !== 'active' && <p role="status" className="shrink-0 rounded-[8px] bg-[#FEF7E0] px-3 py-2 text-[13px] text-[#B06000]">{ot('positions.t46')}</p>}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <label className={`${AXIS_UI.inputShell} min-w-[200px] w-full sm:max-w-[360px]`}>
          <Search size={18} className="shrink-0 text-[#586174]" />
          <input className={AXIS_UI.input} aria-label={ot('positions.t21')} placeholder={ot('positions.t21')} value={search} onChange={e => setSearch(e.target.value)} />
        </label>
        {platformAdmin && <AppSelect className="w-full sm:w-[220px]" value={organization.id} disabled={busy} ariaLabel={ot('positions.t44')} searchable showButtonAvatar={false} showOptionAvatar={false} buttonClassName={SELECT_BUTTON} options={companies.map(c => ({ value: c.id, label: c.name }))} onChange={props.onCompany} />}
        <AppSelect className="w-full sm:w-[220px]" ariaLabel={ot('positions.t54')} disabled={busy || !data.positions.length} value={position?.id || ''} placeholder={ot('positions.t55')} searchable searchPlaceholder={ot('positions.t49')} showButtonAvatar={false} showOptionAvatar={false} buttonClassName={SELECT_BUTTON} options={data.positions.map(p => ({ value: p.id, label: p.name, description: ot('positions.membersCount', { count: p.user_count }) }))} onChange={id => { const found = data.positions.find(p => p.id === id); if (found) props.onPosition(found) }} />
        {position && <details ref={memberMenu} className="relative w-full sm:w-[280px]">
          <summary className={`${SELECT_BUTTON} flex cursor-pointer list-none items-center justify-between gap-2 border px-3 text-[#17202E] [&::-webkit-details-marker]:hidden`}>
            <span className="flex min-w-0 items-center gap-2"><span className="truncate">{ot('positions.manageMembers')}</span><span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] px-1 text-[12px] font-medium text-[#2458D3]">{position.user_count}</span></span><ChevronDown size={16} className="shrink-0" />
          </summary>
          <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[300px] rounded-lg border border-[#E2E5EA] bg-white p-2 shadow-lg">
            <label className={AXIS_UI.inputShell}><Search size={16} className="shrink-0 text-[#586174]" /><input className={AXIS_UI.input} aria-label={ot('positions.manageMembers')} placeholder={ot('positions.manageMembers')} value={memberSearch} onChange={e => setMemberSearch(e.target.value)} /></label>
            <div className="max-h-64 overflow-y-auto py-1">
              {props.members.filter(m => `${m.full_name} ${m.username} ${m.email}`.toLowerCase().includes(memberSearch.trim().toLowerCase())).sort((a, b) => Number(data.member_positions[String(b.id)] === position.id) - Number(data.member_positions[String(a.id)] === position.id)).map(m => {
                const assigned = data.member_positions[String(m.id)] === position.id
                return <div key={m.id} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm"><div className="min-w-0 flex-1"><span className="block break-words font-medium">{m.full_name || m.username}</span><span className="block break-all text-xs text-[#586174]">{m.email}</span></div><button type="button" className={`${AXIS_UI.secondaryButton} !text-xs ${assigned ? "!text-[#C5221F]" : ""}`} disabled={disabled || (!assigned && m.is_active === false)} onClick={() => props.onMemberChange(m, assigned)}>{ot(assigned ? 'positions.unassignShort' : 'positions.assignShort')}</button></div>
              })}
              {!props.members.some(m => `${m.full_name} ${m.username} ${m.email}`.toLowerCase().includes(memberSearch.trim().toLowerCase())) && <p className="px-2 py-3 text-sm text-[#586174]">{ot('positions.t27')}</p>}
            </div>
          </div>
        </details>}
      </div>
      <div className="flex min-h-0 flex-none @min-[800px]/access:flex-1">
        <section className={`${CARD} flex min-h-[760px] min-w-0 flex-1 flex-col @min-[800px]/access:min-h-0`} aria-label={ot('positions.t53')}>
          {position ? <>
            <div className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-3">
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-[18px] font-semibold leading-6 text-[#17202E]">{position.name}</h2>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className={ICON_OUTLINE} disabled={disabled} onClick={props.onRename} aria-label={ot('positions.t56')} title={ot('positions.t56')}><Pencil size={16} /></button>
                <button type="button" className={`${ICON_OUTLINE} hover:!text-[#C5221F]`} disabled={disabled || position.user_count > 0} onClick={props.onDelete} aria-label={ot('positions.t57')} title={position.user_count ? ot('positions.t58') : ot('positions.t57')}><Trash2 size={16} /></button>
              </div>
            </div>
            {applicationState !== 'managed' && <p role="status" className="shrink-0 border-b border-[#EEF0F3] bg-[#FFFCF3] px-4 py-2 text-[12px] leading-5 text-[#8A6317]">{ot(`positions.applicationState.${applicationState}.hint`)}</p>}
            {!rules && <p role="alert" className="px-4 py-2 text-sm text-[#B06000]">{ot('positions.dependenciesUnavailable')}</p>}
            {!!missingDependencies.length && <div role="alert" className="border-b border-[#EEF0F3] bg-[#FFFCF3] px-4 py-2 text-[12px] text-[#8A6317]">
              <p>{ot('access.dependenciesMissing')}</p>
              <button type="button" disabled={disabled} onClick={() => props.onGroup(permissions.filter(p => selected.includes(p.code)), true)} className={`mt-1 font-medium underline ${AXIS_UI.focus}`}>{ot('positions.addDependencies')}</button>
            </div>}
            <PermissionList key={`${position.id}:${app}`} appTabs={<div className="ts-tabs" role="group" aria-label={ot('positions.t59')}>{apps.map(value => {
                const active = app === value
                return <button type="button" key={value} aria-pressed={active} disabled={busy} onClick={() => props.onApp(value)} className={`ts-tab ${active ? 'ts-tab--active' : ''} ${AXIS_UI.focus}`}>
                  {appNames[value]}
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] px-1.5 text-[12px] font-medium tabular-nums ${active ? 'bg-[#E8F0FE] text-[#1967D2]' : 'bg-[#F1F3F4] text-[#586174]'}`}>{active ? selected.length : position?.policies[value].permissions.length ?? 0}</span>
                </button>
              })}</div>} search={search} setSearch={setSearch} permissions={permissions} rules={rules || []} unavailable={unavailable} selected={selected} disabled={disabled || !rules} onToggle={props.onToggle} onGroup={props.onGroup} onClear={props.onClear} />
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#EEF0F3] px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[#17202E]">{ot('positions.selectedOf', { count: selected.length, total: permissions.length })}</p>
                <p role="status" className={`mt-0.5 text-[12px] ${dirty ? 'text-[#B06000]' : 'text-[#586174]'}`}>{props.refreshRequired ? ot('positions.refreshRequired') : ot(`positions.saveState.${saveState}`)}</p>
              </div>
              <div className="flex max-w-full flex-wrap gap-2">
                <button type="button" className="ts-button ts-button--secondary ts-button--compact" disabled={busy || props.refreshRequired || (!dirty && !props.policyConflict)} onClick={props.onReset}>{props.policyConflict ? ot('positions.useServerPolicy') : ot('positions.resetChanges')}</button>
                <button type="button" className="ts-button ts-button--primary ts-button--compact min-w-[120px] justify-center" disabled={disabled || !rules || hasUnavailable || !!missingDependencies.length || (!dirty && !!policy?.configured)} onClick={props.onSave}>{busy ? ot('positions.t66') : props.policyConflict ? ot('positions.saveOwnSelection') : ot('positions.t67')}</button>
              </div>
            </div>
          </> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-6 py-10 text-center"><Briefcase size={28} className="text-[#2458D3]" /><h2 className="mt-4 text-[18px] font-semibold">{ot('positions.t55')}</h2><p className="mt-2 max-w-sm text-[14px] leading-5 text-[#586174]">{ot('positions.t69')}</p><button type="button" className={`${AXIS_UI.primaryButton} mt-5`} disabled={disabled} onClick={props.onCreate}>{ot('positions.t70')}</button></div>}
        </section>
      </div>
    </div>
  )
}
