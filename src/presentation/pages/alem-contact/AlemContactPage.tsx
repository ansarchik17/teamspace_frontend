import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { HttpProfileRepository } from '../../../infrastructure/repositories/HttpProfileRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import type { AlemContact, AlemContactDirectoryMeta, HrFilterField, MinistryAdminItem, UpdateUserPayload } from '../../../domain/entities/AlemContact'
import type { CurrentProfile } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import CustomSelect, { type CustomSelectOption } from '../../../shared/ui/CustomSelect'
import AppSelect from '../../../shared/ui/AppSelect'
import DataTable, { DATA_TABLE_ROW_ICON, DataTableEmpty, DataTablePager, type DataTableColumn } from '../../../shared/ui/DataTable'
import { adminText } from '../../../shared/i18n/adminText'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppModal from '../../../shared/ui/AppModal'
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog'
import { canAccessAlemContact } from '../../../shared/config/alemContactAccess'
import { useCallManager } from '../../calls/useCallManager'
import AlemContactRatingsSection from './AlemContactRatingsSection'
import { requestedContactId, withoutContactDeepLink } from './contactDeepLink'
import { loadOrganizationDirectory, loadCurrentOrganizationContact } from './loadOrganizationDirectory'
import { HttpOrganizationRepository, type OrganizationUnit, type PlatformOrganization } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { companyMailDomain, suggestedEmployeeLogin } from '../../../shared/lib/companyMailAddress'
import { HttpAccessRepository } from '../../../infrastructure/repositories/HttpAccessRepository'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import ViewToggle from '../../../shared/ui/ViewToggle'
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader'
import { authorizedFetch } from '../../../infrastructure/http/authorizedFetch'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'
import { useTranslation } from 'react-i18next'
import { ct } from './contactsText'
import { formatDate } from '../../../shared/i18n'

type DirectoryContactDto = {
  id: number
  full_name?: string
  email?: string
  username?: string
  position?: string | null
  avatar_url?: string | null
  availability_status?: string | null
  unit_id?: string | null
  unit_name?: string | null
  manager_id?: number | null
}

type DirectoryContactsResponse = { items?: DirectoryContactDto[]; total?: number; limit?: number; offset?: number }
type DirectoryFiltersResponse = { units?: Array<{ id: string; parent_unit_id?: string | null; name: string; unit_type?: string }>; positions?: string[] }

class ContactsApiUnavailableError extends Error {}

const directoryContactToAlemContact = (dto: DirectoryContactDto): AlemContact => ({
  id: dto.id,
  keycloak_id: '',
  iin: null,
  email: dto.email ?? '',
  username: dto.username || dto.email || '',
  full_name: dto.full_name?.trim() || dto.username || dto.email || '',
  first_name: null,
  last_name: null,
  middle_name: null,
  position: dto.position ?? null,
  avatar_url: normalizeBackendAssetUrl(dto.avatar_url ?? null) ?? dto.avatar_url ?? null,
  is_active: true,
  role: 'user',
  team_id: dto.unit_id ?? null,
  manager_id: dto.manager_id ?? null,
  availability_status: dto.availability_status ?? null,
  ministry_id: null,
  state_body_id: null,
  department_id: null,
  division_id: null,
  organization: null,
  department_unit: dto.unit_name ?? null,
  job_uid: null,
  sub_uid: dto.unit_id ?? null,
  job_name: null,
  person_code: null,
  person_status: 'active',
  absence_status: null,
  card_type: null,
  bin: null,
  badge_code: null,
  last_order_number: null,
  last_order_date: null,
  last_begin_date: null,
  first_begin_date: null,
  doc_type: null,
  hr_profile_id: null,
  user_created_at: '',
  hr_updated_at: null,
})

const readDirectoryError = async (response: Response, fallback: string): Promise<string> => {
  try {
    const data = await response.json() as { error?: unknown; message?: unknown }
    const message = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : ''
    return message || fallback
  } catch {
    return fallback
  }
}

const isMissingRoute = (response: Response): boolean =>
  response.status === 404 && !(response.headers.get('content-type') || '').includes('application/json')

const fetchDirectoryContacts = async (
  sessionStore: LocalStorageAuthSessionStore,
  params: { q: string; unitId: string; position: string; limit: number; offset: number; signal?: AbortSignal },
): Promise<{ items: AlemContact[]; total: number }> => {
  const search = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, params.limit))), offset: String(Math.max(0, params.offset)) })
  const q = params.q.trim().slice(0, 200)
  if (q) search.set('q', q)
  if (params.unitId) search.set('unit_id', params.unitId)
  const position = params.position.trim().slice(0, 255)
  if (position) search.set('position', position)
  const response = await authorizedFetch(sessionStore, `/api/v1/contacts?${search}`, { signal: params.signal }, { returnErrorResponse: true })
  if (response.status === 405 || response.status === 501 || isMissingRoute(response)) throw new ContactsApiUnavailableError('contacts api unavailable')
  if (!response.ok) {
    const message = await readDirectoryError(response, response.status === 404 ? ct('page.t000') : ct('page.t001'))
    if (response.status === 404 && !/компан/i.test(message)) throw new ContactsApiUnavailableError(message) // i18n-ignore
    throw new Error(message)
  }
  const data = await response.json() as DirectoryContactsResponse
  const items = (Array.isArray(data.items) ? data.items : []).map(directoryContactToAlemContact)
  return { items, total: Number(data.total) || 0 }
}

