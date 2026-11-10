import { useTranslation } from 'react-i18next'
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository'
import {
  HttpOrganizationRepository,
  type OrganizationOwnerCandidate,
  type PlatformOrganization,
} from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppModal from '../../../shared/ui/AppModal'
import { AXIS_TONE_CLASS, AXIS_UI } from '../../../shared/ui/axisTokens'
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader'
import DataTable, { DATA_TABLE_ROW_ICON, DataTableEmpty, DataTablePager, type DataTableColumn } from '../../../shared/ui/DataTable'
import { adminText } from '../../../shared/i18n/adminText'
import { PLATFORM_STRUCTURE_HREF } from './platformStructureNavigation'

type StatusFilter = '' | 'active' | 'suspended'

const makeSlug = (value: string): string => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const statusLabel = (status: string): string => status === 'suspended' ? 'Приостановлена' : 'Активна'
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
const USERS_LABEL = 'Пользователи'
const UNITS_LABEL = 'Подразделения'

type OrganizationActionsProps = {
  organization: PlatformOrganization
  updating: boolean
  onOwner: () => void
  onDelete: () => void
}

function OrganizationActions({ organization, updating, onOwner, onDelete }: OrganizationActionsProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const toggleMenu = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuWidth = 224
    const menuHeight = 100
    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12))
    const below = rect.bottom + 8
    const top = below + menuHeight <= window.innerHeight ? below : Math.max(12, rect.top - menuHeight - 8)
    setPosition({ top, left })
    setOpen(true)
  }
  
  useEffect(() => {
  if (!open) return
  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as Node
    if (
      !menuRef.current?.contains(target) &&
      !buttonRef.current?.contains(target)
    ) {
      setOpen(false)
    }
  }
  document.addEventListener("mousedown", handleClickOutside)
  return () => {
    document.removeEventListener("mousedown", handleClickOutside)
  }
}, [open])

  const menu = open ? createPortal(
    <div   ref={menuRef} role="menu" className="fixed z-[2000] w-56 rounded-[8px] border border-[#E2E5EA] bg-white p-1 shadow-[0_8px_24px_rgba(23,32,46,0.12)] [font-family:Inter,sans-serif]" style={{ top: position.top, left: position.left }}>
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onOwner() }} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] text-[#17202E] hover:bg-[#F6F7F9]"><MaterialSymbol name="person" size={17} color="#586174" />{organization.owner_id ? 'Сменить владельца' : 'Назначить владельца'}</button>
      <button type="button" role="menuitem" disabled={updating} onClick={() => { setOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] text-[#17202E] hover:bg-[#F6F7F9] disabled:opacity-50"><MaterialSymbol name="delete" size={17} color="#C53030" />{adminText('deleteAction')}</button>
    </div>,
    document.body,
  ) : null

  return <><button ref={buttonRef} type="button" aria-label="Действия с компанией" aria-expanded={open} onClick={toggleMenu} className={DATA_TABLE_ROW_ICON}><MaterialSymbol name="more_horiz" size={18} color="currentColor" /></button>{menu}</>
}

export default function PlatformOrganizationsPage() {
  useTranslation('administration')
  const [deleting, setDeleting] = useState<PlatformOrganization | null>(null)
  const deletionBusy = useRef(false)
  const [deleteError, setDeleteError] = useState('')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const authRepository = useMemo(() => new HttpAuthRepository(), [])
  const repository = useMemo(() => new HttpOrganizationRepository(sessionStore), [sessionStore])
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('')
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [ownerOrganization, setOwnerOrganization] = useState<PlatformOrganization | null>(null)
  const [ownerCandidates, setOwnerCandidates] = useState<OrganizationOwnerCandidate[]>([])
  const [ownerQuery, setOwnerQuery] = useState('')
  const [selectedOwnerId, setSelectedOwnerId] = useState<number | ''>('')
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false)
  const [isAssigningOwner, setIsAssigningOwner] = useState(false)

  const loadOrganizations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await repository.listPlatformOrganizations({ q: query, status, limit: 100, offset: 0 })
      setOrganizations(result.items ?? [])
      setTotal(result.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить компании')
    } finally {
      setLoading(false)
    }
  }, [query, repository, status])

  useEffect(() => {
    let cancelled = false
    void authRepository.me().then((user) => {
      if (!cancelled) setIsPlatformAdmin(user.role === 'admin')
    }).catch((err: unknown) => {
      if (!cancelled) {
        setIsPlatformAdmin(false)
        setError(err instanceof Error ? err.message : 'Не удалось определить права администратора')
      }
    })
    return () => { cancelled = true }
  }, [authRepository])

  useEffect(() => {
    if (isPlatformAdmin && searchParams.get('create') === '1') setIsCreateOpen(true)
  }, [isPlatformAdmin, searchParams])

  const clearCreateIntent = () => {
    if (!searchParams.has('create')) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    setSearchParams(nextParams, { replace: true })
  }

  useEffect(() => {
    if (isPlatformAdmin) void loadOrganizations()
  }, [isPlatformAdmin, loadOrganizations])

  const loadOwnerCandidates = useCallback(async () => {
    setIsLoadingCandidates(true)
    try {
      const candidates = await repository.listPlatformOrganizationOwnerCandidates(ownerOrganization?.id ?? '', ownerQuery)
      setOwnerCandidates(candidates)
      setSelectedOwnerId((current) => candidates.some((candidate) => candidate.id === current) ? current : candidates[0]?.id ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить пользователей')
    } finally {
      setIsLoadingCandidates(false)
    }
  }, [ownerOrganization?.id, ownerQuery, repository])

  useEffect(() => {
    if (ownerOrganization) void loadOwnerCandidates()
  }, [ownerOrganization, loadOwnerCandidates])

  const openOwnerDialog = (organization: PlatformOrganization) => {
    setError(null)
    setOwnerOrganization(organization)
    setOwnerCandidates([])
    setOwnerQuery('')
    setSelectedOwnerId('')
  }

  const closeOwnerDialog = () => {
    setOwnerOrganization(null)
    setOwnerCandidates([])
    setOwnerQuery('')
    setSelectedOwnerId('')
  }

  const assignOwner = async () => {
    if (!ownerOrganization || selectedOwnerId === '') return
    setIsAssigningOwner(true)
    setError(null)
    try {
      await repository.assignPlatformOrganizationOwner(ownerOrganization.id, selectedOwnerId)
      closeOwnerDialog()
      await loadOrganizations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось назначить владельца')
    } finally {
      setIsAssigningOwner(false)
    }
  }

  const createOrganization = async () => {
    const name = newName.trim()
    if (!name) return
    setIsCreating(true)
    setError(null)
    try {
      await repository.createPlatformOrganization({ name, slug: newSlug.trim() || makeSlug(name) })
      setNewName('')
      setNewSlug('')
      setIsCreateOpen(false)
      clearCreateIntent()
      await loadOrganizations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать компанию')
    } finally {
      setIsCreating(false)
    }
  }

  const deleteCompany = async () => {
    if (!deleting || deletionBusy.current) return
    deletionBusy.current = true
    setUpdatingId(deleting.id)
    setDeleteError('')
    try {
      await repository.deletePlatformOrganization(deleting.id)
      setDeleting(null)
      await loadOrganizations()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : adminText('deleteFailed'))
    } finally {
      deletionBusy.current = false
      setUpdatingId(null)
    }
  }

  if (isPlatformAdmin === null || loading && isPlatformAdmin === null) {
    return <main className="min-h-full min-w-0 bg-[#F6F7F9] px-4 py-6 [font-family:Inter,sans-serif] md:px-6 xl:px-8"><div className="rounded-[12px] border border-[#E2E5EA] bg-white p-10 text-center text-[14px] text-[#586174]">Проверяем права платформенного администратора…</div></main>
  }

  if (!isPlatformAdmin) {
    return <main className="min-h-full min-w-0 bg-[#F6F7F9] px-4 py-6 [font-family:Inter,sans-serif] md:px-6 xl:px-8"><div className="mx-auto max-w-[620px] rounded-[12px] border border-[#E2E5EA] bg-white p-8 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF0F0] text-[#C03437]"><MaterialSymbol name="lock" size={22} color="currentColor" /></span><h1 className="mt-4 text-[24px] font-semibold leading-8 text-[#17202E]">Доступ ограничен</h1><p className="mt-2 text-[14px] leading-5 text-[#586174]">Список компаний доступен только системным администраторам.</p></div></main>
  }

  const columns: DataTableColumn<PlatformOrganization>[] = [
    { key: 'company', label: 'Компания', track: 'minmax(0,1.5fr)', render: (organization) => <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF1FE] text-[#2446D1]"><MaterialSymbol name="business" size={16} color="currentColor" /></span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[#17202E]" title={organization.name}>{organization.name}</span>
        <span className="block truncate text-[12px] text-[#586174]">{organization.slug}<span className="@min-[900px]:hidden"><span aria-hidden className="mx-1">·</span><MaterialSymbol name="group" size={12} color="currentColor" aria-label={USERS_LABEL} /> {organization.user_count}</span></span>
      </span>
    </div> },
    { key: 'owner', label: 'Владелец', track: 'minmax(0,1.2fr)', skeleton: 'w-32', render: (organization) => organization.owner_name ? <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2458D3] text-[10px] font-semibold text-white">{initialsOf(organization.owner_name)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[#17202E]">{organization.owner_name}</span>
        {organization.owner_email ? <span className="block truncate text-[12px] text-[#586174]">{organization.owner_email}</span> : null}
      </span>
    </span> : <span className="text-[#8A93A5]">Не назначен</span> },
    { key: 'users', label: USERS_LABEL, track: '110px', wide: true, align: 'right', skeleton: 'ml-auto w-8', render: (organization) => <span className="tabular-nums text-[#17202E]">{organization.user_count}</span> },
    { key: 'units', label: UNITS_LABEL, track: '120px', wide: true, align: 'right', skeleton: 'ml-auto w-8', render: (organization) => <span className="tabular-nums text-[#17202E]">{organization.unit_count}</span> },
    { key: 'status', label: 'Статус', track: '140px', skeleton: 'w-20', render: (organization) => <span className={`inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium ${organization.status === 'suspended' ? AXIS_TONE_CLASS.error : AXIS_TONE_CLASS.success}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabel(organization.status)}</span> },
  ]
  const activeCount = organizations.filter((item) => item.status === 'active').length
  const userCount = organizations.reduce((sum, item) => sum + item.user_count, 0)

  return (
    <main className="min-h-full min-w-0 bg-[#F6F7F9] px-4 py-6 [font-family:Inter,sans-serif] md:px-6 xl:px-8">
      <PeopleSectionHeader
        active="structure"
        structureHref={PLATFORM_STRUCTURE_HREF}
        accessHref="/organization/access"
        meta="Управление компаниями"
        description="Клиентские организации Workspace. Данные компаний изолированы на уровне backend."
        actions={
          <button type="button" onClick={() => setIsCreateOpen(true)} className={AXIS_UI.primaryButton}>
            <MaterialSymbol name="add" size={18} color="currentColor" />
            Добавить компанию
          </button>
        }
      />

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-[8px] border border-[#C03437]/20 bg-[#FFF0F0] px-4 py-3 text-[14px] text-[#C03437]">
          <MaterialSymbol name="error" size={18} color="currentColor" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-5 grid overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white sm:grid-cols-3">
        {([['business', 'Всего компаний', total, '#17202E'], ['check_circle', 'Активные', activeCount, '#16734B'], ['group', 'Пользователи на странице', userCount, '#17202E']] as const).map(([icon, label, value, color], index) => (
          <div key={label} className={`flex min-w-0 items-center gap-3.5 px-5 py-4 ${index ? 'border-t border-[#E6EAF1] sm:border-l sm:border-t-0' : ''}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#EDF2FF] text-[#2458D3]"><MaterialSymbol name={icon} size={20} color="currentColor" /></span>
            <div className="min-w-0">
              <div className="truncate text-[13px] text-[#586174]">{label}</div>
              <div className="mt-0.5 text-[22px] font-semibold leading-7 tabular-nums" style={{ color }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <label className={`${AXIS_UI.inputShell} w-full sm:w-[320px]`}>
          <MaterialSymbol name="search" size={16} color="#586174" />
          <input data-ui="bare" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, slug или email владельца" aria-label="Поиск компаний" className={AXIS_UI.input} />
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Статус компании">
          {([['', 'Все'], ['active', 'Активные'], ['suspended', 'Приостановленные']] as const).map(([value, label]) => (
            <button key={value || 'all'} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${AXIS_UI.focus} ${status === value ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#586174] hover:border-[#C4C9D2] hover:text-[#17202E]'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          ariaLabel="Компании"
          rows={organizations}
          rowKey={(organization) => organization.id}
          loading={loading}
          skeletonRows={5}
          onRowClick={(organization) => navigate(`/platform/organizations/${organization.id}/structure`)}
          columns={columns}
          empty={<DataTableEmpty icon={<MaterialSymbol name="business" size={22} color="currentColor" />} title="Компании не найдены" text="Создайте первую компанию кнопкой «Добавить компанию»." />}
          actionsLabel={adminText('text126')}
          actionsTrack="72px"
          actions={(organization) => <OrganizationActions organization={organization} updating={updatingId === organization.id} onOwner={() => openOwnerDialog(organization)} onDelete={() => { setDeleteError(''); setDeleting(organization) }} />}
          footer={!loading && organizations.length > 0 ? <DataTablePager label={adminText('template1', { p0: 1, p1: organizations.length, p2: total })} page={1} canPrev={false} canNext={false}
            onPrev={() => undefined} onNext={() => undefined} prevLabel={adminText('text054')} nextLabel={adminText('text055')} /> : undefined}
        />
      </div>

      {isCreateOpen && <AppModal
        title="Добавить компанию"
        onClose={() => { setIsCreateOpen(false); clearCreateIntent() }}
        maxWidth={520}
        animated
        footer={<>
          <button type="button" onClick={() => { setIsCreateOpen(false); clearCreateIntent() }} className="ts-button ts-button--secondary">Отмена</button>
          <button type="button" onClick={() => void createOrganization()} disabled={!newName.trim() || isCreating} className="ts-button ts-button--primary">{isCreating ? 'Создание…' : 'Создать компанию'}</button>
        </>}
      >
        <p className="text-[14px] leading-5 text-[#586174]">После создания назначьте владельца из зарегистрированных пользователей. Системный администратор остаётся администратором платформы и не становится сотрудником компании.</p>
        <div className="mt-5 space-y-4">
          <label className="ts-field">Название компании<input value={newName} onChange={(event) => { setNewName(event.target.value); if (!newSlug) setNewSlug(makeSlug(event.target.value)) }} className="ts-input" placeholder="Например, Acme Technologies" autoFocus /></label>
          <label className="ts-field">Slug<input value={newSlug} onChange={(event) => setNewSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="ts-input" placeholder="acme-technologies" /></label>
        </div>
      </AppModal>}

      {ownerOrganization && <AppModal
        title={ownerOrganization.owner_id ? 'Сменить владельца' : 'Назначить владельца'}
        onClose={() => { if (!isAssigningOwner) closeOwnerDialog() }}
        maxWidth={560}
        animated
        footer={<>
          <button type="button" onClick={closeOwnerDialog} disabled={isAssigningOwner} className="ts-button ts-button--secondary">Отмена</button>
          <button type="button" onClick={() => void assignOwner()} disabled={selectedOwnerId === '' || isAssigningOwner || isLoadingCandidates} className="ts-button ts-button--primary">{isAssigningOwner ? 'Сохранение…' : 'Назначить владельца'}</button>
        </>}
      >
        <p className="text-[13px] text-[#586174]">{ownerOrganization.name}</p>
        <p className="mt-2 text-[14px] leading-5 text-[#586174]">Выберите зарегистрированного пользователя. Он будет привязан к компании и получит права владельца её структуры.</p>
        <label className={`${AXIS_UI.inputShell} mt-4`}><MaterialSymbol name="search" size={16} color="#586174" /><input data-ui="bare" value={ownerQuery} onChange={(event) => setOwnerQuery(event.target.value)} placeholder="Поиск по имени или email" className={AXIS_UI.input} autoFocus /></label>
        <div className="mt-3 max-h-64 overflow-y-auto rounded-[12px] border border-[#E6EAF1]">{isLoadingCandidates ? <div className="p-5 text-center text-[14px] text-[#586174]">Загрузка пользователей…</div> : ownerCandidates.length === 0 ? <div className="p-5 text-center text-[14px] leading-5 text-[#586174]">Нет доступных пользователей. Сначала зарегистрируйте пользователя в Workspace/Keycloak, затем обновите список.</div> : ownerCandidates.map((candidate) => <label key={candidate.id} className={'flex cursor-pointer items-center gap-3 border-b border-[#EEF0F3] px-4 py-3 last:border-b-0 ' + (selectedOwnerId === candidate.id ? 'bg-[#EDF2FF]' : 'hover:bg-[#FAFBFC]')}><input type="radio" name="organization-owner" value={candidate.id} checked={selectedOwnerId === candidate.id} onChange={() => setSelectedOwnerId(candidate.id)} className="h-4 w-4 accent-[#2458D3]" /><span className="min-w-0"><span className="block truncate text-[14px] font-medium text-[#17202E]">{candidate.full_name || candidate.username || candidate.email}</span><span className="block truncate text-[12px] text-[#586174]">{candidate.email}</span></span></label>)}</div>
      </AppModal>}
      <AppConfirmDialog open={Boolean(deleting)} title={adminText('deleteCompanyTitle')} message={adminText('deleteCompanyDescription', { name: deleting?.name ?? '' })} confirmText={adminText('deleteAction')} isLoading={Boolean(updatingId)} error={deleteError} onConfirm={() => void deleteCompany()} onCancel={() => { if (!deletionBusy.current) setDeleting(null) }} />
    </main>
  )
}