const fetchDirectoryFilters = async (sessionStore: LocalStorageAuthSessionStore): Promise<{ unitOptions: OrganizationUnitFilterOption[]; positions: string[] }> => {
  const response = await authorizedFetch(sessionStore, '/api/v1/contacts/filters', {}, { returnErrorResponse: true })
  if (!response.ok) throw new Error(await readDirectoryError(response, ct('page.t002')))
  const data = await response.json() as DirectoryFiltersResponse
  const units = Array.isArray(data.units) ? data.units.filter((unit) => unit && unit.id && unit.name) : []
  const byParent = new Map<string, typeof units>()
  const ids = new Set(units.map((unit) => unit.id))
  units.forEach((unit) => {
    const parent = unit.parent_unit_id && ids.has(unit.parent_unit_id) ? unit.parent_unit_id : ''
    byParent.set(parent, [...(byParent.get(parent) ?? []), unit])
  })
  const unitOptions: OrganizationUnitFilterOption[] = []
  const visit = (parentId: string, depth: number, trail: string[], visited: Set<string>) => {
    const children = [...(byParent.get(parentId) ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    children.forEach((unit) => {
      if (visited.has(unit.id)) return
      visited.add(unit.id)
      const path = [...trail, unit.name]
      unitOptions.push({ value: unit.id, label: unit.name, depth, parentValue: parentId || undefined, title: path.join(' / ') })
      visit(unit.id, depth + 1, path, visited)
    })
  }
  visit('', 0, [], new Set())
  const positions = [...new Set((Array.isArray(data.positions) ? data.positions : []).map((item) => String(item).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
  return { unitOptions, positions }
}

const DEFAULT_PAGE_SIZE = 20
const ORGANIZATION_UNIT_FILTER_SEPARATOR = '\u001f'

type OrganizationUnitFilterOption = {
  value: string
  label: string
  depth: number
  parentValue?: string
  title: string
}

function buildOrganizationUnitFilterOptions(contacts: AlemContact[]): OrganizationUnitFilterOption[] {
  const organizations = new Set<string>()
  const nodes = new Map<string, OrganizationUnitFilterOption>()

  for (const contact of contacts) {
    const organization = contact.organization?.trim()
    const departmentPath = contact.department_unit?.trim()
    if (!organization || !departmentPath) continue

    organizations.add(organization)
    const parts = departmentPath
      .split(' / ')
      .map((part) => part.trim())
      .filter(Boolean)
    let parentValue: string | undefined

    parts.forEach((part, depth) => {
      const path = parts.slice(0, depth + 1).join(' / ')
      const value = `${organization}${ORGANIZATION_UNIT_FILTER_SEPARATOR}${path}`
      if (!nodes.has(value)) {
        nodes.set(value, {
          value,
          label: part,
          depth,
          parentValue,
          title: `${organization} / ${path}`,
        })
      }
      parentValue = value
    })
  }

  const showOrganizationOnRoot = organizations.size > 1
  return [...nodes.values()]
    .map((option) => ({
      ...option,
      label: showOrganizationOnRoot && option.depth === 0 ? `${option.title.split(' / ')[0]} — ${option.label}` : option.label,
      title: showOrganizationOnRoot ? option.title : option.title.slice(option.title.indexOf(' / ') + 3),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'))
}

function parseOrganizationUnitFilter(value: string): { organization: string; path: string } | null {
  const separatorIndex = value.indexOf(ORGANIZATION_UNIT_FILTER_SEPARATOR)
  if (separatorIndex < 1) return null
  const organization = value.slice(0, separatorIndex)
  const path = value.slice(separatorIndex + ORGANIZATION_UNIT_FILTER_SEPARATOR.length)
  return organization && path ? { organization, path } : null
}

function buildOrganizationUnitLabels(units: OrganizationUnit[]): Map<string, string> {
  const unitsById = new Map(units.map((unit) => [unit.id, unit]))
  const labels = new Map<string, string>()

  const resolve = (unit: OrganizationUnit, trail = new Set<string>()): string => {
    const cached = labels.get(unit.id)
    if (cached) return cached
    if (trail.has(unit.id)) return unit.name

    const nextTrail = new Set(trail)
    nextTrail.add(unit.id)
    const parent = unit.parent_unit_id ? unitsById.get(unit.parent_unit_id) : undefined
    const label = parent ? `${resolve(parent, nextTrail)} / ${unit.name}` : unit.name
    labels.set(unit.id, label)
    return label
  }

  units.forEach((unit) => resolve(unit))
  return labels
}

type WorkspaceOutletContext = {
  userEmail?: string
  userRole?: string
  workspaceBootstrapReady?: boolean
}

type ContactViewMode = 'directory' | 'ratings'
type DirectoryLayoutMode = 'list' | 'grid'
type EmployeeProfileTab = 'overview' | 'about'

const AVAILABILITY_LABELS: Record<string, string> = {
  get online() { return ct('page.t003') },
  get offline() { return ct('page.t004') },
  get sick() { return ct('page.t005') },
  get vacation() { return ct('page.t006') },
}

/** Статус присутствия по-русски; неизвестные значения показываем как есть */
function availabilityLabel(value: string | null | undefined): string {
  const key = value?.trim() ?? ''
  return AVAILABILITY_LABELS[key.toLowerCase()] ?? key
}

const C = {
  ink: '#1A1F36',
  muted: '#6B7A99',
  subtle: '#9AA3B8',
  line: '#E8ECF2',
  panel: '#FFFFFF',
  page: '#F5F7FA',
  hover: '#F8F9FA',
  active: '#EEF2FF',
  primary: '#2458D3',
  primarySoft: '#EEF2FF',
  primaryGhost: '#EEF2FF',
  success: '#10B981',
}

function compactText(value: string | null | undefined, fallback = ct('page.t007')): string {
  const text = value?.trim()
  return text || fallback
}

function EmployeeInitialsBadge({ initials, size = 40 }: { initials: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: C.primary, fontSize: Math.max(11, Math.round(size * 0.34)) }}
      aria-hidden
    >
      {initials}
    </div>
  )
}

function EmployeeAvatar({
  avatarUrl,
  initials,
  size = 40,
  active,
  priority = false,
}: {
  avatarUrl: string | null | undefined
  initials: string
  size?: number
  active?: boolean
  priority?: boolean
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const normalizedUrl = avatarUrl?.trim() ?? ''
  const dotSize = size >= 64 ? 16 : 11

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {normalizedUrl && failedUrl !== normalizedUrl ? (
        <img
          src={normalizedUrl}
          alt=""
          decoding="async"
          fetchPriority={priority ? 'high' : undefined}
          onError={() => setFailedUrl(normalizedUrl)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <EmployeeInitialsBadge initials={initials} size={size} />
      )}
      {active !== undefined ? (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-white ${active ? 'bg-[#16734B]' : 'bg-[#7B8494]'}`}
          style={{ width: dotSize, height: dotSize }}
          title={active ? ct('page.t008') : ct('page.t009')}
        />
      ) : null}
    </span>
  )
}


function ContactListAvatar({ avatarUrl, initials, active }: { avatarUrl: string | null | undefined; initials: string; active?: boolean }) {
  return <EmployeeAvatar avatarUrl={avatarUrl} initials={initials} size={40} active={active} />
}

function ProfileInformationRow({
  label,
  value,
  icon,
  href,
  action,
}: {
  label: string
  value: string | number | null | undefined
  icon?: string
  href?: string
  action?: ReactNode
}) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  const text = String(value).trim()
  if (!text) return null

  return (
    <div className="flex items-start gap-3 py-2.5">
      {icon ? (
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[#586174]">
          <MaterialSymbol name={icon} size={18} color="currentColor" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-4 text-[#586174]">{label}</div>
        {href ? (
          <a href={href} className="mt-0.5 block break-words text-[14px] font-medium leading-5 text-[#2458D3] hover:underline">
            {text}
          </a>
        ) : (
          <div className="mt-0.5 break-words text-[14px] leading-5 text-[#17202E]">{text}</div>
        )}
      </div>
      {action}
    </div>
  )
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#E2E5EA] px-5 py-4 last:border-b-0">
      <h3 className="text-[14px] font-semibold leading-5 text-[#17202E]">{title}</h3>
      <div className="mt-1">{children}</div>
    </section>
  )
}

/** Строка «подпись — значение» в одну линию, как в блоке «В компании» */
function InlineInfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-3">
      <dt className="text-[12px] leading-5 text-[#586174]">{label}</dt>
      <dd className="min-w-0 break-words text-[14px] leading-5 text-[#17202E]">{value}</dd>
    </div>
  )
}

function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
      className={AXIS_UI.ghostIconButton}
      aria-label={copied ? ct('page.t010') : label}
      title={copied ? ct('page.t010') : label}
    >
      <MaterialSymbol name={copied ? 'check' : 'content_copy'} size={16} color={copied ? '#16734B' : 'currentColor'} />
    </button>
  )
}

function EmployeeNameCell({ name, initials, avatarUrl, subtitle }: { name: string; initials: string; avatarUrl: string | null | undefined; subtitle?: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-3">
    <EmployeeAvatar avatarUrl={avatarUrl} initials={initials} size={32} />
    <span className="min-w-0">
      <span className="block truncate font-semibold text-[#17202E]" title={name}>{name}</span>
      {subtitle ? <span className="block truncate text-[12px] text-[#586174]">{subtitle}</span> : null}
    </span>
  </div>
}

function EmployeeUnitCell({ row }: { row: AlemContact }) {
  return <span className="block min-w-0">
    <span className="block truncate text-[#17202E]" title={row.department_unit ?? undefined}>{compactText(row.department_unit, ct('page.t162'))}</span>
    {row.organization ? <span className="block truncate text-[12px] text-[#586174]" title={row.organization}>{row.organization}</span> : null}
  </span>
}

function EmployeeRowMenu({ onOpen, onEdit, onDelete }: { onOpen: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return

    const updatePosition = () => {
      const buttonRect = buttonRef.current?.getBoundingClientRect()
      if (!buttonRect) return
      const menuWidth = 184
      const menuHeight = menuRef.current?.offsetHeight ?? 144
      const gap = 8
      const canOpenBelow = buttonRect.bottom + menuHeight + gap <= window.innerHeight - 8
      const top = canOpenBelow ? buttonRect.bottom + gap : Math.max(8, buttonRect.top - menuHeight - gap)
      const left = Math.min(Math.max(8, buttonRect.right - menuWidth), window.innerWidth - menuWidth - 8)
      setMenuPosition({ top, left })
    }

    const frame = window.requestAnimationFrame(updatePosition)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const run = (callback: () => void) => {
    setOpen(false)
    callback()
  }

  const itemClass = 'flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] transition-colors duration-[120ms]'

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setMenuPosition(null)
          setOpen((value) => !value)
        }}
        className={DATA_TABLE_ROW_ICON}
        data-no-tooltip
        aria-label={ct('page.t011')}
        aria-expanded={open}
      >
        <MaterialSymbol name="more_horiz" size={18} color="currentColor" />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[2000] w-[184px] overflow-hidden rounded-[8px] border border-[#E2E5EA] bg-white p-1 shadow-[0_8px_24px_rgba(23,32,46,0.12)]"
              style={{
                top: menuPosition?.top ?? -1000,
                left: menuPosition?.left ?? -1000,
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  run(onOpen)
                }}
                className={`${itemClass} text-[#17202E] hover:bg-[#F6F7F9]`}
              >
                <MaterialSymbol name="person" size={16} color="currentColor" />
                {ct('page.t012')}
              </button>
              {onEdit ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    run(onEdit)
                  }}
                  className={`${itemClass} text-[#17202E] hover:bg-[#F6F7F9]`}
                >
                  <MaterialSymbol name="edit" size={16} color="currentColor" />
                  {ct('page.t013')}
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    run(onDelete)
                  }}
                  className={`${itemClass} text-[#C03437] hover:bg-[#FFF0F0]`}
                >
                  <MaterialSymbol name="delete" size={16} color="currentColor" />
                  {ct('page.t014')}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

type ContactVisibility = 'private' | 'admins' | 'managers' | 'company'

type ContactProfileDto = DirectoryContactDto & {
  work_email?: string | null
  phone?: string | null
  personal_email?: string | null
  personal_phone?: string | null
  privacy?: { personal_email_visibility?: ContactVisibility; personal_phone_visibility?: ContactVisibility } | null
  manager?: DirectoryContactDto | null
  management_chain?: DirectoryContactDto[] | null
  hierarchy_truncated?: boolean
  direct_reports_total?: number
}

type ContactActionsDto = {
  chat?: { label?: string; enabled?: boolean; disabled_reason?: string; endpoint?: string; peer_id?: number | null }
  email?: { label?: string; enabled?: boolean; disabled_reason?: string; address?: string; mailto_url?: string }
  meeting?: { label?: string; enabled?: boolean; disabled_reason?: string; title?: string; attendee_ids?: number[] }
}

type ContactProfileView = {
  actions: ContactActionsDto | null
  contact: AlemContact
  workEmail: string
  phone: string
  personalEmail: string
  personalPhone: string
  privacy: { email: ContactVisibility; phone: ContactVisibility } | null
  manager: AlemContact | null
  chain: AlemContact[]
  truncated: boolean
  reportsTotal: number
}

const CONTACT_ACTION_DISABLED_HINTS: Record<string, string> = {
  get self_contact() { return ct('page.t015') },
  get email_unavailable() { return ct('page.t016') },
}

const fetchContactActions = async (sessionStore: LocalStorageAuthSessionStore, userId: number): Promise<ContactActionsDto | null> => {
  const response = await authorizedFetch(sessionStore, `/api/v1/contacts/${userId}/actions`, {}, { returnErrorResponse: true })
  if (!response.ok) return null
  return await response.json() as ContactActionsDto
}

const isSafeMailto = (value: string | undefined): value is string => Boolean(value && /^mailto:[^\r\n]+$/i.test(value))

const CONTACT_AVATAR_MAX_BYTES = 5 * 1024 * 1024
const CONTACT_EMAIL_PATTERN = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/

const toContactProfileView = (dto: ContactProfileDto & { actions?: ContactActionsDto | null }): ContactProfileView => ({
  actions: dto.actions ?? null,
  contact: directoryContactToAlemContact(dto),
  workEmail: dto.work_email ?? '',
  phone: dto.phone ?? '',
  personalEmail: dto.personal_email ?? '',
  personalPhone: dto.personal_phone ?? '',
  privacy: dto.privacy ? { email: dto.privacy.personal_email_visibility ?? 'admins', phone: dto.privacy.personal_phone_visibility ?? 'admins' } : null,
  manager: dto.manager ? directoryContactToAlemContact(dto.manager) : null,
  chain: (Array.isArray(dto.management_chain) ? dto.management_chain : []).map(directoryContactToAlemContact),
  truncated: Boolean(dto.hierarchy_truncated),
  reportsTotal: Number(dto.direct_reports_total) || 0,
})

const fetchContactProfile = async (sessionStore: LocalStorageAuthSessionStore, userId: number): Promise<ContactProfileView> => {
  const response = await authorizedFetch(sessionStore, `/api/v1/contacts/${userId}`, {}, { returnErrorResponse: true })
  if (!response.ok) throw new Error(await readDirectoryError(response, response.status === 404 ? ct('page.t017') : ct('page.t018')))
  return toContactProfileView(await response.json() as ContactProfileDto)
}

const fetchContactReports = async (sessionStore: LocalStorageAuthSessionStore, userId: number, offset: number, limit = 20): Promise<{ items: AlemContact[]; total: number }> => {
  const response = await authorizedFetch(sessionStore, `/api/v1/contacts/${userId}/reports?limit=${limit}&offset=${offset}`, {}, { returnErrorResponse: true })
  if (!response.ok) throw new Error(await readDirectoryError(response, ct('page.t019')))
  const data = await response.json() as DirectoryContactsResponse
  return { items: (Array.isArray(data.items) ? data.items : []).map(directoryContactToAlemContact), total: Number(data.total) || 0 }
}

const normalizeContactPhone = (value: string) => value.replace(/[\s()-]/g, '')

const VISIBILITY_OPTIONS: Array<{ value: ContactVisibility; label: string }> = [
  { value: 'private', get label() { return ct('page.t020') } },
  { value: 'admins', get label() { return ct('page.t021') } },
  { value: 'managers', get label() { return ct('page.t022') } },
  { value: 'company', get label() { return ct('page.t023') } },
]

const visibilityLabel = (value: ContactVisibility) => VISIBILITY_OPTIONS.find((option) => option.value === value)?.label ?? value

type OffboardingResult = {
  user_id: number
  successor_id: number
  reason: string
  dry_run: boolean
  applied: boolean
  offboarded_at?: string
  boards: number
  projects: number
  files: number
  folders: number
  units: number
  direct_reports: number
  handover_folder_id?: string | null
  identity_sync_status?: string
}

const IDENTITY_SYNC_LABELS: Record<string, string> = {
  get pending() { return ct('page.t024') },
  get complete() { return ct('page.t025') },
}

function OffboardingDialog({ contact, sessionStore, onClose, onApplied }: { contact: AlemContact; sessionStore: LocalStorageAuthSessionStore; onClose: () => void; onApplied: () => void }) {
  const [saved, setSaved] = useState<OffboardingResult | null>(null)
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<AlemContact[]>([])
  const [successor, setSuccessor] = useState<AlemContact | null>(null)
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<OffboardingResult | null>(null)
  const [previewKey, setPreviewKey] = useState('')
  const [busy, setBusy] = useState<'preview' | 'apply' | 'status' | null>(null)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const loadSaved = useCallback(async () => {
    const response = await authorizedFetch(sessionStore, `/api/v1/contacts/${contact.id}/offboarding`, {}, { returnErrorResponse: true })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(await readDirectoryError(response, ct('page.t026')))
    return await response.json() as OffboardingResult
  }, [contact.id, sessionStore])

  useEffect(() => {
    let active = true
    loadSaved().then((result) => { if (active) setSaved(result) }).catch(() => {}).finally(() => { if (active) setLoadingSaved(false) })
    return () => { active = false }
  }, [loadSaved])

  useEffect(() => {
    if (saved) return
    let active = true
    const timer = window.setTimeout(() => {
      fetchDirectoryContacts(sessionStore, { q: query, unitId: '', position: '', limit: 20, offset: 0 })
        .then((result) => { if (active) setCandidates(result.items.filter((item) => item.id !== contact.id)) })
        .catch(() => { if (active) setCandidates([]) })
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [contact.id, query, saved, sessionStore])

  const requestKey = successor ? `${successor.id}|${reason.trim()}` : ''

  const submit = async (dryRun: boolean) => {
    if (!successor) { setError(ct('page.t027')); return }
    const trimmed = reason.trim()
    if (!trimmed || trimmed.length > 500) { setError(ct('page.t028')); return }
    setBusy(dryRun ? 'preview' : 'apply')
    setError('')
    try {
      const response = await authorizedFetch(sessionStore, `/api/v1/contacts/${contact.id}/offboarding?dry_run=${dryRun ? 'true' : 'false'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ successor_id: successor.id, reason: trimmed }),
      }, { returnErrorResponse: true })
      if (!response.ok) {
        const fallback = response.status === 507 ? ct('page.t029') : response.status === 409 ? ct('page.t030') : response.status === 403 ? ct('page.t031') : ct('page.t032')
        setError(await readDirectoryError(response, fallback))
        return
      }
      const result = await response.json() as OffboardingResult
      if (dryRun && !result.applied) {
        setPreview(result)
        setPreviewKey(requestKey)
        setConfirmed(false)
      } else {
        setSaved(result)
        onApplied()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : ct('page.t032'))
    } finally {
      setBusy(null)
    }
  }

  const counts = (result: OffboardingResult) => [
    [ct('page.t033'), result.boards], [ct('page.t034'), result.projects], [ct('page.t035'), result.files], [ct('page.t036'), result.folders], [ct('page.t037'), result.units], [ct('page.t038'), result.direct_reports],
  ] as const

  const offboardingFooter = loadingSaved || saved ? (
    <button type="button" onClick={onClose} className="ts-button ts-button--secondary">{ct('page.t040')}</button>
  ) : (
    <>
      <button type="button" onClick={onClose} disabled={busy !== null} className="ts-button ts-button--secondary">{ct('page.t052')}</button>
      <button type="button" onClick={() => void submit(true)} disabled={busy !== null || !successor || !reason.trim()} className="ts-button ts-button--secondary">{busy === 'preview' ? ct('page.t053') : ct('page.t054')}</button>
      <button type="button" onClick={() => void submit(false)} disabled={busy !== null || !preview || previewKey !== requestKey || !confirmed} className="ts-button ts-button--danger">{busy === 'apply' ? ct('page.t055') : ct('page.t056')}</button>
    </>
  )

  return (
    <AppModal title={ct('page.t039')} onClose={() => { if (busy === null) onClose() }} maxWidth={560} animated closeOnBackdrop footer={offboardingFooter}>
        <p className="text-[14px] text-[#586174]">{contact.full_name || contact.email}</p>

        {loadingSaved ? <p className="mt-4 text-[14px] text-[#586174]">{ct('page.t041')}</p> : saved ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-[8px] border border-[#BFE5D0] bg-[#F3FBF6] p-3 text-[14px] text-[#17202E]">
              {ct('page.deactivated', { date: saved.offboarded_at ? formatDate(saved.offboarded_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '', reason: saved.reason })}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {counts(saved).map(([label, value]) => (
                <div key={label} className="rounded-[6px] border border-[#E2E5EA] px-3 py-2"><div className="text-[12px] text-[#586174]">{label}</div><div className="text-[16px] font-semibold tabular-nums">{value}</div></div>
              ))}
            </div>
            <p className="text-[13px] text-[#586174]">{IDENTITY_SYNC_LABELS[saved.identity_sync_status ?? ''] ?? ct('page.identityStatus', { status: saved.identity_sync_status ?? '—' })}</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="rounded-[8px] bg-[#FFF7E6] px-3 py-2 text-[13px] leading-5 text-[#92400E]">
              {ct('page.offboardingHint')}
            </p>
            <label className="block">
              <span className="text-[12px] font-medium text-[#586174]">{ct('page.t042')}</span>
              {successor ? (
                <div className="mt-1 flex items-center justify-between gap-2 rounded-[6px] border border-[#2458D3] bg-[#EDF2FF] px-3 py-2 text-[14px]">
                  <span className="min-w-0 truncate">{successor.full_name || successor.email}{successor.position ? ` · ${successor.position}` : ''}</span>
                  <button type="button" onClick={() => { setSuccessor(null); setPreview(null) }} className="text-[13px] font-medium text-[#2458D3]">{ct('page.t043')}</button>
                </div>
              ) : (
                <>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ct('page.t044')} className="ts-input mt-1.5" />
                  <div className="mt-1 max-h-48 overflow-y-auto rounded-[6px] border border-[#E2E5EA]">
                    {candidates.length === 0 ? <p className="px-3 py-2 text-[13px] text-[#586174]">{ct('page.t045')}</p> : candidates.map((item) => (
                      <button key={item.id} type="button" onClick={() => { setSuccessor(item); setPreview(null) }} className="block w-full px-3 py-2 text-left text-[14px] hover:bg-[#F6F7F9]">
                        <span className="block truncate text-[#17202E]">{item.full_name || item.email}</span>
                        <span className="block truncate text-[12px] text-[#586174]">{item.position || item.email}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-[#586174]">{ct('page.t046')}</span>
              <textarea value={reason} onChange={(event) => { setReason(event.target.value); setPreview(null) }} maxLength={500} rows={2} placeholder={ct('page.t047')} className="ts-input mt-1.5" />
            </label>
            {preview && previewKey === requestKey ? (
              <div className="space-y-2 rounded-[8px] border border-[#C9D6F6] bg-[#F5F8FF] p-3">
                <div className="text-[14px] font-semibold text-[#17202E]">{ct('page.t048')}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {counts(preview).map(([label, value]) => (
                    <div key={label} className="rounded-[6px] bg-white px-3 py-2"><div className="text-[12px] text-[#586174]">{label}</div><div className="text-[16px] font-semibold tabular-nums">{value}</div></div>
                  ))}
                </div>
                {preview.projects > 0 || preview.boards > 0 ? <p className="text-[12px] leading-4 text-[#92400E]">{ct('page.t049')}</p> : null}
                {preview.files > 0 ? <p className="text-[12px] leading-4 text-[#92400E]">{ct('page.t050')}</p> : null}
                <label className="flex items-start gap-2 text-[13px] text-[#17202E]">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />
                  {ct('page.t051')}
                </label>
              </div>
            ) : null}
            {error ? <p className="rounded-[8px] bg-[#FFF0F0] px-3 py-2 text-[13px] text-[#C03437]">{error}</p> : null}
          </div>
        )}
    </AppModal>
  )
}

function ContactPersonButton({ person, hint, onSelect }: { person: AlemContact; hint?: string; onSelect?: (person: AlemContact) => void }) {
  const initials = (person.full_name || person.email || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
  return (
    <button
      type="button"
      onClick={() => onSelect?.(person)}
      disabled={!onSelect}
      className={`-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-[8px] p-2 text-left transition-colors duration-[120ms] hover:bg-[#F6F7F9] disabled:cursor-default ${AXIS_UI.focus}`}
    >
      <ContactListAvatar avatarUrl={person.avatar_url} initials={initials} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-5 text-[#17202E]">{person.full_name || person.email}</span>
        <span className="mt-0.5 block truncate text-[12px] leading-4 text-[#586174]">{hint || compactText(person.position, ct('page.t057'))}</span>
      </span>
      {onSelect ? <MaterialSymbol name="chevron_right" size={18} color="#586174" /> : null}
    </button>
  )
}

function ContactProfileDetails({
  userId,
  isOwn,
  sessionStore,
  onSelectContact,
  onAvatarChanged,
  onCreateMeeting,
  onStartCall,
  isCallBusy,
  callBusyLabel,
  canOffboard,
  onOffboarded,
}: {
  userId: number
  isOwn: boolean
  sessionStore: LocalStorageAuthSessionStore
  onSelectContact?: (contact: AlemContact) => void
  onAvatarChanged?: (contact: AlemContact) => void
  onCreateMeeting?: (meeting: { title: string; attendeeIds: number[] }) => void
  onStartCall?: () => void
  isCallBusy?: boolean
  callBusyLabel?: string
  canOffboard?: boolean
  onOffboarded?: () => void
}) {
  const [offboardingOpen, setOffboardingOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState<'email' | 'meeting' | null>(null)
  const [actionError, setActionError] = useState('')
  const [profile, setProfile] = useState<ContactProfileView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [emailDraft, setEmailDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [personalEmailDraft, setPersonalEmailDraft] = useState('')
  const [personalPhoneDraft, setPersonalPhoneDraft] = useState('')
  const [emailVisibilityDraft, setEmailVisibilityDraft] = useState<ContactVisibility>('admins')
  const [phoneVisibilityDraft, setPhoneVisibilityDraft] = useState<ContactVisibility>('admins')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reports, setReports] = useState<AlemContact[]>([])
  const [reportsTotal, setReportsTotal] = useState(0)
  const [reportsLoading, setReportsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchContactProfile(sessionStore, userId)
      setProfile(next)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : ct('page.t018'))
      return null
    } finally {
      setLoading(false)
    }
  }, [sessionStore, userId])

  const loadReports = useCallback(async (offset: number) => {
    setReportsLoading(true)
    try {
      const page = await fetchContactReports(sessionStore, userId, offset)
      setReports((current) => offset === 0 ? page.items : [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))])
      setReportsTotal(page.total)
    } catch {
      if (offset === 0) setReports([])
    } finally {
      setReportsLoading(false)
    }
  }, [sessionStore, userId])

  useEffect(() => {
    setEditing(false)
    setReports([])
    setReportsTotal(0)
    void reload().then((next) => { if (next && next.reportsTotal > 0) void loadReports(0) })
  }, [reload, loadReports])

  const startEdit = () => {
    setEmailDraft(profile?.workEmail ?? '')
    setPhoneDraft(profile?.phone ?? '')
    setPersonalEmailDraft(profile?.personalEmail ?? '')
    setPersonalPhoneDraft(profile?.personalPhone ?? '')
    setEmailVisibilityDraft(profile?.privacy?.email ?? 'admins')
    setPhoneVisibilityDraft(profile?.privacy?.phone ?? 'admins')
    setFormError('')
    setEditing(true)
  }

  const saveContacts = async () => {
    const email = emailDraft.trim()
    const phone = normalizeContactPhone(phoneDraft.trim())
    const personalEmail = personalEmailDraft.trim()
    const personalPhone = normalizeContactPhone(personalPhoneDraft.trim())
    if (personalEmail && (personalEmail.length > 254 || !CONTACT_EMAIL_PATTERN.test(personalEmail))) {
      setFormError(ct('page.t058'))
      return
    }
    if (personalPhone && !/^\+[1-9][0-9]{6,14}$/.test(personalPhone)) {
      setFormError(ct('page.t059'))
      return
    }
    if (email && (new TextEncoder().encode(email).length > 254 || !CONTACT_EMAIL_PATTERN.test(email))) {
      setFormError(ct('page.t060'))
      return
    }
    if (phone && !/^\+[1-9][0-9]{6,14}$/.test(phone)) {
      setFormError(ct('page.t061'))
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const response = await authorizedFetch(sessionStore, `/api/v1/contacts/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_email: email,
          phone,
          personal_email: personalEmail,
          personal_phone: personalPhone,
          personal_email_visibility: emailVisibilityDraft,
          personal_phone_visibility: phoneVisibilityDraft,
        }),
      }, { returnErrorResponse: true })
      if (!response.ok) {
        setFormError(await readDirectoryError(response, response.status === 403 ? ct('page.t062') : ct('page.t063')))
        return
      }
      setEditing(false)
      await reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : ct('page.t063'))
    } finally {
      setSaving(false)
    }
  }

  const uploadAvatar = async (file: File) => {
    if (!['image/jpeg', 'image/png'].includes(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
      setError(ct('page.t064'))
      return
    }
    if (file.size > CONTACT_AVATAR_MAX_BYTES) {
      setError(ct('page.t065'))
      return
    }
    setUploading(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', file)
      const response = await authorizedFetch(sessionStore, `/api/v1/contacts/${userId}/avatar`, { method: 'POST', body }, { returnErrorResponse: true })
      if (!response.ok) {
        setError(await readDirectoryError(response, ct('page.t066')))
        return
      }
      const next = toContactProfileView(await response.json() as ContactProfileDto)
      setProfile(next)
      onAvatarChanged?.(next.contact)
    } catch (err) {
      setError(err instanceof Error ? err.message : ct('page.t067'))
    } finally {
      setUploading(false)
    }
  }

  if (loading && !profile) return <p className="px-5 py-4 text-[14px] text-[#586174]">{ct('page.t068')}</p>
  if (!profile) return error ? <p className="px-5 py-4 text-[13px] text-[#C03437]">{error}</p> : null

  const upperChain = profile.chain.slice(1)
  const actions = profile.actions
  const actionTitle = (action?: { enabled?: boolean; disabled_reason?: string; label?: string }) =>
    action && action.enabled === false ? CONTACT_ACTION_DISABLED_HINTS[action.disabled_reason ?? ''] ?? ct('page.t069') : action?.label

  const runAction = async (kind: 'email' | 'meeting') => {
    setActionBusy(kind)
    setActionError('')
    try {
      const fresh = (await fetchContactActions(sessionStore, userId)) ?? actions
      if (!fresh) {
        setActionError(ct('page.t070'))
        return
      }
      setProfile((current) => current ? { ...current, actions: fresh } : current)
      if (kind === 'email') {
        if (!fresh.email?.enabled || !isSafeMailto(fresh.email.mailto_url)) { setActionError(actionTitle(fresh.email) || ct('page.t072')); return }
        window.location.href = fresh.email.mailto_url
      } else {
        if (!fresh.meeting?.enabled) { setActionError(actionTitle(fresh.meeting) || ct('page.t073')); return }
        onCreateMeeting?.({ title: fresh.meeting.title || ct('page.meetingWith', { name: profile.contact.full_name }), attendeeIds: (fresh.meeting.attendee_ids ?? []).filter((id) => Number.isFinite(id)) })
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : ct('page.t074'))
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <>
      {actions ? (
        <div className="border-b border-[#E2E5EA] px-5 py-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void runAction('email')} disabled={actionBusy !== null || actions.email?.enabled === false} title={actionTitle(actions.email)} className={`${AXIS_UI.secondaryButton} !h-11`}>
              <MaterialSymbol name="mail" size={18} color="currentColor" />
              Email
            </button>
            <button type="button" onClick={() => void runAction('meeting')} disabled={actionBusy !== null || actions.meeting?.enabled === false} title={actionTitle(actions.meeting)} className={`${AXIS_UI.secondaryButton} !h-11`}>
              <MaterialSymbol name="event" size={18} color="currentColor" />
              {ct('page.t077')}
            </button>
            <button type="button" onClick={onStartCall} disabled={isCallBusy || isOwn} title={isOwn ? CONTACT_ACTION_DISABLED_HINTS.self_contact : isCallBusy ? callBusyLabel : ct('page.t078')} className={`${AXIS_UI.secondaryButton} col-span-2 !h-11`}>
              <MaterialSymbol name="call" size={18} color="currentColor" />
              {ct('page.t079')}
            </button>
          </div>
          {actionError ? <p className="mt-2 rounded-[6px] bg-[#FFF0F0] px-3 py-2 text-[12px] leading-4 text-[#C03437]">{actionError}</p> : null}
        </div>
      ) : null}
      {error ? <p className="mx-5 mt-3 rounded-[6px] bg-[#FFF0F0] px-3 py-2 text-[12px] leading-4 text-[#C03437]">{error}</p> : null}
      <ProfileSection title={ct('page.t080')}>
        <ProfileInformationRow
          label={ct('page.t081')}
          value={profile.contact.email}
          href={profile.contact.email ? `mailto:${profile.contact.email}` : undefined}
          icon="mail"
          action={profile.contact.email ? <CopyValueButton value={profile.contact.email} label={ct('page.t082')} /> : undefined}
        />
        {editing ? (
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="text-[12px] text-[#586174]">{ct('page.t083')}</span>
              <input value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} maxLength={254} type="email" placeholder="name@company.kz" className="mt-1 h-10 w-full rounded-[8px] border border-[#D5DAE1] px-3 text-[14px] outline-none focus:border-[#2458D3]" />
            </label>
            <label className="block">
              <span className="text-[12px] text-[#586174]">{ct('page.t084')}</span>
              <input value={phoneDraft} onChange={(event) => setPhoneDraft(event.target.value)} maxLength={32} type="tel" placeholder="+7 701 123 45 67" className="mt-1 h-10 w-full rounded-[8px] border border-[#D5DAE1] px-3 text-[14px] outline-none focus:border-[#2458D3]" />
            </label>
            <div className="rounded-[8px] border border-[#E2E5EA] p-3">
              <div className="text-[13px] font-semibold text-[#17202E]">{ct('page.t085')}</div>
              <label className="mt-2 block">
                <span className="text-[12px] text-[#586174]">{ct('page.t086')}</span>
                <input value={personalEmailDraft} onChange={(event) => setPersonalEmailDraft(event.target.value)} maxLength={254} type="email" className="mt-1 h-10 w-full rounded-[8px] border border-[#D5DAE1] px-3 text-[14px] outline-none focus:border-[#2458D3]" />
              </label>
              <label className="mt-2 block">
                <span className="text-[12px] text-[#586174]">{ct('page.t087')}</span>
                <select value={emailVisibilityDraft} onChange={(event) => setEmailVisibilityDraft(event.target.value as ContactVisibility)} className="mt-1 h-10 w-full rounded-[8px] border border-[#D5DAE1] bg-white px-3 text-[14px] outline-none focus:border-[#2458D3]">
                  {VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="mt-2 block">
                <span className="text-[12px] text-[#586174]">{ct('page.t088')}</span>
                <input value={personalPhoneDraft} onChange={(event) => setPersonalPhoneDraft(event.target.value)} maxLength={32} type="tel" placeholder="+7 701 123 45 67" className="mt-1 h-10 w-full rounded-[8px] border border-[#D5DAE1] px-3 text-[14px] outline-none focus:border-[#2458D3]" />
              </label>
              <label className="mt-2 block">
                <span className="text-[12px] text-[#586174]">{ct('page.t089')}</span>
                <select value={phoneVisibilityDraft} onChange={(event) => setPhoneVisibilityDraft(event.target.value as ContactVisibility)} className="mt-1 h-10 w-full rounded-[8px] border border-[#D5DAE1] bg-white px-3 text-[14px] outline-none focus:border-[#2458D3]">
                  {VISIBILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[12px] leading-4 text-[#7B8494]">{ct('page.t090')}</p>
            {formError ? <p className="rounded-[6px] bg-[#FFF0F0] px-3 py-2 text-[12px] leading-4 text-[#C03437]">{formError}</p> : null}
            <div className="flex gap-2">
              <button type="button" onClick={() => void saveContacts()} disabled={saving} className={`${AXIS_UI.primaryButton} !h-9 !px-3`}>{saving ? ct('page.t091') : ct('page.t092')}</button>
              <button type="button" onClick={() => setEditing(false)} disabled={saving} className={`${AXIS_UI.secondaryButton} !h-9`}>{ct('page.t052')}</button>
            </div>
          </div>
        ) : (
          <>
            <ProfileInformationRow
              label={ct('page.t083')}
              value={profile.workEmail}
              href={profile.workEmail ? `mailto:${profile.workEmail}` : undefined}
              icon="alternate_email"
              action={profile.workEmail ? <CopyValueButton value={profile.workEmail} label={ct('page.t093')} /> : undefined}
            />
            <ProfileInformationRow
              label={ct('page.t086')}
              value={profile.personalEmail || ct('page.t094')}
              href={profile.personalEmail ? `mailto:${profile.personalEmail}` : undefined}
              icon="mail"
            />
            <ProfileInformationRow
              label={ct('page.t088')}
              value={profile.personalPhone || ct('page.t094')}
              href={profile.personalPhone ? `tel:${profile.personalPhone}` : undefined}
              icon="smartphone"
            />
            {isOwn && profile.privacy ? (
              <p className="mt-1 text-[12px] leading-4 text-[#7B8494]">{ct('page.visibilitySummary', { email: visibilityLabel(profile.privacy.email).toLocaleLowerCase(), phone: visibilityLabel(profile.privacy.phone).toLocaleLowerCase() })}</p>
            ) : null}
            <ProfileInformationRow
              label={ct('page.t095')}
              value={profile.phone}
              href={profile.phone ? `tel:${profile.phone}` : undefined}
              icon="call"
              action={profile.phone ? <CopyValueButton value={profile.phone} label={ct('page.t096')} /> : undefined}
            />
            {isOwn ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={startEdit} className={`${AXIS_UI.secondaryButton} !h-9`}>
                  <MaterialSymbol name="edit" size={16} color="currentColor" />
                  {ct('page.t097')}
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={`${AXIS_UI.secondaryButton} !h-9`}>
                  <MaterialSymbol name="photo_camera" size={16} color="currentColor" />
                  {uploading ? ct('page.t041') : ct('page.t098')}
                </button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadAvatar(file) }} />
              </div>
            ) : null}
          </>
        )}
      </ProfileSection>
      <ProfileSection title={ct('page.t099')}>
        {profile.manager ? <ContactPersonButton person={profile.manager} onSelect={onSelectContact} /> : <p className="py-2 text-[14px] text-[#586174]">{ct('page.t100')}</p>}
        {upperChain.length > 0 ? (
          <div className="mt-2">
            <div className="text-[12px] leading-4 text-[#586174]">{ct('page.t101')}</div>
            <div className="mt-1">
              {upperChain.map((person, index) => <ContactPersonButton key={`${person.id}-${index}`} person={person} hint={`${ct('page.level', { n: index + 2 })} · ${compactText(person.position, ct('page.t057'))}`} onSelect={onSelectContact} />)}
            </div>
          </div>
        ) : null}
        {profile.truncated ? <p className="mt-2 text-[12px] leading-4 text-[#B45309]">{ct('page.t102')}</p> : null}
      </ProfileSection>
      {canOffboard && !isOwn ? (
        <div className="border-b border-[#E2E5EA] px-5 py-4">
          <button type="button" onClick={() => setOffboardingOpen(true)} className={`${AXIS_UI.secondaryButton} !text-[#C03437] hover:!border-[#C03437] hover:!bg-[#FFF0F0]`}>
            <MaterialSymbol name="person_remove" size={16} color="currentColor" />
            {ct('page.t103')}
          </button>
          {offboardingOpen ? <OffboardingDialog contact={profile.contact} sessionStore={sessionStore} onClose={() => setOffboardingOpen(false)} onApplied={() => onOffboarded?.()} /> : null}
        </div>
      ) : null}
      <ProfileSection title={`${ct('page.reports')}${profile.reportsTotal ? ` · ${profile.reportsTotal}` : ''}`}>
        {profile.reportsTotal === 0 ? (
          <p className="py-2 text-[14px] text-[#586174]">{ct('page.t104')}</p>
        ) : (
          <>
            {reports.map((person) => <ContactPersonButton key={person.id} person={person} onSelect={onSelectContact} />)}
            {reportsLoading ? <p className="py-2 text-[13px] text-[#586174]">{ct('page.t041')}</p> : null}
            {!reportsLoading && reports.length < reportsTotal ? (
              <button type="button" onClick={() => void loadReports(reports.length)} className="mt-1 text-[13px] font-medium text-[#2458D3] hover:underline">{ct('page.t105')}</button>
            ) : null}
          </>
        )}
      </ProfileSection>
    </>
  )
}

function EmployeeProfilePanel({
  contact,
  initials,
  manager,
  managerInitials,
  structureHref,
  onClose,
  onStartCall,
  onSelectManager,
  onEdit,
  onDelete,
  callBusyLabel,
  isCallBusy,
  actionError,
  profileApi,
}: {
  profileApi?: { sessionStore: LocalStorageAuthSessionStore; isOwn: boolean; onSelectContact?: (contact: AlemContact) => void; onAvatarChanged?: (contact: AlemContact) => void; onCreateMeeting?: (meeting: { title: string; attendeeIds: number[] }) => void; canOffboard?: boolean; onOffboarded?: () => void }
  contact: AlemContact
  initials: string
  manager?: AlemContact
  managerInitials?: string
  structureHref: string
  onClose: () => void
  onStartCall: () => void
  onSelectManager?: () => void
  onEdit?: () => void
  onDelete?: () => void
  callBusyLabel?: string
  isCallBusy: boolean
  actionError?: string | null
}) {
  const [activeTab, setActiveTab] = useState<EmployeeProfileTab>('overview')
  const displayName =
    [contact.last_name, contact.first_name, contact.middle_name].filter(Boolean).join(' ').trim() || contact.full_name?.trim() || contact.username
  const roleLabel = contact.role === 'admin' ? ct('page.t106') : contact.role === 'manager' || contact.role === 'leader' ? ct('page.t099') : ct('page.t107')
  const placeLine = [contact.department_unit, contact.organization].map((value) => value?.trim()).filter(Boolean).join(' · ')

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[12px] border border-[#E2E5EA] bg-white">
      <div className="relative h-20 shrink-0 bg-[#EDF2FF]">
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {onEdit ? (
            <button type="button" onClick={onEdit} className={`${AXIS_UI.ghostIconButton} hover:!bg-white`} data-no-tooltip aria-label={ct('page.t108')}>
              <MaterialSymbol name="edit" size={16} color="currentColor" />
            </button>
          ) : null}
          <button type="button" onClick={onClose} className={`${AXIS_UI.ghostIconButton} hover:!bg-white`} data-no-tooltip aria-label={ct('page.t109')}>
            <MaterialSymbol name="close" size={18} color="currentColor" />
          </button>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="-mt-12 inline-flex rounded-full bg-white p-1">
          <EmployeeAvatar avatarUrl={contact.avatar_url} initials={initials} size={88} active={contact.is_active} priority />
        </div>
        <h2 className="mt-2 break-words text-[20px] font-semibold leading-7 text-[#17202E]">{displayName}</h2>
        <p className="mt-0.5 text-[14px] leading-5 text-[#586174]">{compactText(contact.position ?? contact.job_name, ct('page.t057'))}</p>
        {placeLine ? <p className="mt-0.5 text-[14px] leading-5 text-[#586174]">{placeLine}</p> : null}
        <div className="mt-2 flex items-center gap-1.5 text-[14px] leading-5 text-[#17202E]">
          <span className={`h-2 w-2 rounded-full ${contact.is_active ? 'bg-[#16734B]' : 'bg-[#7B8494]'}`} />
          {availabilityLabel(contact.availability_status) || (contact.is_active ? ct('page.t008') : ct('page.t009'))}
        </div>

        {profileApi ? null : <div className="mt-4 grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={onStartCall}
            disabled={isCallBusy}
            title={isCallBusy ? callBusyLabel : ct('page.t078')}
            className={`${AXIS_UI.secondaryButton} !h-11`}
          >
            <MaterialSymbol name="call" size={18} color="currentColor" />
            {ct('page.t079')}
          </button>
        </div>}
        {actionError ? <div className="mt-3 rounded-[6px] bg-[#FFF0F0] px-3 py-2 text-[12px] leading-4 text-[#C03437]">{actionError}</div> : null}
      </div>

      <div className="flex gap-5 border-b border-[#E2E5EA] px-5">
        {(
          [
            ['overview', ct('page.t110')],
            ['about', ct('page.t111')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}
            className={`${AXIS_UI.tab} !h-10 whitespace-nowrap ${activeTab === id ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {activeTab === 'overview' ? (
          <>
            {profileApi ? null : (
              <>
            <ProfileSection title={ct('page.t080')}>
              <ProfileInformationRow
                label={ct('page.t083')}
                value={contact.email}
                href={`mailto:${contact.email}`}
                icon="mail"
                action={contact.email ? <CopyValueButton value={contact.email} label={ct('page.t082')} /> : undefined}
              />
            </ProfileSection>
              </>
            )}
            <ProfileSection title={ct('page.t112')}>
              <dl className="mt-2 space-y-2.5">
                <InlineInfoRow label={ct('page.t113')} value={contact.organization?.trim() || '—'} />
                <InlineInfoRow label={ct('page.t114')} value={contact.department_unit?.trim() || '—'} />
                <InlineInfoRow
                  label={ct('page.t115')}
                  value={
                    <span className={`inline-flex items-center gap-1.5 font-medium ${contact.is_active ? 'text-[#16734B]' : 'text-[#586174]'}`}>
                      <span className={`h-2 w-2 rounded-full ${contact.is_active ? 'bg-[#16734B]' : 'bg-[#7B8494]'}`} />
                      {contact.is_active ? ct('page.t008') : ct('page.t009')}
                    </span>
                  }
                />
              </dl>
            </ProfileSection>
            {profileApi ? <ContactProfileDetails userId={contact.id} isOwn={profileApi.isOwn} sessionStore={profileApi.sessionStore} onSelectContact={profileApi.onSelectContact} onAvatarChanged={profileApi.onAvatarChanged} onCreateMeeting={profileApi.onCreateMeeting} onStartCall={onStartCall} isCallBusy={isCallBusy} callBusyLabel={callBusyLabel} canOffboard={profileApi.canOffboard} onOffboarded={profileApi.onOffboarded} /> : (
              <>
            <ProfileSection title={ct('page.t099')}>
              {manager ? (
                <button
                  type="button"
                  onClick={onSelectManager}
                  className={`-mx-2 mt-1 flex w-[calc(100%+16px)] items-center gap-3 rounded-[8px] p-2 text-left transition-colors duration-[120ms] hover:bg-[#F6F7F9] ${AXIS_UI.focus}`}
                >
                  <ContactListAvatar avatarUrl={manager.avatar_url} initials={managerInitials ?? '?'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium leading-5 text-[#17202E]">{manager.full_name || manager.email}</span>
                    <span className="mt-0.5 block truncate text-[12px] leading-4 text-[#586174]">
                      {compactText(manager.position ?? manager.job_name, ct('page.t057'))}
                    </span>
                  </span>
                  <MaterialSymbol name="chevron_right" size={18} color="#586174" />
                </button>
              ) : (
                <p className="py-2 text-[14px] text-[#586174]">{ct('page.t100')}</p>
              )}
            </ProfileSection>
              </>
            )}
            <Link
              to={structureHref}
              className={`flex items-center gap-3 px-5 py-4 text-[14px] font-medium text-[#2458D3] transition-colors duration-[120ms] hover:bg-[#F6F7F9] ${AXIS_UI.focus}`}
            >
              <MaterialSymbol name="account_tree" size={18} color="currentColor" />
              <span className="flex-1">{ct('page.t116')}</span>
              <MaterialSymbol name="chevron_right" size={18} color="currentColor" />
            </Link>
          </>
        ) : null}

        {activeTab === 'about' ? (
          <div className="px-5 py-3">
            <ProfileInformationRow label={ct('page.t117')} value={displayName} icon="person" />
            <ProfileInformationRow label={ct('page.t118')} value={contact.position ?? contact.job_name} icon="badge" />
            <ProfileInformationRow label={ct('page.t119')} value={roleLabel} icon="security" />
            <ProfileInformationRow label={ct('page.t120')} value={contact.is_active ? ct('page.t121') : ct('page.t122')} icon="check_circle" />
            <ProfileInformationRow label={ct('page.t123')} value={availabilityLabel(contact.availability_status)} icon="schedule" />
            {!contact.position && !contact.job_name && !contact.availability_status ? (
              <p className="mt-3 rounded-[8px] bg-[#F6F7F9] p-4 text-[14px] leading-5 text-[#586174]">{ct('page.t124')}</p>
            ) : null}
            {onEdit || onDelete ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E2E5EA] pt-4">
                {onEdit ? (
                  <button type="button" onClick={onEdit} className={AXIS_UI.secondaryButton}>
                    <MaterialSymbol name="edit" size={16} color="currentColor" />
                    {ct('page.t013')}
                  </button>
                ) : null}
                {onDelete ? (
                  <button type="button" onClick={onDelete} className={`${AXIS_UI.secondaryButton} !text-[#C03437] hover:!border-[#C03437] hover:!bg-[#FFF0F0]`}>
                    <MaterialSymbol name="delete" size={16} color="currentColor" />
                    {ct('page.t014')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MinistryAdminUserSearchSelect({
  selectedUser,
  onSelectUser,
  profileRepository,
}: {
  selectedUser: { id: number; name: string } | null
  onSelectUser: (user: { id: number; name: string } | null) => void
  profileRepository: HttpProfileRepository
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AlemContact[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setIsOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await profileRepository.listHrUsers({
          q: query.trim(),
          limit: 10,
        })
        setResults(res.contacts)
        setIsOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [query, profileRepository])

  if (selectedUser) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-[6px] border border-[#2458D3] bg-[#EDF2FF] px-3 text-[14px] font-medium text-[#2458D3]">
        <span className="truncate">
          {selectedUser.name} (ID: {selectedUser.id})
        </span>
        <button
          type="button"
          onClick={() => {
            onSelectUser(null)
            setQuery('')
          }}
          className="text-[#586174] transition hover:text-[#C03437]"
          title={ct('page.t125')}
        >
          <MaterialSymbol name="close" size={16} color="currentColor" />
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative w-48 md:w-64">
      <input
        type="text"
        placeholder={ct('page.t126')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true)
        }}
        className="h-9 w-full rounded-[6px] border border-[#7B8494] bg-white px-3 text-[14px] text-[#17202E] outline-none focus:border-[#2458D3]"
      />
      {isOpen && (
        <div className="absolute left-0 right-0 top-10 z-[800] max-h-56 overflow-y-auto rounded-[8px] border border-[#E2E5EA] bg-white p-1 shadow-[0_8px_24px_rgba(23,32,46,0.12)]">
          {loading ? (
            <div className="p-2.5 text-center text-[12px] text-[#586174]">{ct('page.t127')}</div>
          ) : results.length === 0 ? (
            <div className="p-2.5 text-center text-[12px] text-[#586174]">{ct('page.t017')}</div>
          ) : (
            results.map((u) => {
              const fullName = [u.last_name, u.first_name].filter(Boolean).join(' ') || u.full_name || u.username
              return (
                <button
                  key={`user-search-item-${u.id}`}
                  type="button"
                  onClick={() => {
                    onSelectUser({ id: u.id, name: fullName })
                    setIsOpen(false)
                    setQuery('')
                  }}
                  className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-[#F5F7FA]"
                >
                  <span className="text-[12px] font-medium text-[#17202E]">{fullName}</span>
                  <span className="text-[12px] text-[#586174]">{u.position || u.email || `ID: ${u.id}`}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function AlemContactPage() {
  useTranslation('contacts')
  const { userEmail, userRole, workspaceBootstrapReady } = useOutletContext<WorkspaceOutletContext>() ?? {}
  const navigate = useNavigate()
  const { busyLabel: callBusyLabel, isBusy: isCallBusy, startDirectCall } = useCallManager()

  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const profileRepository = useMemo(() => new HttpProfileRepository(sessionStore), [sessionStore])
  const organizationRepository = useMemo(() => new HttpOrganizationRepository(sessionStore), [sessionStore])
  const accessRepository = useMemo(() => new HttpAccessRepository(sessionStore), [sessionStore])
  const isOrganizationDirectory = true

  const [contacts, setContacts] = useState<AlemContact[]>([])
  const [directoryContacts, setDirectoryContacts] = useState<AlemContact[]>([])
  const [listMeta, setListMeta] = useState<AlemContactDirectoryMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [cursorHistory, setCursorHistory] = useState<string[]>([''])
  const [selected, setSelected] = useState<AlemContact | null>(null)
  const skipPageResetOnLayout = useRef(true)
  const [layoutMode, setLayoutMode] = useState<DirectoryLayoutMode>('list')
  const [contactActionError, setContactActionError] = useState<string | null>(null)

  const [filterJobName, setFilterJobName] = useState('')
  const [filterSubName, setFilterSubName] = useState('')
  const [filterNameGo, setFilterNameGo] = useState('')
  const [viewMode, setViewMode] = useState<ContactViewMode>('directory')
  const [canViewRatings, setCanViewRatings] = useState(false)

  const [filterOptions, setFilterOptions] = useState<Record<HrFilterField, string[]>>({
    job_name: [],
    sub_name: [],
    name_go: [],
    person_status: [],
  })
  const [organizationUnitOptions, setOrganizationUnitOptions] = useState<readonly CustomSelectOption[]>([])
  const [filtersLoading, setFiltersLoading] = useState(false)

  const [currentUser, setCurrentUser] = useState<CurrentProfile | null>(null)
  const [organizationAccess, setOrganizationAccess] = useState<{ userId: number; allowed: boolean; director: boolean; organizationId?: string } | null>(null)
  const [ministriesList, _setMinistriesList] = useState<{ id: number; name: string }[]>([])

  // User CRUD modal state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AlemContact | null>(null)
  const deletionBusy = useRef(false)
  const [deleteError, setDeleteError] = useState('')
  const [deletingUser, setDeletingUser] = useState<AlemContact | null>(null)
  const [isSubmittingUser, setIsSubmittingUser] = useState(false)
  const [isLoadingUser, setIsLoadingUser] = useState(false)
  const [userFormReady, setUserFormReady] = useState(false)
  const userFormRequest = useRef(0)
  const [userFormError, setUserFormError] = useState<string | null>(null)

  // Form fields
  const [formFirstName, setFormFirstName] = useState('')
  const [formLastName, setFormLastName] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [usernameEdited, setUsernameEdited] = useState(false)
  const [emailEdited, setEmailEdited] = useState(false)
  const [formPassword, setFormPassword] = useState('')
  const [showFormPassword, setShowFormPassword] = useState(false)
  const [formPosition, setFormPosition] = useState('')
  const [creatingPosition, setCreatingPosition] = useState(false)
  const [positionChoices, setPositionChoices] = useState<{ scope: string; items: Array<{ id: string; name: string }>; error?: boolean } | null>(null)
  const [positionRetry, setPositionRetry] = useState(0)
  const [formIin, setFormIin] = useState('')
  const [formMinistryId, setFormMinistryId] = useState<number | ''>('')
  const [formOrganizationId, setFormOrganizationId] = useState('')
  const [formTeamId, setFormTeamId] = useState('')
  const [userOrganizations, setUserOrganizations] = useState<Array<Pick<PlatformOrganization, 'id' | 'name' | 'slug'>>>([])
  const [userOrganizationUnits, setUserOrganizationUnits] = useState<OrganizationUnit[]>([])
  const [loadingUserOrganizations, setLoadingUserOrganizations] = useState(false)
  const [loadingUserOrganizationUnits, setLoadingUserOrganizationUnits] = useState(false)
  const userOrganizationUnitLabels = useMemo(() => buildOrganizationUnitLabels(userOrganizationUnits), [userOrganizationUnits])

  // Ministry Admins Management modal state (for Super Admin)
  const [isMinistryAdminsModalOpen, setIsMinistryAdminsModalOpen] = useState(false)
  const [ministryAdminsList, setMinistryAdminsList] = useState<MinistryAdminItem[]>([])
  const [loadingMinistryAdmins, setLoadingMinistryAdmins] = useState(false)
  const [assigningMinistryId, setAssigningMinistryId] = useState<number | null>(null)
  const [selectedUserForMinistry, setSelectedUserForMinistry] = useState<Record<number, { id: number; name: string } | null>>({})
  const [adminAssignError, setAdminAssignError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceBootstrapReady) return
    let active = true
    profileRepository
      .getMe()
      .then((me) => {
        if (active) setCurrentUser(me)
      })
      .catch(() => {})

    // Ministries list removed

    return () => {
      active = false
    }
  }, [workspaceBootstrapReady, profileRepository])

  const isSuperAdmin = currentUser?.role === 'admin' || userRole === 'admin'
  const [contactsApiUnavailable, setContactsApiUnavailable] = useState(false)
  const useContactsApi = isOrganizationDirectory && !isSuperAdmin && !contactsApiUnavailable
  const contactsRequestRef = useRef(0)
  const contactsAbortRef = useRef<AbortController | null>(null)
  const knownContactsRef = useRef(new Map<number, AlemContact>())
  const currentUserId = currentUser?.id
  const canManageAccess = isSuperAdmin || (
    currentUserId !== undefined && organizationAccess?.userId === currentUserId && organizationAccess.allowed
  )

  useEffect(() => {
    if (!workspaceBootstrapReady || isSuperAdmin || currentUserId === undefined) return
    let active = true
    organizationRepository.getCurrent()
      .then((organization) => {
        if (active) setOrganizationAccess({ userId: currentUserId, allowed: organization.can_manage_structure === true, director: organization.owner_id === currentUserId, organizationId: organization.id })
      })
      .catch(() => {
        if (active) setOrganizationAccess({ userId: currentUserId, allowed: false, director: false })
      })
    return () => { active = false }
  }, [workspaceBootstrapReady, isSuperAdmin, currentUserId, organizationRepository])

  const isMinistryAdmin = currentUser?.role === 'ministry_admin' || userRole === 'ministry_admin'
  const isCompanyDirector = !isSuperAdmin && currentUserId !== undefined && organizationAccess?.userId === currentUserId && organizationAccess.director
  const canManageUsers = isOrganizationDirectory ? isSuperAdmin || isCompanyDirector : isSuperAdmin || isMinistryAdmin
  const myMinistryId = currentUser?.ministryId
  const positionScope = isUserModalOpen && !editingUser && formOrganizationId ? JSON.stringify([formOrganizationId, isSuperAdmin, positionRetry]) : ''
  const positionsReady = Boolean(positionScope && positionChoices?.scope === positionScope && !positionChoices.error)
  const positionsError = Boolean(positionScope && positionChoices?.scope === positionScope && positionChoices.error)
  const positions = positionsReady ? positionChoices!.items : []
  const selectedPosition = positions.find(position => position.name.trim().toLowerCase() === formPosition.trim().toLowerCase())
  const positionInvalid = !editingUser && (creatingPosition
    ? !formPosition.trim() || Boolean(selectedPosition) || !positionsReady
    : Boolean(formPosition && (!positionsReady || !selectedPosition)))

  useEffect(() => {
    if (!positionScope) return
    let active = true
    const controller = new AbortController()
    void accessRepository.get(isSuperAdmin ? formOrganizationId : undefined, controller.signal).then(data => {
      if (active) setPositionChoices({ scope: positionScope, items: data.positions.map(({ id, name }) => ({ id, name })) })
    }).catch(() => {
      if (active) setPositionChoices({ scope: positionScope, items: [], error: true })
    })
    return () => { active = false; controller.abort() }
  }, [accessRepository, positionScope, formOrganizationId, isSuperAdmin])

  const loadUserOrganizations = useCallback(async () => {
    setLoadingUserOrganizations(true)
    try {
      if (isSuperAdmin) {
        const result = await organizationRepository.listPlatformOrganizations({
          status: 'active',
          limit: 100,
          offset: 0,
        })
        setUserOrganizations(result.items.map((item) => ({ id: item.id, name: item.name, slug: item.slug })))
      } else {
        const current = await organizationRepository.getCurrent()
        setUserOrganizations([{ id: current.id, name: current.name, slug: current.slug }])
        setFormOrganizationId(current.id)
        setLoadingUserOrganizationUnits(true)
        try {
          setUserOrganizationUnits(await organizationRepository.listUnits())
        } catch {
          setUserOrganizationUnits([])
        } finally {
          setLoadingUserOrganizationUnits(false)
        }
      }
    } catch (err) {
      setUserFormError(err instanceof Error ? err.message : ct('page.t128'))
      setUserOrganizations([])
    } finally {
      setLoadingUserOrganizations(false)
    }
  }, [isSuperAdmin, organizationRepository])

  const selectedMailDomain = companyMailDomain(userOrganizations.find((organization) => organization.id === formOrganizationId)?.slug || '')
  const effectiveFormUsername = !editingUser && !usernameEdited
    ? suggestedEmployeeLogin(formFirstName, formLastName)
    : formUsername
  const effectiveFormEmail = !editingUser && isOrganizationDirectory && !emailEdited
    ? (effectiveFormUsername && selectedMailDomain ? `${effectiveFormUsername}@${selectedMailDomain}` : '')
    : formEmail

  const loadUserOrganizationUnits = useCallback(
    async (organizationId: string) => {
      if (!organizationId) {
        setUserOrganizationUnits([])
        return
      }
      setLoadingUserOrganizationUnits(true)
      try {
        const units = isSuperAdmin ? await organizationRepository.listPlatformUnits(organizationId) : await organizationRepository.listUnits()
        setUserOrganizationUnits(units)
      } catch (err) {
        setUserFormError(err instanceof Error ? err.message : ct('page.t129'))
        setUserOrganizationUnits([])
      } finally {
        setLoadingUserOrganizationUnits(false)
      }
    },
    [isSuperAdmin, organizationRepository],
  )

  // Auto-filter organization for Ministry Admin
  useEffect(() => {
    if (isMinistryAdmin && myMinistryId && ministriesList.length > 0) {
      const myMin = ministriesList.find((m) => m.id === myMinistryId)
      if (myMin && !filterNameGo) {
        setFilterNameGo(myMin.name)
      }
    }
  }, [isMinistryAdmin, myMinistryId, ministriesList, filterNameGo])

  const openAddUserModal = useCallback(() => {
    userFormRequest.current++
    setIsLoadingUser(false)
    setUserFormReady(true)
    setEditingUser(null)
    setFormFirstName('')
    setFormLastName('')
    setFormUsername('')
    setFormEmail('')
    setUsernameEdited(false)
    setEmailEdited(false)
    setFormPassword('')
    setShowFormPassword(false)
    setFormPosition('')
    setCreatingPosition(false)
    setPositionChoices(null)
    setFormIin('')
    setFormMinistryId(isMinistryAdmin && myMinistryId ? myMinistryId : '')
    setFormOrganizationId('')
    setFormTeamId('')
    setUserOrganizationUnits([])
    setUserFormError(null)
    setIsUserModalOpen(true)
    void loadUserOrganizations()
  }, [isMinistryAdmin, myMinistryId, loadUserOrganizations])

  // Переход из «Структуры» по кнопке «Добавить сотрудника» сразу открывает форму
  const location = useLocation()
  const openAddUserRequested = Boolean((location.state as { openAddUser?: boolean } | null)?.openAddUser)
  useEffect(() => {
    if (!openAddUserRequested || !canManageUsers) return
    openAddUserModal()
    navigate(location.pathname, { replace: true, state: null })
  }, [canManageUsers, location.pathname, navigate, openAddUserModal, openAddUserRequested])

  const openContactRequestId = requestedContactId(location.search, (location.state as { openContactId?: number } | null)?.openContactId)
  useEffect(() => {
    if (!openContactRequestId || !workspaceBootstrapReady) return
    let cancelled = false
    void loadCurrentOrganizationContact(sessionStore, openContactRequestId)
      .then((contact) => {
        if (!contact) throw new Error(ct('page.t017'))
        if (cancelled) return
        knownContactsRef.current.set(contact.id, contact)
        setContactActionError(null)
        setSelected(contact)
      })
      .catch((err) => { if (!cancelled) setContactActionError(err instanceof Error ? err.message : ct('page.t130')) })
      .finally(() => {
        if (!cancelled) navigate({ pathname: location.pathname, search: withoutContactDeepLink(location.search), hash: location.hash }, { replace: true, state: null })
      })
    return () => { cancelled = true }
  }, [location.pathname, location.search, location.hash, navigate, openContactRequestId, sessionStore, workspaceBootstrapReady])

  const openEditUserModal = useCallback(
    (contact: AlemContact) => {
      const request = ++userFormRequest.current
      setIsLoadingUser(true)
      setUserFormReady(false)
      setEditingUser(contact)
      setFormFirstName(contact.first_name || '')
      setFormLastName(contact.last_name || '')
      setFormUsername(contact.username || '')
      setFormEmail(contact.email || '')
      setUsernameEdited(true)
      setEmailEdited(true)
      setFormPassword('')
      setShowFormPassword(false)
      setFormPosition(contact.position || contact.job_name || '')
      setFormIin(contact.iin || '')
      setFormMinistryId(contact.ministry_id || (isMinistryAdmin && myMinistryId ? myMinistryId : ''))
      setFormOrganizationId(contact.organization_id || '')
      setFormTeamId(contact.team_id || '')
      setUserOrganizationUnits([])
      setUserFormError(null)
      setIsUserModalOpen(true)
      void profileRepository.getUserForEdit(contact.id).then(profile => {
        if (userFormRequest.current !== request) return
        // The directory is a summary. Only the account response is authoritative for editable fields.
        setEditingUser({ ...profile, organization: contact.organization, department_unit: contact.department_unit })
        setFormFirstName(profile.first_name || '')
        setFormLastName(profile.last_name || '')
        setFormUsername(profile.username)
        setFormEmail(profile.email)
        setFormPosition(profile.position || '')
        setFormIin(profile.iin || '')
        setFormOrganizationId(profile.organization_id || contact.organization_id || '')
        setFormTeamId(profile.team_id || '')
        setUserFormReady(true)
      }).catch(err => {
        if (userFormRequest.current === request) setUserFormError(err instanceof Error ? err.message : ct('page.t131'))
      }).finally(() => {
        if (userFormRequest.current === request) setIsLoadingUser(false)
      })
    },
    [isMinistryAdmin, myMinistryId, profileRepository],
  )

  const closeUserModal = () => {
    if (isSubmittingUser) return
    userFormRequest.current++
    setIsLoadingUser(false)
    setIsUserModalOpen(false)
  }

  useEffect(() => {
    const request = userFormRequest
    return () => { request.current++ }
  }, [])

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmittingUser || !userFormReady) return
    setUserFormError(null)
    if ((!editingUser && (!formFirstName.trim() || !formLastName.trim() || !formIin.trim())) || !effectiveFormEmail.trim()) {
      setUserFormError(editingUser ? ct('page.requiredEdit') : ct('page.requiredCreate'))
      return
    }
    if (editingUser && ((!formFirstName.trim() && editingUser.first_name?.trim()) || (!formLastName.trim() && editingUser.last_name?.trim()))) {
      setUserFormError(ct('page.t132'))
      return
    }
    if (isOrganizationDirectory && !editingUser && !formOrganizationId) {
      setUserFormError(ct('page.t133'))
      return
    }
    if (!editingUser && (!effectiveFormUsername.trim() || !formPassword.trim())) {
      setUserFormError(ct('page.t134'))
      return
    }
    if (isOrganizationDirectory && !editingUser) {
      if (!selectedMailDomain) {
        setUserFormError(ct('page.t135'))
        return
      }
      if (!/^[a-z0-9][a-z0-9._-]{1,48}[a-z0-9]$/.test(effectiveFormUsername.trim()) || effectiveFormUsername.includes('..')) {
        setUserFormError(ct('page.t136'))
        return
      }
      const address = effectiveFormEmail.trim().toLowerCase()
      const local = address.slice(0, -(selectedMailDomain.length + 1))
      if (!address.endsWith(`@${selectedMailDomain}`) || !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(local) || local.includes('..')) {
        setUserFormError(ct('page.emailDomain', { domain: selectedMailDomain }))
        return
      }
    }

    if (positionInvalid) {
      setUserFormError(ct(creatingPosition && selectedPosition ? 'positionChoice.duplicate' : 'positionChoice.required'))
      return
    }
    setIsSubmittingUser(true)
    try {
      if (editingUser) {
        const payload: UpdateUserPayload = {}
        const values = { first_name: formFirstName, last_name: formLastName, email: effectiveFormEmail, position: formPosition, iin: formIin }
        for (const key of ['first_name', 'last_name', 'email', 'position', 'iin'] as const) {
          const value = values[key].trim()
          if (value !== (editingUser[key] || '').trim()) payload[key] = value
        }
        if (formPassword.trim()) payload.password = formPassword.trim()
        if (Object.keys(payload).length) await profileRepository.updateUser(editingUser.id, payload)
      } else {
        await profileRepository.createUser({
          first_name: formFirstName.trim(),
          last_name: formLastName.trim(),
          username: effectiveFormUsername.trim(),
          email: effectiveFormEmail.trim(),
          password: formPassword.trim(),
          position: formPosition.trim() || undefined,
          iin: formIin.trim() || undefined,
          organization_id: isOrganizationDirectory ? formOrganizationId : undefined,
          team_id: isOrganizationDirectory && formTeamId ? formTeamId : undefined,
          ministry_id: formMinistryId !== '' ? Number(formMinistryId) : isMinistryAdmin && myMinistryId ? myMinistryId : undefined,
        })
      }
      setIsUserModalOpen(false)
      void load()
    } catch (err) {
      setUserFormError(err instanceof Error ? err.message : ct('page.t137'))
    } finally {
      setIsSubmittingUser(false)
    }
  }

  const handleDeleteUserConfirm = async () => {
    if (!deletingUser || deletionBusy.current) return
    deletionBusy.current = true
    setDeleteError('')
    setIsSubmittingUser(true)
    try {
      await profileRepository.deleteUser(deletingUser.id)
      setDeletingUser(null)
      if (selected?.id === deletingUser.id) setSelected(null)
      void load()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : adminText('deleteFailed'))
    } finally {
      deletionBusy.current = false
      setIsSubmittingUser(false)
    }
  }

  const openMinistryAdminsModal = async () => {
    setIsMinistryAdminsModalOpen(true)
    setLoadingMinistryAdmins(true)
    setAdminAssignError(null)
    try {
      const list = await profileRepository.listMinistryAdmins()
      setMinistryAdminsList(list)
    } catch (err) {
      setAdminAssignError(err instanceof Error ? err.message : ct('page.t139'))
    } finally {
      setLoadingMinistryAdmins(false)
    }
  }

  const handleAssignAdmin = async (ministryId: number) => {
    const selectedUser = selectedUserForMinistry[ministryId]
    if (!selectedUser?.id) {
      setAdminAssignError(ct('page.t140'))
      return
    }

    setAssigningMinistryId(ministryId)
    setAdminAssignError(null)
    try {
      await profileRepository.assignMinistryAdmin(ministryId, selectedUser.id)
      const updatedList = await profileRepository.listMinistryAdmins()
      setMinistryAdminsList(updatedList)
      setSelectedUserForMinistry((prev) => ({ ...prev, [ministryId]: null }))
    } catch (err) {
      setAdminAssignError(err instanceof Error ? err.message : ct('page.t141'))
    } finally {
      setAssigningMinistryId(null)
    }
  }

  const handleRevokeAdmin = async (ministryId: number) => {
    setAssigningMinistryId(ministryId)
    setAdminAssignError(null)
    try {
      await profileRepository.revokeMinistryAdmin(ministryId)
      const updatedList = await profileRepository.listMinistryAdmins()
      setMinistryAdminsList(updatedList)
    } catch (err) {
      setAdminAssignError(err instanceof Error ? err.message : ct('page.t142'))
    } finally {
      setAssigningMinistryId(null)
    }
  }

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(id)
  }, [query])

  useLayoutEffect(() => {
    if (skipPageResetOnLayout.current) {
      skipPageResetOnLayout.current = false
      return
    }
    setPage(0)
    setCursorHistory([''])
  }, [debouncedQuery])

  useEffect(() => {
    setPage(0)
    setCursorHistory([''])
  }, [pageSize])

  const currentCursor = cursorHistory[page]

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    if (useContactsApi) {
      const requestId = ++contactsRequestRef.current
      contactsAbortRef.current?.abort()
      const controller = new AbortController()
      contactsAbortRef.current = controller
      try {
        const result = await fetchDirectoryContacts(sessionStore, { q: debouncedQuery, unitId: filterSubName, position: filterJobName, limit: Math.min(pageSize, 100), offset: page * Math.min(pageSize, 100), signal: controller.signal })
        if (requestId !== contactsRequestRef.current) return
        result.items.forEach((item) => knownContactsRef.current.set(item.id, item))
        setContacts(result.items)
        setDirectoryContacts(Array.from(knownContactsRef.current.values()))
        setSelected((current) => current ? result.items.find((contact) => contact.id === current.id) ?? current : null)
        setListMeta({
          source: 'api/v1/contacts',
          generated_at: new Date().toISOString(),
          count: result.items.length,
          total: result.total,
          page,
          page_size: pageSize,
          pages: Math.ceil(result.total / pageSize),
          limit: pageSize,
          offset: page * pageSize,
        })
      } catch (e) {
        if (requestId !== contactsRequestRef.current || controller.signal.aborted) return
        if (e instanceof ContactsApiUnavailableError) {
          setContactsApiUnavailable(true)
          return
        }
        setError(e instanceof Error ? e.message : ct('page.t001'))
        setContacts([])
        setListMeta(null)
      } finally {
        if (requestId === contactsRequestRef.current) setLoading(false)
      }
      return
    }
    if (isOrganizationDirectory) {
      setFiltersLoading(true)
      try {
        const me = await profileRepository.getMe().catch(() => null)
        if (me) setCurrentUser(me)
        const { contacts: directory, organizations } = await loadOrganizationDirectory(sessionStore, currentUser?.role ?? me?.role ?? userRole)
        setDirectoryContacts(directory)
        const search = debouncedQuery.trim().toLowerCase()
        const selectedUnit = parseOrganizationUnitFilter(filterSubName)
        const filtered = directory.filter((contact) => {
          const matchesSearch =
            !search ||
            [contact.full_name, contact.email, contact.position, contact.job_name, contact.department_unit, contact.organization]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(search)
          const matchesDepartment =
            !selectedUnit ||
            (contact.organization === selectedUnit.organization &&
              (contact.department_unit === selectedUnit.path || contact.department_unit?.startsWith(`${selectedUnit.path} / `) === true))
          const matchesOrganization = !filterNameGo || contact.organization === filterNameGo
          return matchesSearch && matchesDepartment && matchesOrganization
        })
        const start = page * pageSize
        const pageContacts = filtered.slice(start, start + pageSize)
        setContacts(pageContacts)
        setSelected((current) => {
          const actual = current ? filtered.find((contact) => contact.id === current.id) : undefined
          return actual ?? null
        })
        setListMeta({
          source: 'api/v1/organizations/current/users',
          generated_at: new Date().toISOString(),
          count: Math.min(pageSize, Math.max(0, filtered.length - start)),
          total: filtered.length,
          page,
          page_size: pageSize,
          pages: Math.ceil(filtered.length / pageSize),
          limit: pageSize,
          offset: start,
        })
        setFilterOptions({
          job_name: [],
          sub_name: [...new Set(directory.map((contact) => contact.department_unit).filter((value): value is string => Boolean(value)))].sort((a, b) =>
            a.localeCompare(b, 'ru'),
          ),
          name_go: organizations,
          person_status: [],
        })
        setOrganizationUnitOptions(buildOrganizationUnitFilterOptions(directory))
      } catch (e) {
        setError(e instanceof Error ? e.message : ct('page.t143'))
        setContacts([])
        setListMeta(null)
        setOrganizationUnitOptions([])
      } finally {
        setFiltersLoading(false)
        setLoading(false)
      }
      return
    }
    void profileRepository
      .getMe()
      .then((me) => setCurrentUser(me))
      .catch(() => {})
    try {
      const dir = await profileRepository.listHrUsers({
        limit: pageSize,
        offset: page * pageSize,
        cursor: currentCursor,
        q: debouncedQuery,
        job_name: filterJobName || undefined,
        sub_name: filterSubName || undefined,
        name_go: filterNameGo || undefined,
      })
      setContacts(dir.contacts)
      setDirectoryContacts(dir.contacts)
      setListMeta(dir.meta)
      if (dir.meta.next_cursor) {
        setCursorHistory((prev) => {
          if (prev[page + 1] === dir.meta.next_cursor) return prev
          const next = [...prev]
          next[page + 1] = dir.meta.next_cursor!
          return next
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ct('page.t144'))
      setContacts([])
      setListMeta(null)
    } finally {
      setLoading(false)
    }
  }, [
    useContactsApi,
    isOrganizationDirectory,
    sessionStore,
    userRole,
    profileRepository,
    currentUser?.role,
    page,
    pageSize,
    debouncedQuery,
    filterJobName,
    filterSubName,
    filterNameGo,
    currentCursor,
  ])

  useEffect(() => {
    if (!workspaceBootstrapReady || !canAccessAlemContact(userEmail)) return
    if (isOrganizationDirectory) return
    let cancelled = false
    const run = async () => {
      setFiltersLoading(true)
      try {
        const [job_name, sub_name, name_go] = await Promise.all([
          profileRepository.listHrFilterValues('job_name'),
          profileRepository.listHrFilterValues('sub_name'),
          profileRepository.listHrFilterValues('name_go'),
        ])
        if (!cancelled) {
          setFilterOptions({ job_name, sub_name, name_go, person_status: [] })
        }
      } catch {
        if (!cancelled) {
          setFilterOptions({
            job_name: [],
            sub_name: [],
            name_go: [],
            person_status: [],
          })
        }
      } finally {
        if (!cancelled) setFiltersLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [workspaceBootstrapReady, userEmail, profileRepository, isOrganizationDirectory])

  useEffect(() => {
    if (!workspaceBootstrapReady || !canAccessAlemContact(userEmail)) return
    if (isOrganizationDirectory) {
      setCanViewRatings(false)
      return
    }

    let cancelled = false
    const run = async () => {
      if (userRole === 'admin') {
        if (!cancelled) setCanViewRatings(true)
        return
      }

      try {
        const me = await profileRepository.getMe()
        if (cancelled) return

        if (typeof me.ministryId !== 'number' || !Number.isFinite(me.ministryId) || me.ministryId <= 0) {
          setCanViewRatings(false)
          return
        }

        const allowed = await profileRepository.checkMinistryAnalyticsAccess(me.ministryId)
        if (!cancelled) {
          setCanViewRatings(allowed)
        }
      } catch {
        if (!cancelled) {
          setCanViewRatings(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [workspaceBootstrapReady, userEmail, userRole, profileRepository, isOrganizationDirectory])

  useEffect(() => {
    if (!canViewRatings && viewMode === 'ratings') {
      setViewMode('directory')
    }
  }, [canViewRatings, viewMode])

  const clearHrFilters = useCallback(() => {
    setFilterJobName('')
    setFilterSubName('')
    if (!isMinistryAdmin) {
      setFilterNameGo('')
    }
    setPage(0)
    setCursorHistory([''])
  }, [isMinistryAdmin])

  const hasActiveHrFilters = Boolean(filterJobName) || Boolean(filterSubName) || Boolean(filterNameGo)
  const visibleOrganizationUnitOptions = useMemo(() => {
    if (!filterNameGo || useContactsApi) return organizationUnitOptions
    const prefix = `${filterNameGo}${ORGANIZATION_UNIT_FILTER_SEPARATOR}`
    return organizationUnitOptions.filter((option) => typeof option === 'string' || option.value.startsWith(prefix))
  }, [filterNameGo, organizationUnitOptions, useContactsApi])

  useEffect(() => {
    if (!workspaceBootstrapReady || !canAccessAlemContact(userEmail)) return
    void load()
  }, [load, workspaceBootstrapReady, userEmail])

  useEffect(() => {
    if (!useContactsApi || !workspaceBootstrapReady || !canAccessAlemContact(userEmail)) return
    let cancelled = false
    setFiltersLoading(true)
    void profileRepository.getMe().then((me) => { if (!cancelled) setCurrentUser(me) }).catch(() => {})
    fetchDirectoryFilters(sessionStore)
      .then(({ unitOptions, positions }) => {
        if (cancelled) return
        setOrganizationUnitOptions(unitOptions)
        setFilterOptions((current) => ({ ...current, job_name: positions, name_go: [] }))
      })
      .catch(() => {
        if (cancelled) return
        setOrganizationUnitOptions([])
      })
      .finally(() => { if (!cancelled) setFiltersLoading(false) })
    return () => { cancelled = true }
  }, [useContactsApi, workspaceBootstrapReady, userEmail, sessionStore, profileRepository])

  useEffect(() => {
    if (!selected) return
    const actual = contacts.find((contact) => contact.id === selected.id)
    if (!actual) return
    if (actual !== selected) setSelected(actual)
  }, [contacts, selected])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const partialPageHint = useMemo(() => {
    if (loading || !listMeta?.total) return false
    const n = contacts.length
    const requested = listMeta.page_size ?? listMeta.limit ?? pageSize
    const off = listMeta.offset ?? page * pageSize
    const seenAll = off + n >= listMeta.total
    return n > 0 && n < requested && !seenAll
  }, [loading, listMeta, page, pageSize, contacts.length])

  const { canPrevPage, canNextPage } = useMemo(() => {
    if (loading || !listMeta) return { canPrevPage: false, canNextPage: false }
    const total = listMeta.total ?? 0
    if (total === 0) return { canPrevPage: false, canNextPage: false }
    const canPrev = page > 0
    let canNext = false
    if (listMeta.next_cursor) {
      canNext = true
    } else if (listMeta.pages != null && listMeta.pages > 0) {
      canNext = page + 1 < listMeta.pages
    } else {
      canNext = (listMeta.offset ?? 0) + contacts.length < total
    }
    return { canPrevPage: canPrev, canNextPage: canNext }
  }, [loading, listMeta, page, contacts.length])

  const displayFullName = useCallback((c: AlemContact) => {
    const fromParts = [c.last_name, c.first_name, c.middle_name].filter(Boolean).join(' ').trim()
    return fromParts || c.full_name?.trim() || c.username
  }, [])

  const initialsFor = useCallback(
    (c: AlemContact) =>
      (displayFullName(c) || '?')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase())
        .join('') || '?',
    [displayFullName],
  )

  const startCallForContact = useCallback(
    async (contact: AlemContact) => {
      setContactActionError(null)
      try {
        await startDirectCall({
          calleeId: contact.id,
          displayName: displayFullName(contact),
        })
      } catch (callError) {
        setContactActionError(callError instanceof Error ? callError.message : ct('page.t145'))
      }
    },
    [displayFullName, startDirectCall],
  )

  const selectContact = useCallback((contact: AlemContact) => {
    setContactActionError(null)
    setSelected(contact)
  }, [])

  const structureHref = isSuperAdmin ? '/platform/structure' : '/organization'
  const contactProfileApi = useMemo(() => useContactsApi && selected ? {
    sessionStore,
    isOwn: currentUser?.id != null && String(currentUser.id) === String(selected.id),
    onSelectContact: (person: AlemContact) => {
      knownContactsRef.current.set(person.id, { ...(knownContactsRef.current.get(person.id) ?? {}), ...person })
      setContactActionError(null)
      setSelected(knownContactsRef.current.get(person.id) ?? person)
    },
    onCreateMeeting: (meeting: { title: string; attendeeIds: number[] }) => {
      navigate('/calendar', { state: { createEvent: meeting } })
    },
    canOffboard: canManageAccess || currentUser?.role === 'admin',
    onOffboarded: () => { void load() },
    onAvatarChanged: (person: AlemContact) => {
      setContacts((current) => current.map((item) => item.id === person.id ? { ...item, avatar_url: person.avatar_url } : item))
      setSelected((current) => current && current.id === person.id ? { ...current, avatar_url: person.avatar_url } : current)
    },
  } : undefined, [canManageAccess, currentUser?.id, currentUser?.role, load, navigate, selected, sessionStore, useContactsApi])
  const selectedManager = useMemo(() => {
    if (!selected?.manager_id || selected.manager_id === selected.id) return undefined
    return directoryContacts.find((contact) => contact.id === selected.manager_id)
  }, [directoryContacts, selected])
  const totalContacts = listMeta?.total ?? contacts.length
  const pageCount = Math.max(1, listMeta?.pages ?? Math.ceil(totalContacts / pageSize))
  const canModifyContact = useCallback(
    (contact: AlemContact) =>
      isSuperAdmin ||
      (!isOrganizationDirectory &&
        isMinistryAdmin &&
        (contact.ministry_id === myMinistryId ||
          Boolean(contact.organization && filterNameGo && contact.organization.toLowerCase().includes(filterNameGo.toLowerCase())))),
    [filterNameGo, isMinistryAdmin, isOrganizationDirectory, isSuperAdmin, myMinistryId],
  )
  const canDeleteContact = (contact: AlemContact) => contact.id !== currentUserId && contact.role !== 'admin' && Boolean(contact.organization_id) && (
    isSuperAdmin || (isCompanyDirector && contact.organization_id === organizationAccess?.organizationId)
  )
  const openDeleteUser = (contact: AlemContact) => { setDeleteError(''); setDeletingUser(contact) }
  const resultStart = totalContacts > 0 ? (listMeta?.offset ?? page * pageSize) + 1 : 0
  const resultEnd = totalContacts > 0 ? Math.min(resultStart + contacts.length - 1, totalContacts) : 0
  const compactDirectoryColumns = Boolean(selected) && viewMode === 'directory'

  const employeeColumns: DataTableColumn<AlemContact>[] = compactDirectoryColumns ? [
    { key: 'name', label: ct('page.t107'), track: 'minmax(0,1.3fr)', render: (row) => <EmployeeNameCell name={displayFullName(row)} initials={initialsFor(row)} avatarUrl={row.avatar_url} subtitle={compactText(row.position ?? row.job_name, ct('page.t057'))} /> },
    { key: 'unit', label: ct('page.t114'), track: 'minmax(0,1fr)', skeleton: 'w-28', render: (row) => <EmployeeUnitCell row={row} /> },
  ] : [
    { key: 'name', label: ct('page.t107'), track: 'minmax(0,1.5fr)', render: (row) => <EmployeeNameCell name={displayFullName(row)} initials={initialsFor(row)} avatarUrl={row.avatar_url} subtitle={<span className="@min-[900px]:hidden">{row.email}</span>} /> },
    { key: 'email', label: 'Email', track: 'minmax(0,1.2fr)', wide: true, skeleton: 'w-36', render: (row) => <a href={`mailto:${row.email}`} onClick={(event) => event.stopPropagation()} title={row.email} className="block truncate text-[13px] text-[#586174] hover:text-[#2458D3] hover:underline">{row.email}</a> },
    { key: 'unit', label: ct('page.t114'), track: 'minmax(0,1fr)', skeleton: 'w-28', render: (row) => <EmployeeUnitCell row={row} /> },
    { key: 'position', label: ct('page.t118'), track: 'minmax(0,1fr)', wide: true, skeleton: 'w-24', render: (row) => <span className="block truncate" title={row.position ?? row.job_name ?? undefined}>{compactText(row.position ?? row.job_name, '—')}</span> },
    { key: 'status', label: ct('page.status'), track: '110px', skeleton: 'w-16', render: (row) => <span className={`inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium ${row.is_active ? 'bg-[#EDF8F1] text-[#16734B]' : 'bg-[#F1F2F4] text-[#586174]'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{row.is_active ? ct('page.t008') : ct('page.t009')}</span> },
  ]
  const employeePager = !loading && contacts.length > 0 ? <DataTablePager
    label={pageCount > 1 ? ct('page.shownRange', { from: resultStart, to: resultEnd, total: totalContacts }) : ct('page.shownCount', { count: contacts.length, total: totalContacts })}
    page={page + 1}
    canPrev={canPrevPage}
    canNext={canNextPage}
    onPrev={() => setPage((value) => Math.max(0, value - 1))}
    onNext={() => setPage((value) => value + 1)}
    prevLabel={ct('page.t163')}
    nextLabel={ct('page.t164')}
    extra={<span className="mr-2 flex items-center gap-2 whitespace-nowrap">
      {ct('page.t165')}
      <AppSelect
        portal
        value={String(pageSize)}
        options={[10, 20, 50].map((size) => ({ value: String(size), label: String(size) }))}
        onChange={(value) => setPageSize(Number(value))}
        ariaLabel={ct('page.t165')}
        showButtonAvatar={false}
        showOptionAvatar={false}
        className="w-[72px]"
        buttonClassName="!h-8 !rounded-[8px] !border-[#E2E5EA] !bg-white !px-2.5 !text-[13px] !font-medium !text-[#17202E]"
      />
    </span>}
  /> : undefined

  if (!workspaceBootstrapReady) {
    return <div className="flex min-h-[min(360px,70vh)] flex-col items-center justify-center px-4 py-12 text-[14px] text-[#586174]">{ct('page.t041')}</div>
  }

  if (!canAccessAlemContact(userEmail)) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-full bg-[#F6F7F9] [font-family:Inter,sans-serif]">
      <div className={`grid w-full items-start gap-5 px-4 py-6 md:px-6 xl:px-8 ${viewMode === 'directory' && selected ? 'xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
        <div className="flex min-w-0 flex-col gap-5">
        <PeopleSectionHeader
          active="employees"
          description={!loading && viewMode === 'directory' ? ct('page.employeesCount', { count: totalContacts }) : undefined}
          structureHref={structureHref}
          accessHref={canManageAccess ? '/organization/access' : undefined}
          importHref={canManageAccess ? '/organization/import' : undefined}
          actions={
            <>
              {canViewRatings ? (
                <button
                  type="button"
                  onClick={() => setViewMode((current) => (current === 'ratings' ? 'directory' : 'ratings'))}
                  aria-pressed={viewMode === 'ratings'}
                  className={`${viewMode === 'ratings' ? AXIS_UI.secondaryButtonActive : AXIS_UI.secondaryButton}`}
                >
                  <MaterialSymbol name="analytics" size={18} color="currentColor" />
                  {ct('page.t146')}
                </button>
              ) : null}
              {isSuperAdmin && !isOrganizationDirectory ? (
                <button type="button" onClick={openMinistryAdminsModal} className={`${AXIS_UI.secondaryButton}`}>
                  <MaterialSymbol name="security" size={18} color="currentColor" />
                  {ct('page.t147')}
                </button>
              ) : null}
              {canManageUsers ? (
                <button type="button" onClick={openAddUserModal} className={AXIS_UI.primaryButton}>
                  <MaterialSymbol name="person_add" size={18} color="currentColor" />
                  {ct('page.t148')}
                </button>
              ) : null}
            </>
          }
        />

        {viewMode === 'ratings' ? (
          <AlemContactRatingsSection profileRepository={profileRepository} userRole={userRole} />
        ) : (
          <>
            {error || (!selected && contactActionError) ? <div role="alert" className="rounded-[8px] border border-[#C03437]/20 bg-[#FFF0F0] px-4 py-3 text-[14px] text-[#C03437]">{error || contactActionError}</div> : null}
            {partialPageHint ? (
              <div className="rounded-[8px] border border-[#946000]/20 bg-[#FFF6E5] px-4 py-2.5 text-[14px] text-[#946000]">
                {ct('page.partialPage', { count: contacts.length, size: listMeta?.page_size ?? listMeta?.limit ?? pageSize })}
                {listMeta?.total != null ? ` ${ct('page.totalN', { total: listMeta.total })}` : ''}.
              </div>
            ) : null}

            <div className="flex min-w-0 flex-col gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`${AXIS_UI.inputShell} w-full sm:w-auto sm:min-w-[220px] sm:max-w-[360px] sm:flex-1`}>
                      <span className="sr-only">{ct('page.t149')}</span>
                      <MaterialSymbol name="search" size={16} color="#586174" />
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={ct('page.t150')}
                        className={AXIS_UI.input}
                      />
                    </label>

                    <div className="contents">
                      {!isOrganizationDirectory || useContactsApi ? (
                        <CustomSelect
                          variant="compact"
                          label={ct('page.t118')}
                          value={filterJobName}
                          emptyLabel={ct('page.t151')}
                          options={filterOptions.job_name}
                          disabled={filtersLoading}
                          onChange={(value) => {
                            setFilterJobName(value)
                            setPage(0)
                            setCursorHistory([''])
                          }}
                        />
                      ) : null}
                      <CustomSelect
                        variant="compact"
                        label={ct('page.t114')}
                        value={filterSubName}
                        emptyLabel={ct('page.t152')}
                        options={isOrganizationDirectory ? visibleOrganizationUnitOptions : filterOptions.sub_name}
                        tree={isOrganizationDirectory}
                        disabled={filtersLoading}
                        onChange={(value) => {
                          setFilterSubName(value)
                          // Подразделение принадлежит одной организации — подставляем её в соседний селектор
                          const parsed = isOrganizationDirectory && !useContactsApi && value ? parseOrganizationUnitFilter(value) : null
                          if (parsed && !isMinistryAdmin && parsed.organization !== filterNameGo) setFilterNameGo(parsed.organization)
                          setPage(0)
                          setCursorHistory([''])
                        }}
                      />
                      {useContactsApi ? null : <CustomSelect
                        variant="compact"
                        label={ct('page.t113')}
                        value={filterNameGo}
                        emptyLabel={ct('page.t153')}
                        options={filterOptions.name_go}
                        disabled={filtersLoading || isMinistryAdmin}
                        onChange={(value) => {
                          if (isMinistryAdmin) return
                          setFilterNameGo(value)
                          if (isOrganizationDirectory) setFilterSubName('')
                          setPage(0)
                          setCursorHistory([''])
                        }}
                      />}
                      {hasActiveHrFilters && !isMinistryAdmin ? (
                        <button
                          type="button"
                          onClick={clearHrFilters}
                          disabled={filtersLoading}
                          className="h-9 rounded-[8px] px-2 text-[14px] font-medium text-[#1967D2] transition-colors hover:bg-[#E8F0FE] disabled:opacity-50"
                        >
                          {ct('page.t154')}
                        </button>
                      ) : null}

                      <div className="ml-auto">
                      <ViewToggle
                        value={layoutMode}
                        options={[
                          { value: 'list', icon: 'view_list', label: ct('page.t155') },
                          { value: 'grid', icon: 'grid_view', label: ct('page.t156') },
                        ]}
                        onChange={setLayoutMode}
                      />
                      </div>
                    </div>
                  </div>
                </div>

              {layoutMode === 'list' || loading || contacts.length === 0 ? (
                <DataTable
                  ariaLabel={ct('page.t107')}
                  rows={contacts}
                  rowKey={(row) => row.id}
                  loading={loading}
                  columns={employeeColumns}
                  selectedKey={selected?.id ?? null}
                  onRowClick={selectContact}
                  empty={<DataTableEmpty icon={<MaterialSymbol name="search" size={22} color="currentColor" />} title={ct('page.t158')} text={ct('page.t159')} />}
                  actionsLabel={adminText('text126')}
                  actionsTrack="72px"
                  actions={(row) => {
                    const editable = canModifyContact(row)
                    return <EmployeeRowMenu onOpen={() => selectContact(row)} onEdit={editable ? () => openEditUserModal(row) : undefined} onDelete={canDeleteContact(row) ? () => openDeleteUser(row) : undefined} />
                  }}
                  footer={employeePager}
                />
              ) : (
                <section className="overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-4 p-4">
                    {contacts.map((row) => {
                      const isSelected = selected?.id === row.id
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => selectContact(row)}
                          aria-pressed={isSelected}
                          className={`rounded-2xl border p-4 text-left transition-[border-color,box-shadow] duration-[120ms] ${AXIS_UI.focus} ${isSelected ? 'border-[#1967D2] bg-[#E8F0FE]' : 'border-[#E6EAF1] bg-white hover:border-[#C4C9D2] hover:shadow-[0_4px_16px_rgba(23,32,46,0.06)]'}`}
                        >
                          <div className="flex items-start gap-3">
                            <ContactListAvatar avatarUrl={row.avatar_url} initials={initialsFor(row)} active={row.is_active} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[14px] font-semibold leading-5 text-[#17202E]">{displayFullName(row)}</div>
                              <div className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-[#586174]">
                                {compactText(row.position ?? row.job_name, ct('page.t057'))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 space-y-2 border-t border-[#E2E5EA] pt-3">
                            <div className="flex items-center gap-2 text-[12px] leading-4 text-[#586174]">
                              <MaterialSymbol name="account_tree" size={14} color="currentColor" />
                              <span className="truncate">{compactText(row.department_unit, ct('page.t162'))}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[12px] leading-4 text-[#586174]">
                              <MaterialSymbol name="mail" size={14} color="currentColor" />
                              <span className="truncate">{row.email}</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {employeePager}
                </section>
              )}

            </div>

            {selected ? (
              <div
                className="fixed inset-0 z-[600] flex items-end justify-center bg-[#17202E]/40 p-0 xl:hidden"
                role="presentation"
                onClick={() => setSelected(null)}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="alem-contact-card-title"
                  className="max-h-[94vh] w-full max-w-xl overflow-hidden rounded-t-[12px] bg-white [font-family:Inter,sans-serif]"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div id="alem-contact-card-title" className="sr-only">
                    {ct('page.t166')}
                  </div>
                  <EmployeeProfilePanel
                    key={`mobile-profile-${selected.id}`}
                    contact={selected}
                    initials={initialsFor(selected)}
                    manager={selectedManager}
                    managerInitials={selectedManager ? initialsFor(selectedManager) : undefined}
                    structureHref={structureHref}
                    onClose={() => setSelected(null)}

                    onStartCall={() => void startCallForContact(selected)}
                    onSelectManager={selectedManager ? () => selectContact(selectedManager) : undefined}
                    onEdit={canModifyContact(selected) ? () => openEditUserModal(selected) : undefined}
                    onDelete={canDeleteContact(selected) ? () => openDeleteUser(selected) : undefined}
                    isCallBusy={isCallBusy}
                    callBusyLabel={callBusyLabel}
                    actionError={contactActionError}
                    profileApi={contactProfileApi}
                  />
                </div>
              </div>
            ) : null}
          </>
        )}

        </div>

        {viewMode === 'directory' && selected ? (
          <aside className="hidden self-stretch xl:block">
            <div className="sticky top-6 h-[calc(100vh-120px)] max-h-[860px]">
              <EmployeeProfilePanel
                key={`desktop-profile-${selected.id}`}
                contact={selected}
                initials={initialsFor(selected)}
                manager={selectedManager}
                managerInitials={selectedManager ? initialsFor(selectedManager) : undefined}
                structureHref={structureHref}
                onClose={() => setSelected(null)}

                onStartCall={() => void startCallForContact(selected)}
                onSelectManager={selectedManager ? () => selectContact(selectedManager) : undefined}
                onEdit={canModifyContact(selected) ? () => openEditUserModal(selected) : undefined}
                onDelete={canDeleteContact(selected) ? () => openDeleteUser(selected) : undefined}
                isCallBusy={isCallBusy}
                callBusyLabel={callBusyLabel}
                actionError={contactActionError}
                profileApi={contactProfileApi}
              />
            </div>
          </aside>
        ) : null}

        {/* Modal: Create / Edit User */}
        {isUserModalOpen ? (
          <AppModal
            title={editingUser ? ct('page.t108') : ct('page.t148')}
            onClose={() => { if (!isSubmittingUser) closeUserModal() }}
            maxWidth={560}
            animated
            footer={<>
              <button type="button" disabled={isSubmittingUser} onClick={closeUserModal} className="ts-button ts-button--secondary">{ct('page.t052')}</button>
              <button type="submit" form="people-user-form" disabled={isSubmittingUser || !userFormReady || positionInvalid} className="ts-button ts-button--primary">{isSubmittingUser ? ct('page.t091') : ct('page.t092')}</button>
            </>}
          >
              <form id="people-user-form" onSubmit={handleSaveUser} className="space-y-4">
                {userFormError ? <div className="rounded-[6px] border border-[#C03437]/20 bg-[#FFF0F0] p-3 text-[14px] text-[#C03437]">{userFormError}</div> : null}
                {isLoadingUser && <p role="status" className="text-sm text-[#586174]">{ct('page.t167')}</p>}
                {editingUser && !isLoadingUser && !userFormReady && <button type="button" className={AXIS_UI.secondaryButton} onClick={() => openEditUserModal(editingUser)}>{ct('page.t168')}</button>}
                {editingUser && userFormReady && (!editingUser.first_name || !editingUser.last_name) && <p className="text-sm text-[#586174]">{ct('page.t169')}</p>}
                <fieldset disabled={!userFormReady || isSubmittingUser} className="min-w-0 space-y-4">

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.firstName')} {!editingUser || editingUser.first_name ? '*' : ''}</label>
                    <input
                      type="text"
                      required={!editingUser || Boolean(editingUser.first_name)}
                      autoComplete="off"
                      value={formFirstName}
                      onChange={(e) => setFormFirstName(e.target.value)}
                      onInput={(e) => setFormFirstName(e.currentTarget.value)}
                      onBlur={(e) => setFormFirstName(e.currentTarget.value)}
                      className="ts-input mt-1.5"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.lastName')} {!editingUser || editingUser.last_name ? '*' : ''}</label>
                    <input
                      type="text"
                      required={!editingUser || Boolean(editingUser.last_name)}
                      autoComplete="off"
                      value={formLastName}
                      onChange={(e) => setFormLastName(e.target.value)}
                      onInput={(e) => setFormLastName(e.currentTarget.value)}
                      onBlur={(e) => setFormLastName(e.currentTarget.value)}
                      className="ts-input mt-1.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.login')} {!editingUser ? '*' : ''}</label>
                    {!editingUser && !usernameEdited ? (
                      <>
                        <output className="mt-1.5 flex min-h-10 w-full items-center break-all rounded-[var(--ts-radius-control)] border border-[var(--ts-border)] bg-[var(--ts-bg)] px-3 py-2 text-[14px] text-[#17202E]">
                          {effectiveFormUsername || ct('page.t170')}
                        </output>
                        <button type="button" className="mt-1 text-[13px] text-[#2458D3] hover:underline" onClick={() => { setFormUsername(effectiveFormUsername); setUsernameEdited(true) }}>
                          {ct('page.t171')}
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          type="text"
                          autoComplete="off"
                          required={!editingUser}
                          disabled={Boolean(editingUser)}
                          value={effectiveFormUsername}
                          onChange={(e) => setFormUsername(e.target.value)}
                          className="ts-input mt-1.5"
                        />
                        {!editingUser ? (
                          <button type="button" className="mt-1 text-[13px] text-[#2458D3] hover:underline" onClick={() => { setUsernameEdited(false); setFormUsername('') }}>
                            {ct('page.t172')}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">Email *</label>
                    {isOrganizationDirectory && !editingUser && !emailEdited ? (
                      <>
                        <output className="mt-1.5 flex min-h-10 w-full items-center break-all rounded-[var(--ts-radius-control)] border border-[var(--ts-border)] bg-[var(--ts-bg)] px-3 py-2 text-[14px] text-[#17202E]">
                          {effectiveFormEmail || ct('page.t173')}
                        </output>
                        <button type="button" className="mt-1 text-[13px] text-[#2458D3] hover:underline" onClick={() => { setFormEmail(effectiveFormEmail); setEmailEdited(true) }}>
                          {ct('page.t174')}
                        </button>
                      </>
                    ) : (
                      <>
                        <input
                          type="email"
                          autoComplete="off"
                          required
                          value={effectiveFormEmail}
                          onChange={(e) => setFormEmail(e.target.value)}
                          className="ts-input mt-1.5"
                        />
                        {isOrganizationDirectory && !editingUser ? (
                          <button type="button" className="mt-1 text-[13px] text-[#2458D3] hover:underline" onClick={() => { setEmailEdited(false); setFormEmail('') }}>
                            {ct('page.t175')}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {isOrganizationDirectory && !editingUser && selectedMailDomain ? (
                  <p className="text-[13px] text-[#586174]">{ct('page.mailDomainHint', { domain: selectedMailDomain })}</p>
                ) : null}

                <div>
                  <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.password')} {!editingUser ? '*' : ct('page.t176')}</label>
                  <div className="relative mt-1.5">
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      required={!editingUser}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="ts-input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#586174] transition hover:text-[#17202E]"
                      title={showFormPassword ? ct('page.t177') : ct('page.t178')}
                    >
                      <MaterialSymbol name={showFormPassword ? 'visibility_off' : 'visibility'} size={18} color="currentColor" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="employee-position" className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.t118')}</label>
                    {editingUser ? <input
                      id="employee-position"
                      type="text"
                      value={formPosition}
                      onChange={(e) => setFormPosition(e.target.value)}
                      className="ts-input mt-1.5"
                    /> : <>
                      <select id="employee-position" value={creatingPosition ? '__new__' : selectedPosition?.id ?? ''}
                        disabled={!positionsReady} className="ts-input mt-1.5"
                        onChange={event => {
                          setCreatingPosition(event.target.value === '__new__')
                          setFormPosition(positions.find(position => position.id === event.target.value)?.name ?? '')
                        }}>
                        <option value="">{ct(!formOrganizationId ? 'positionChoice.company' : positionsError ? 'positionChoice.error' : !positionsReady ? 'positionChoice.loading' : 'positionChoice.none')}</option>
                        {positions.map(position => <option key={position.id} value={position.id}>{position.name}</option>)}
                        <option value="__new__">{ct('positionChoice.create')}</option>
                      </select>
                      {creatingPosition && <input aria-label={ct('positionChoice.newName')} placeholder={ct('positionChoice.newName')}
                        type="text" value={formPosition} required maxLength={255} className="ts-input mt-1.5" onChange={event => setFormPosition(event.target.value)} />}
                      {creatingPosition && selectedPosition && <p role="alert" className="mt-1 text-xs text-[#C03437]">{ct('positionChoice.duplicate')}</p>}
                      {positionsError && <button type="button" className="mt-1 text-[13px] text-[#2458D3] hover:underline" onClick={() => setPositionRetry(value => value + 1)}>{ct('page.t168')}</button>}
                    </>}
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.iin')} {!editingUser ? '*' : ''}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{12}"
                      maxLength={12}
                      minLength={12}
                      required={!editingUser}
                      value={formIin}
                      onChange={(e) => setFormIin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      className="ts-input mt-1.5"
                    />
                  </div>
                </div>

                {isOrganizationDirectory ? (
                  <>
                    <div>
                      <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.t113')} {!editingUser ? '*' : ''}</label>
                      {editingUser || !isSuperAdmin ? (
                        <input
                          readOnly
                          value={editingUser?.organization || userOrganizations.find(organization => organization.id === formOrganizationId)?.name || (formOrganizationId ? ct('page.t179') : ct('page.t180'))}
                          className="ts-input mt-1.5 !bg-[var(--ts-bg)] !text-[var(--ts-text-muted)]"
                        />
                      ) : <select
                        required
                        value={formOrganizationId}
                        disabled={loadingUserOrganizations || Boolean(editingUser)}
                        onChange={(e) => {
                          const organizationId = e.target.value
                          setFormOrganizationId(organizationId)
                          setFormPosition('')
                          setCreatingPosition(false)
                          setPositionChoices(null)
                          if (!editingUser) { setEmailEdited(false); setFormEmail('') }
                          setFormTeamId('')
                          void loadUserOrganizationUnits(organizationId)
                        }}
                        className="ts-input mt-1.5"
                      >
                        <option value="">{loadingUserOrganizations ? ct('page.t181') : ct('page.t133')}</option>
                        {userOrganizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>
                            {organization.name}
                          </option>
                        ))}
                      </select>}
                    </div>
                    <div>
                      <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.t114')}<span className="font-normal text-[#586174]">{ct('page.t182')}</span>
                      </label>
                      {editingUser ? (
                        <input
                          readOnly
                          value={formTeamId ? (editingUser.department_unit || userOrganizationUnitLabels.get(formTeamId) || ct('page.t183')) : ct('page.t162')}
                          className="ts-input mt-1.5 !bg-[var(--ts-bg)] !text-[var(--ts-text-muted)]"
                        />
                      ) : <select
                        value={formTeamId}
                        disabled={!formOrganizationId || loadingUserOrganizationUnits || Boolean(editingUser)}
                        onChange={(e) => setFormTeamId(e.target.value)}
                        className="ts-input mt-1.5"
                      >
                        <option value="">{ct('page.t162')}</option>
                        {userOrganizationUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {userOrganizationUnitLabels.get(unit.id) ?? unit.name}
                          </option>
                        ))}
                      </select>}
                      {loadingUserOrganizationUnits ? <div className="mt-1 text-[12px] text-[#586174]">{ct('page.t184')}</div> : null}
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]">{ct('page.t185')}</label>
                    {isMinistryAdmin ? (
                      <input
                        type="text"
                        disabled
                        value={ministriesList.find((m) => m.id === myMinistryId)?.name || ct('page.ministryId', { id: myMinistryId })}
                        className="ts-input mt-1.5 !bg-[var(--ts-bg)] !text-[var(--ts-text-muted)]"
                      />
                    ) : (
                      <select
                        value={formMinistryId}
                        onChange={(e) => setFormMinistryId(e.target.value ? Number(e.target.value) : '')}
                        className="ts-input mt-1.5"
                      >
                        <option value="">{ct('page.t186')}</option>
                        {ministriesList.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                </fieldset>
              </form>
          </AppModal>
        ) : null}

        {/* Modal: Confirm Delete */}
        <AppConfirmDialog
          open={Boolean(deletingUser)}
          title={adminText('deleteEmployeeTitle')}
          error={deleteError}
          message={adminText('deleteEmployeeDescription', { name: deletingUser ? displayFullName(deletingUser) : '' })}
          confirmText={ct('page.t014')}
          cancelText={ct('page.t052')}
          isLoading={isSubmittingUser}
          onConfirm={handleDeleteUserConfirm}
          onCancel={() => setDeletingUser(null)}
        />

        {/* Modal: Ministry Admins Management (Super Admin) */}
        {isMinistryAdminsModalOpen ? (
          <AppModal title={ct('page.t189')} onClose={() => setIsMinistryAdminsModalOpen(false)} maxWidth={768} animated closeOnBackdrop>
              <p className="text-[14px] leading-5 text-[#586174]">{ct('page.t190')}</p>

              {adminAssignError ? <div className="mt-3 rounded-[8px] border border-[#C03437]/20 bg-[#FFF0F0] p-3 text-[14px] text-[#C03437]">{adminAssignError}</div> : null}

              <div className="mt-4 space-y-3">
                {loadingMinistryAdmins ? (
                  <div className="py-8 text-center text-[14px] text-[#586174]">{ct('page.t191')}</div>
                ) : (
                  ministryAdminsList.map((m) => (
                    <div
                      key={`m-admin-${m.id}`}
                      className="flex flex-col gap-3 rounded-[12px] border border-[#E6EAF1] bg-white p-3.5 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-[#17202E]">{m.name}</div>
                        <div className="mt-1 text-[12px] text-[#586174]">
                          {ct('page.currentAdmin')}{' '}
                          {m.admin_name ? (
                            <span className="font-medium text-[#2458D3]">
                              {m.admin_name} (ID: {m.admin_id})
                            </span>
                          ) : (
                            <span className="text-[#586174]">{ct('page.t192')}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {m.admin_id ? (
                          <button
                            type="button"
                            disabled={assigningMinistryId === m.id}
                            onClick={() => handleRevokeAdmin(m.id)}
                            className="ts-button ts-button--secondary ts-button--compact !text-[#C03437]"
                          >
                            {ct('page.t193')}
                          </button>
                        ) : null}

                        <MinistryAdminUserSearchSelect
                          selectedUser={selectedUserForMinistry[m.id] || null}
                          onSelectUser={(u) =>
                            setSelectedUserForMinistry((prev) => ({
                              ...prev,
                              [m.id]: u,
                            }))
                          }
                          profileRepository={profileRepository}
                        />

                        <button
                          type="button"
                          disabled={assigningMinistryId === m.id || !selectedUserForMinistry[m.id]}
                          onClick={() => handleAssignAdmin(m.id)}
                          className="ts-button ts-button--primary ts-button--compact"
                        >
                          {assigningMinistryId === m.id ? ct('page.t194') : ct('page.t195')}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
          </AppModal>
        ) : null}
      </div>
    </div>
  )
}
