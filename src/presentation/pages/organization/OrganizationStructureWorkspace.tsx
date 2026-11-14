import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type {
  CreateOrganizationUnitInput,
  GrowyPositionRoleMapping,
  OrganizationMember,
  OrganizationUnit,
  UpdateOrganizationUnitInput,
} from '../../../infrastructure/repositories/HttpOrganizationRepository'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppModal from '../../../shared/ui/AppModal'
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog'
import CustomSelect from '../../../shared/ui/CustomSelect'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader'
import GrowyPositionRolesDialog from './GrowyPositionRolesDialog'
import { ot } from './orgText'
import { i18n } from '../../../shared/i18n'

const ORGANIZATION_NODE_ID = '__organization__'
const TREE_CARD_WIDTH = 256
const TREE_CARD_HEIGHT = 148
const TREE_ROOT_HEIGHT = 92
const TREE_GAP_X = 40
const TREE_GAP_Y = 56
const TREE_PADDING = 32
/** Колонка сотрудников раскрытого подразделения: «рельс» слева и карточки со сдвигом */
const TREE_RAIL_OFFSET = 20
const TREE_MEMBER_OFFSET = 40
const TREE_MEMBER_WIDTH = 232
const TREE_MEMBER_HEIGHT = 60
const TREE_MEMBER_GAP = 8
const TREE_MEMBER_TOP = 16
const MIN_SCALE = 0.4
const MAX_SCALE = 1.6
const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(value.toFixed(3))))

type DetailTab = 'info' | 'employees' | 'children'
type UnitUpdateOperation = { unit: OrganizationUnit; input: UpdateOrganizationUnitInput }
type StructureOrganization = {
  id: string
  name: string
  ownerId?: number | null
  ownerName?: string | null
}

type UnitFormState = {
  name: string
  unit_type: string
  parent_unit_id: string
  manager_id: string
  description: string
}

type StructureNode = {
  id: string
  name: string
  unitType: string
  description?: string | null
  parentId: string | null
  managerId?: number | null
  unit?: OrganizationUnit
  isOrganization: boolean
}

type TreeSlot = {
  node: StructureNode
  x: number
  y: number
  cardHeight: number
  /** Низ блока: карточка + колонка сотрудников, если подразделение раскрыто */
  blockBottom: number
  expanded: boolean
  canExpand: boolean
  members: Array<{ member: OrganizationMember; x: number; y: number }>
}

type OrganizationStructureWorkspaceProps = {
  organization: StructureOrganization
  canManageStructure: boolean
  units: OrganizationUnit[]
  members: OrganizationMember[]
  loading?: boolean
  error?: string | null
  onReload: () => Promise<void> | void
  onCreateUnit: (input: CreateOrganizationUnitInput) => Promise<void>
  onUpdateUnit: (unit: OrganizationUnit, input: UpdateOrganizationUnitInput) => Promise<void>
  onReorderUnits: (operations: UnitUpdateOperation[]) => Promise<void>
  onArchiveUnit: (unit: OrganizationUnit) => Promise<void>
  onAssignMember: (member: OrganizationMember, unitId: string) => Promise<void>
  onOpenOrganizationSettings?: () => void
  /** Создание компании доступно платформенному администратору из общей структуры */
  onCreateOrganization?: () => void
  /** Переход к полному списку компаний доступен платформенному администратору */
  onViewOrganizations?: () => void
  /** Адрес вкладки «Структура» в шапке раздела «Люди» */
  structureHref?: string
  /** Селектор компании в тулбаре (для системного администратора) */
  companyOptions?: Array<{ id: string; name: string }>
  onCompanyChange?: (organizationId: string) => void
  /** «Добавить сотрудника» для компании: создание нового пользователя (только системный администратор) */
  onAddEmployee?: () => void
  growyPositionRoles?: GrowyPositionRoleMapping[]
  onSaveGrowyPositionRoles?: (mappings: GrowyPositionRoleMapping[]) => Promise<GrowyPositionRoleMapping[]>
}

const FIELD_LABEL = 'text-[13px] font-medium leading-5 text-[var(--ts-text-secondary)]'
const FIELD_CONTROL = 'ts-input mt-1.5'


const emptyForm = (): UnitFormState => ({
  name: '',
  unit_type: 'team',
  parent_unit_id: '',
  manager_id: '',
  description: '',
})

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'
}

function unitTypePresentation(type: string, isOrganization = false): { label: string; icon: string; tone: string } {
  // Тип различаем иконкой и подписью; плашка иконки везде в цвете бренда
  const tone = 'bg-[#EDF2FF] text-[#2458D3]'
  if (isOrganization) return { label: ot('structure.t00'), icon: 'business', tone }
  const normalized = type.trim().toLowerCase()
  if (['team', 'команда'].includes(normalized)) return { label: ot('structure.t02'), icon: 'group', tone } // i18n-ignore
  if (['department', 'division', 'отдел', 'департамент', 'управление'].includes(normalized)) return { label: ot('structure.t06'), icon: 'account_tree', tone } // i18n-ignore
  if (['branch', 'филиал'].includes(normalized)) return { label: ot('structure.t08'), icon: 'domain', tone } // i18n-ignore
  if (['project', 'проект'].includes(normalized)) return { label: ot('structure.t10'), icon: 'view_kanban', tone } // i18n-ignore
  return { label: type.trim() || ot('structure.t11'), icon: 'account_tree', tone }
}

function Avatar({ member, name, size = 38 }: { member?: OrganizationMember; name: string; size?: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const avatarUrl = member?.avatar_url?.trim() ?? ''

  if (avatarUrl && failedUrl !== avatarUrl) {
    return <img src={avatarUrl} alt="" onError={() => setFailedUrl(avatarUrl)} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }

  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-[#2458D3] font-semibold text-white" style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.34)) }} aria-hidden>
      {initials(name)}
    </span>
  )
}

function RowMenu({ onEdit, onMove, onDelete }: { onEdit: () => void; onMove: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }} className={AXIS_UI.ghostIconButton} data-no-tooltip aria-haspopup="menu" aria-expanded={open} aria-label={ot('structure.t12')}>
        <MaterialSymbol name="more_horiz" size={16} color="currentColor" />
      </button>
      {open ? (
        <div className="absolute right-0 top-9 z-40 w-48 rounded-[8px] border border-[#E2E5EA] bg-white p-1 shadow-[0_8px_24px_rgba(23,32,46,0.12)]" onMouseLeave={() => setOpen(false)}>
          <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); onEdit() }} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] text-[#17202E] hover:bg-[#F6F7F9]"><MaterialSymbol name="edit" size={16} />{ot('structure.t13')}</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); onMove() }} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] text-[#17202E] hover:bg-[#F6F7F9]"><MaterialSymbol name="sync_alt" size={16} />{ot('structure.t14')}</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(false); onDelete() }} className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] text-[#C03437] hover:bg-[#FFF0F0]"><MaterialSymbol name="delete" size={16} />{ot('structure.t15')}</button>
        </div>
      ) : null}
    </div>
  )
}

function buildUnitPath(unit: OrganizationUnit, unitsById: Map<string, OrganizationUnit>, trail = new Set<string>()): string {
  if (trail.has(unit.id)) return unit.name
  const nextTrail = new Set(trail)
  nextTrail.add(unit.id)
  const parent = unit.parent_unit_id ? unitsById.get(unit.parent_unit_id) : undefined
  return parent ? `${buildUnitPath(parent, unitsById, nextTrail)} / ${unit.name}` : unit.name
}

export default function OrganizationStructureWorkspace({
  organization,
  canManageStructure,
  units,
  members,
  loading = false,
  error,
  onCreateUnit,
  onUpdateUnit,
  onArchiveUnit,
  onAssignMember,
  onOpenOrganizationSettings,
  onCreateOrganization,
  onViewOrganizations,
  structureHref = '/organization',
  companyOptions,
  onCompanyChange,
  onAddEmployee,
  growyPositionRoles = [],
  onSaveGrowyPositionRoles,
}: OrganizationStructureWorkspaceProps) {
  const [growyRolesOpen, setGrowyRolesOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<DetailTab>('info')
  const [selectedId, setSelectedId] = useState(ORGANIZATION_NODE_ID)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<UnitFormState>(emptyForm)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [movingUnit, setMovingUnit] = useState<OrganizationUnit | null>(null)
  const [moveParentId, setMoveParentId] = useState('')
  const [employeesOpen, setEmployeesOpen] = useState(false)
  /** Окно «Добавить сотрудника» в выбранное подразделение */
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addMemberQuery, setAddMemberQuery] = useState('')
  const [addingMemberId, setAddingMemberId] = useState<number | null>(null)
  const [addMemberError, setAddMemberError] = useState<string | null>(null)
  const [movingMember, setMovingMember] = useState<OrganizationMember | null>(null)
  const [memberDestinationId, setMemberDestinationId] = useState('')
  const [memberMoveSaving, setMemberMoveSaving] = useState(false)
  const [memberMoveError, setMemberMoveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deletingUnit, setDeletingUnit] = useState<OrganizationUnit | null>(null)
  const [archivingUnit, setArchivingUnit] = useState(false)
  /** Свёрнутые на схеме подразделения. По умолчанию всё раскрыто: видны сотрудники и дочерние подразделения */
  const [collapsedTreeIds, setCollapsedTreeIds] = useState<Set<string>>(new Set())
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 })
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const autoFittedRef = useRef(false)
  const navigate = useNavigate()
  const dragRef = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null)

  const unitsById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units])
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])
  const childrenByParent = useMemo(() => {
    const result = new Map<string, OrganizationUnit[]>()
    for (const unit of units) {
      const parentId = unit.parent_unit_id && unitsById.has(unit.parent_unit_id) ? unit.parent_unit_id : ORGANIZATION_NODE_ID
      const next = result.get(parentId) ?? []
      next.push(unit)
      result.set(parentId, next)
    }
    for (const list of result.values()) list.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'ru'))
    return result
  }, [units, unitsById])
  const directMembersByUnit = useMemo(() => {
    const result = new Map<string, OrganizationMember[]>()
    for (const member of members) {
      const key = member.unit_id ?? ORGANIZATION_NODE_ID
      const next = result.get(key) ?? []
      next.push(member)
      result.set(key, next)
    }
    for (const list of result.values()) list.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email, 'ru'))
    return result
  }, [members])

  const unitTypes = useMemo(() => [...new Set(units.map((unit) => unit.unit_type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [units])
  const rootNode = useMemo<StructureNode>(() => ({
    id: ORGANIZATION_NODE_ID,
    name: organization.name,
    unitType: 'company',
    parentId: null,
    managerId: organization.ownerId,
    isOrganization: true,
  }), [organization.name, organization.ownerId])
  const nodesById = useMemo(() => {
    const result = new Map<string, StructureNode>([[ORGANIZATION_NODE_ID, rootNode]])
    units.forEach((unit) => result.set(unit.id, {
      id: unit.id,
      name: unit.name,
      unitType: unit.unit_type,
      description: unit.description,
      parentId: unit.parent_unit_id && unitsById.has(unit.parent_unit_id) ? unit.parent_unit_id : ORGANIZATION_NODE_ID,
      managerId: unit.manager_id,
      unit,
      isOrganization: false,
    }))
    return result
  }, [rootNode, units, unitsById])

  const descendantMemberCount = useMemo(() => {
    const cache = new Map<string, number>()
    const count = (nodeId: string, trail = new Set<string>()): number => {
      if (nodeId === ORGANIZATION_NODE_ID) return members.length
      const cached = cache.get(nodeId)
      if (cached !== undefined) return cached
      if (trail.has(nodeId)) return 0
      const nextTrail = new Set(trail)
      nextTrail.add(nodeId)
      const direct = directMembersByUnit.get(nodeId)?.length ?? 0
      const nested = (childrenByParent.get(nodeId) ?? []).reduce((sum, child) => sum + count(child.id, nextTrail), 0)
      cache.set(nodeId, direct + nested)
      return direct + nested
    }
    nodesById.forEach((_, id) => count(id))
    cache.set(ORGANIZATION_NODE_ID, members.length)
    return cache
  }, [childrenByParent, directMembersByUnit, members.length, nodesById])

  const descendantMembersByNode = useMemo(() => {
    const cache = new Map<string, OrganizationMember[]>()
    const collect = (nodeId: string, trail = new Set<string>()): OrganizationMember[] => {
      if (nodeId === ORGANIZATION_NODE_ID) return members
      const cached = cache.get(nodeId)
      if (cached) return cached
      if (trail.has(nodeId)) return []
      const nextTrail = new Set(trail)
      nextTrail.add(nodeId)
      const collected = [...(directMembersByUnit.get(nodeId) ?? [])]
      for (const child of childrenByParent.get(nodeId) ?? []) collected.push(...collect(child.id, nextTrail))
      const unique = [...new Map(collected.map((member) => [member.id, member])).values()]
      cache.set(nodeId, unique)
      return unique
    }
    nodesById.forEach((_, id) => collect(id))
    cache.set(ORGANIZATION_NODE_ID, members)
    return cache
  }, [childrenByParent, directMembersByUnit, members, nodesById])

  const includedIds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return null
    const included = new Set<string>([ORGANIZATION_NODE_ID])
    for (const unit of units) {
      const manager = unit.manager_id ? membersById.get(unit.manager_id) : undefined
      const unitMembers = directMembersByUnit.get(unit.id) ?? []
      const text = [
        unit.name,
        unit.description,
        unit.unit_type,
        manager?.full_name,
        manager?.email,
        ...unitMembers.flatMap((member) => [member.full_name, member.email, member.position]),
      ].filter(Boolean).join(' ').toLowerCase()
      const matchesQuery = !normalizedQuery || text.includes(normalizedQuery)
      if (!matchesQuery) continue
      let current: OrganizationUnit | undefined = unit
      const trail = new Set<string>()
      while (current && !trail.has(current.id)) {
        trail.add(current.id)
        included.add(current.id)
        current = current.parent_unit_id ? unitsById.get(current.parent_unit_id) : undefined
      }
    }
    return included
  }, [directMembersByUnit, membersById, query, units, unitsById])

  const treeLayout = useMemo(() => {
    const hasQuery = Boolean(query.trim())
    const isExpanded = (nodeId: string) =>
      nodeId === ORGANIZATION_NODE_ID || !collapsedTreeIds.has(nodeId) || (hasQuery && Boolean(includedIds?.has(nodeId)))
    const visibleChildren = (nodeId: string) =>
      (childrenByParent.get(nodeId) ?? []).filter((unit) => !includedIds || includedIds.has(unit.id))
    const membersOf = (node: StructureNode) => (node.isOrganization ? [] : directMembersByUnit.get(node.id) ?? [])
    const cardHeightOf = (node: StructureNode) => (node.isOrganization ? TREE_ROOT_HEIGHT : TREE_CARD_HEIGHT)
    const shownMembersOf = (node: StructureNode) => (isExpanded(node.id) ? membersOf(node) : [])
    const ownWidthOf = (node: StructureNode) =>
      shownMembersOf(node).length > 0 ? Math.max(TREE_CARD_WIDTH, TREE_MEMBER_OFFSET + TREE_MEMBER_WIDTH) : TREE_CARD_WIDTH
    const blockHeightOf = (node: StructureNode) => {
      const count = shownMembersOf(node).length
      return cardHeightOf(node) + (count > 0 ? TREE_MEMBER_TOP + count * TREE_MEMBER_HEIGHT + (count - 1) * TREE_MEMBER_GAP : 0)
    }

    const widths = new Map<string, number>()
    const calculateWidth = (nodeId: string, trail = new Set<string>()): number => {
      const node = nodesById.get(nodeId)
      if (!node) return TREE_CARD_WIDTH
      const own = ownWidthOf(node)
      if (trail.has(nodeId)) return own
      const nextTrail = new Set(trail)
      nextTrail.add(nodeId)
      const children = isExpanded(nodeId) ? visibleChildren(nodeId) : []
      const childrenWidth = children.reduce((sum, child, index) => sum + calculateWidth(child.id, nextTrail) + (index > 0 ? TREE_GAP_X : 0), 0)
      const width = Math.max(own, childrenWidth)
      widths.set(nodeId, width)
      return width
    }
    const totalWidth = calculateWidth(ORGANIZATION_NODE_ID)

    const slots: TreeSlot[] = []
    let maxBottom = 0
    const place = (nodeId: string, left: number, top: number, trail = new Set<string>()) => {
      if (trail.has(nodeId)) return
      const node = nodesById.get(nodeId)
      if (!node) return
      const width = widths.get(nodeId) ?? TREE_CARD_WIDTH
      const own = ownWidthOf(node)
      const x = left + (width - own) / 2
      const cardHeight = cardHeightOf(node)
      const memberTop = top + cardHeight + TREE_MEMBER_TOP
      const members = shownMembersOf(node).map((member, index) => ({
        member,
        x: x + TREE_MEMBER_OFFSET,
        y: memberTop + index * (TREE_MEMBER_HEIGHT + TREE_MEMBER_GAP),
      }))
      const blockHeight = blockHeightOf(node)
      const expanded = isExpanded(nodeId)
      const children = expanded ? visibleChildren(nodeId) : []
      slots.push({
        node,
        x,
        y: top,
        cardHeight,
        blockBottom: top + blockHeight,
        expanded,
        canExpand: membersOf(node).length > 0 || (childrenByParent.get(nodeId)?.length ?? 0) > 0,
        members,
      })
      maxBottom = Math.max(maxBottom, top + blockHeight)
      const nextTrail = new Set(trail)
      nextTrail.add(nodeId)
      const childrenWidth = children.reduce((sum, child, index) => sum + (widths.get(child.id) ?? TREE_CARD_WIDTH) + (index > 0 ? TREE_GAP_X : 0), 0)
      let childLeft = left + (width - childrenWidth) / 2
      for (const child of children) {
        const childWidth = widths.get(child.id) ?? TREE_CARD_WIDTH
        place(child.id, childLeft, top + blockHeight + TREE_GAP_Y, nextTrail)
        childLeft += childWidth + TREE_GAP_X
      }
    }
    place(ORGANIZATION_NODE_ID, TREE_PADDING, TREE_PADDING)

    return {
      slots,
      slotsById: new Map(slots.map((slot) => [slot.node.id, slot])),
      width: Math.max(640, totalWidth + TREE_PADDING * 2),
      height: Math.max(480, maxBottom + TREE_PADDING),
    }
  }, [childrenByParent, collapsedTreeIds, directMembersByUnit, includedIds, nodesById, query])

  const selectedNode = nodesById.get(selectedId) ?? rootNode
  const selectedUnit = selectedNode.unit
  const selectedMembers = descendantMembersByNode.get(selectedNode.id) ?? []
  const selectedChildren = childrenByParent.get(selectedNode.id) ?? []
  const selectedManager = selectedNode.managerId ? membersById.get(selectedNode.managerId) : undefined
  const selectedManagerName = selectedManager?.full_name || selectedManager?.email || (selectedNode.isOrganization ? organization.ownerName : '') || ''
  const organizationManager = organization.ownerId ? membersById.get(organization.ownerId) : undefined
  const organizationManagerName = organizationManager?.full_name || organizationManager?.email || organization.ownerName || ''
  const parentNode = selectedNode.parentId ? nodesById.get(selectedNode.parentId) : undefined
  const parentManager = parentNode
    ? parentNode.isOrganization ? organizationManager : parentNode.managerId ? membersById.get(parentNode.managerId) : undefined
    : undefined
  const parentManagerName = parentNode?.isOrganization
    ? organizationManagerName
    : parentManager?.full_name || parentManager?.email || ''
  /** Выбранный узел и все его предки — эта ветка подсвечивается на схеме */
  const selectedPathIds = useMemo(() => {
    const path = new Set<string>()
    let current = nodesById.get(selectedId)
    while (current && !path.has(current.id)) {
      path.add(current.id)
      current = current.parentId ? nodesById.get(current.parentId) : undefined
    }
    return path
  }, [nodesById, selectedId])

  const descendantIds = useMemo(() => {
    if (!movingUnit) return new Set<string>()
    const result = new Set<string>([movingUnit.id])
    const visit = (id: string) => {
      for (const child of childrenByParent.get(id) ?? []) {
        if (result.has(child.id)) continue
        result.add(child.id)
        visit(child.id)
      }
    }
    visit(movingUnit.id)
    return result
  }, [childrenByParent, movingUnit])

  const selectNode = (id: string) => {
    setSelectedId(id)
    setDetailTab('info')
    setActionError(null)
  }

  const openCreate = (parentId?: string) => {
    if (!canManageStructure) return
    setForm({ ...emptyForm(), parent_unit_id: parentId && parentId !== ORGANIZATION_NODE_ID ? parentId : '' })
    setFormMode('create')
    setActionError(null)
  }

  const openEdit = (unit: OrganizationUnit) => {
    if (!canManageStructure) return
    setForm({
      name: unit.name,
      unit_type: unit.unit_type,
      parent_unit_id: unit.parent_unit_id ?? '',
      manager_id: unit.manager_id ? String(unit.manager_id) : '',
      description: unit.description ?? '',
    })
    setFormMode('edit')
    setSelectedId(unit.id)
    setActionError(null)
  }

  const saveForm = async () => {
    if (!canManageStructure || !form.name.trim()) return
    setSaving(true)
    setActionError(null)
    try {
      if (formMode === 'edit' && selectedUnit) {
        await onUpdateUnit(selectedUnit, {
          name: form.name.trim(),
          unit_type: form.unit_type.trim() || 'team',
          ...(form.parent_unit_id ? { parent_unit_id: form.parent_unit_id } : { clear_parent: true }),
          description: form.description.trim() || null,
          ...(form.manager_id ? { manager_id: Number(form.manager_id) } : { clear_manager: true }),
        })
      } else {
        await onCreateUnit({
          name: form.name.trim(),
          unit_type: form.unit_type.trim() || 'team',
          parent_unit_id: form.parent_unit_id || null,
          description: form.description.trim() || undefined,
          manager_id: form.manager_id ? Number(form.manager_id) : null,
        })
      }
      setFormMode(null)
    } catch (mutationError) {
      setActionError(mutationError instanceof Error ? mutationError.message : ot('structure.t16'))
    } finally {
      setSaving(false)
    }
  }

  const moveUnit = async () => {
    if (!canManageStructure || !movingUnit) return
    setSaving(true)
    setActionError(null)
    try {
      await onUpdateUnit(movingUnit, moveParentId ? { parent_unit_id: moveParentId } : { clear_parent: true })
      setMovingUnit(null)
    } catch (mutationError) {
      setActionError(mutationError instanceof Error ? mutationError.message : ot('structure.t17'))
    } finally {
      setSaving(false)
    }
  }

  const openAddMember = () => {
    if (!canManageStructure || !selectedUnit) return
    setAddMemberQuery('')
    setAddMemberError(null)
    setAddMemberOpen(true)
  }

  const addMemberToSelectedUnit = async (member: OrganizationMember) => {
    if (!canManageStructure || !selectedUnit) return
    setAddingMemberId(member.id)
    setAddMemberError(null)
    try {
      await onAssignMember(member, selectedUnit.id)
    } catch (assignError) {
      setAddMemberError(assignError instanceof Error ? assignError.message : ot('structure.t18'))
    } finally {
      setAddingMemberId(null)
    }
  }

  const addMemberCandidates = (() => {
    if (!selectedUnit) return []
    const normalizedQuery = addMemberQuery.trim().toLowerCase()
    return members
      .filter((member) => member.unit_id !== selectedUnit.id)
      .filter((member) => !normalizedQuery || [member.full_name, member.email, member.position].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
  })()

  const openMemberMove = (member: OrganizationMember) => {
    if (!canManageStructure) return
    setMovingMember(member)
    setMemberDestinationId(member.unit_id ?? '')
    setMemberMoveError(null)
  }

  const moveMember = async () => {
    if (!canManageStructure || !movingMember) return
    setMemberMoveSaving(true)
    setMemberMoveError(null)
    try {
      await onAssignMember(movingMember, memberDestinationId)
      setMovingMember(null)
    } catch (moveError) {
      setMemberMoveError(moveError instanceof Error ? moveError.message : ot('structure.t19'))
    } finally {
      setMemberMoveSaving(false)
    }
  }

  const archiveUnit = (unit: OrganizationUnit) => {
    if (!canManageStructure) return
    setDeletingUnit(unit)
  }

  const confirmArchiveUnit = async () => {
    const unit = deletingUnit
    if (!unit) return
    setActionError(null)
    setArchivingUnit(true)
    try {
      await onArchiveUnit(unit)
      if (selectedId === unit.id) setSelectedId(ORGANIZATION_NODE_ID)
    } catch (mutationError) {
      setActionError(mutationError instanceof Error ? mutationError.message : ot('structure.t20'))
    } finally {
      setArchivingUnit(false)
      setDeletingUnit(null)
    }
  }

  const zoomAt = (factor: number, pointX: number, pointY: number) => {
    setView((current) => {
      const nextScale = clampScale(current.scale * factor)
      const ratio = nextScale / current.scale
      return { scale: nextScale, x: pointX - (pointX - current.x) * ratio, y: pointY - (pointY - current.y) * ratio }
    })
  }

  const zoomFromCenter = (factor: number) => zoomAt(factor, viewportSize.width / 2, viewportSize.height / 2)

  const fitTree = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    const width = viewport.clientWidth
    const height = viewport.clientHeight
    const nextScale = clampScale(Math.min(1, (width - 48) / treeLayout.width, (height - 48) / treeLayout.height))
    setView({
      scale: nextScale,
      x: Math.max(24, (width - treeLayout.width * nextScale) / 2),
      y: 24,
    })
  }

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, select, a, [role="button"]')) return
    dragRef.current = { pointerId: event.pointerId, x: view.x, y: view.y, startX: event.clientX, startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const continuePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const nextX = drag.x + event.clientX - drag.startX
    const nextY = drag.y + event.clientY - drag.startY
    setView((current) => ({ ...current, x: nextX, y: nextY }))
  }

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  const jumpFromMinimap = (event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const treeX = ((event.clientX - rect.left) / rect.width) * treeLayout.width
    const treeY = ((event.clientY - rect.top) / rect.height) * treeLayout.height
    setView((current) => ({
      ...current,
      x: viewportSize.width / 2 - treeX * current.scale,
      y: viewportSize.height / 2 - treeY * current.scale,
    }))
  }

  // Размер холста и зум колесом мыши к точке под курсором
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewportSize({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const pointX = event.clientX - rect.left
      const pointY = event.clientY - rect.top
      const factor = Math.exp(-event.deltaY * 0.0015)
      setView((current) => {
        const nextScale = clampScale(current.scale * factor)
        const ratio = nextScale / current.scale
        return { scale: nextScale, x: pointX - (pointX - current.x) * ratio, y: pointY - (pointY - current.y) * ratio }
      })
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      observer.disconnect()
      element.removeEventListener('wheel', handleWheel)
    }
  }, [loading])

  // При первом показе схемы вписываем её в холст
  useEffect(() => {
    if (loading || autoFittedRef.current || viewportSize.width === 0) return
    autoFittedRef.current = true
    const nextScale = clampScale(Math.min(1, (viewportSize.width - 48) / treeLayout.width, (viewportSize.height - 48) / treeLayout.height))
    setView({ scale: nextScale, x: Math.max(24, (viewportSize.width - treeLayout.width * nextScale) / 2), y: 24 })
  }, [loading, treeLayout.height, treeLayout.width, viewportSize.height, viewportSize.width])

  const toggleExpanded = (id: string) => {
    setCollapsedTreeIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderMemberMoveButton = (member: OrganizationMember) => (
    canManageStructure ? <button type="button" onClick={() => openMemberMove(member)} className={AXIS_UI.ghostIconButton} aria-label={ot('structure.moveMember', { name: member.full_name || member.email })} data-no-tooltip>
      <MaterialSymbol name="more_horiz" size={16} color="currentColor" />
    </button> : null
  )

  const expandableUnitIds = units.filter((unit) => (childrenByParent.get(unit.id)?.length ?? 0) > 0 || (directMembersByUnit.get(unit.id)?.length ?? 0) > 0).map((unit) => unit.id)
  const hasCollapsed = collapsedTreeIds.size > 0
  const canToggleAll = expandableUnitIds.length > 0
  const toggleAllCollapsed = () => setCollapsedTreeIds(hasCollapsed ? new Set() : new Set(expandableUnitIds))

  const memberRow = (member: OrganizationMember) => {
    const name = member.full_name || member.email
    return (
      <div key={member.id} className="flex items-center gap-3 py-2">
        <button type="button" onClick={() => navigate('/alem-contact', { state: { openContactId: member.id } })} className="flex min-w-0 flex-1 items-center gap-3 rounded-[8px] text-left hover:bg-[#F6F7F9]" title={ot('structure.t21')}>
          <Avatar member={member} name={name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium leading-5 text-[#17202E]">{name}</div>
            <div className="truncate text-[12px] leading-4 text-[#586174]">{member.position || member.email}</div>
          </div>
        </button>
        {renderMemberMoveButton(member)}
      </div>
    )
  }

  const selectedPresentation = unitTypePresentation(selectedNode.unitType, selectedNode.isOrganization)

  return (
    <main className="min-h-full min-w-0 bg-[#F6F7F9] px-4 py-6 [font-family:Inter,sans-serif] md:px-6 xl:px-8">
      <PeopleSectionHeader
        active="structure"
        title={ot('structure.t22')}
        structureHref={structureHref}
        accessHref={canManageStructure ? (companyOptions ? `/platform/organizations/${organization.id}/access` : "/organization/access") : undefined}
        importHref={canManageStructure && !companyOptions ? "/organization/import" : undefined}
        description={ot('structure.t23')}
        actions={
          <>
            {onCreateOrganization ? (
              <button type="button" onClick={onCreateOrganization} className={`${AXIS_UI.secondaryButton} !h-11`}>
                <MaterialSymbol name="business" size={18} color="currentColor" />
                {ot('structure.t24')}
              </button>
            ) : null}
            {onViewOrganizations ? (
              <button type="button" onClick={onViewOrganizations} className={`${AXIS_UI.secondaryButton} !h-11`}>
                <MaterialSymbol name="list" size={18} color="currentColor" />
                {ot('structure.t25')}
              </button>
            ) : null}
            {canManageStructure && onSaveGrowyPositionRoles ? (
              <button type="button" disabled={loading || Boolean(error)} onClick={() => setGrowyRolesOpen(true)} className={`${AXIS_UI.secondaryButton} !h-11`}>
                <MaterialSymbol name="school" size={18} color="currentColor" />
                {ot('structure.t26')}
              </button>
            ) : null}
            {canManageStructure ? (
              <button type="button" onClick={() => openCreate(selectedNode.isOrganization ? undefined : selectedNode.id)} className={AXIS_UI.primaryButton}>
                <MaterialSymbol name="add" size={18} color="currentColor" />
                {ot('structure.t11')}
              </button>
            ) : null}
          </>
        }
      />

      {(error || actionError) ? <div className="mt-4 rounded-[8px] border border-[#C03437]/20 bg-[#FFF0F0] px-4 py-3 text-[14px] text-[#C03437]">{actionError || error}</div> : null}

      <div className="mt-5 grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 overflow-hidden rounded-[12px] border border-[#E2E5EA] bg-white">
          <div className="flex flex-col gap-2 border-b border-[#E2E5EA] p-4 lg:flex-row lg:items-center">
            <label className={`${AXIS_UI.inputShell} !h-10 min-w-0 flex-1`}>
              <MaterialSymbol name="search" size={16} color="#586174" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ot('structure.t27')} aria-label={ot('structure.t28')} className={AXIS_UI.input} />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {companyOptions && onCompanyChange && companyOptions.length > 0 ? (
                <CustomSelect
                  variant="compact"
                  label={ot('structure.t00')}
                  value={organization.id}
                  emptyLabel={organization.name}
                  allowEmpty={false}
                  options={companyOptions.map((company) => ({ value: company.id, label: company.name }))}
                  onChange={(value) => {
                    if (value && value !== organization.id) onCompanyChange(value)
                  }}
                />
              ) : null}
              <button type="button" onClick={toggleAllCollapsed} disabled={!canToggleAll} className={`${AXIS_UI.secondaryButton} !h-10`}>
                <MaterialSymbol name={hasCollapsed ? 'expand_more' : 'expand_less'} size={16} color="currentColor" />
                {hasCollapsed ? ot('structure.t29') : ot('structure.t30')}
              </button>
            </div>
          </div>

          {loading ? <div className="flex min-h-[600px] items-center justify-center text-[14px] text-[#586174]">{ot('structure.t31')}</div> : (
            <div
              ref={viewportRef}
              onPointerDown={beginPan}
              onPointerMove={continuePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              className="relative h-[640px] cursor-grab touch-none select-none overflow-hidden bg-[#F6F7F9] active:cursor-grabbing"
              style={{ backgroundImage: 'radial-gradient(#D5D9E0 1px, transparent 1px)', backgroundSize: '20px 20px' }}
            >
              <div className="absolute left-0 top-0" style={{ width: treeLayout.width, height: treeLayout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}>
                <svg className="absolute inset-0 overflow-visible" width={treeLayout.width} height={treeLayout.height} aria-hidden>
                  {treeLayout.slots.map((slot) => {
                    const lines = []
                    const railX = slot.x + TREE_RAIL_OFFSET
                    if (slot.members.length > 0) {
                      const lastCenter = slot.members[slot.members.length - 1].y + TREE_MEMBER_HEIGHT / 2
                      const railActive = selectedPathIds.has(slot.node.id)
                      lines.push(<path key={`rail-${slot.node.id}`} d={`M ${railX} ${slot.y + slot.cardHeight} V ${lastCenter}`} fill="none" stroke={railActive ? '#2458D3' : '#C4C9D2'} strokeWidth="1.5" />)
                      slot.members.forEach(({ member, x, y }) => {
                        const centerY = y + TREE_MEMBER_HEIGHT / 2
                        lines.push(<path key={`tick-${slot.node.id}-${member.id}`} d={`M ${railX} ${centerY} H ${x}`} fill="none" stroke={railActive ? '#2458D3' : '#C4C9D2'} strokeWidth="1.5" />)
                      })
                    }
                    const parent = slot.node.parentId ? treeLayout.slotsById.get(slot.node.parentId) : undefined
                    if (parent) {
                      const fromRail = parent.members.length > 0
                      const startX = fromRail ? parent.x + TREE_RAIL_OFFSET : parent.x + TREE_CARD_WIDTH / 2
                      const startY = fromRail ? parent.members[parent.members.length - 1].y + TREE_MEMBER_HEIGHT / 2 : parent.y + parent.cardHeight
                      const endX = slot.x + TREE_CARD_WIDTH / 2
                      const middleY = parent.blockBottom + TREE_GAP_Y / 2
                      const active = selectedPathIds.has(slot.node.id)
                      lines.push(<path key={`edge-${slot.node.id}`} d={`M ${startX} ${startY} V ${middleY} H ${endX} V ${slot.y}`} fill="none" stroke={active ? '#2458D3' : '#C4C9D2'} strokeWidth={active ? 2 : 1.5} />)
                    }
                    return lines
                  })}
                </svg>

                {treeLayout.slots.map((slot) => {
                  const { node } = slot
                  const isSelected = selectedNode.id === node.id
                  const cardClass = `absolute rounded-[12px] border bg-white text-left transition-[border-color,box-shadow] duration-[120ms] ${AXIS_UI.focus} ${isSelected ? 'border-[#2458D3] shadow-[0_0_0_1px_#2458D3,0_8px_24px_rgba(36,88,211,0.12)]' : 'border-[#E2E5EA] shadow-[0_2px_8px_rgba(23,32,46,0.04)] hover:border-[#C4C9D2] hover:shadow-[0_4px_16px_rgba(23,32,46,0.08)]'}`
                  const cardHandlers = {
                    role: 'button' as const,
                    tabIndex: 0,
                    'aria-pressed': isSelected,
                    onClick: () => selectNode(node.id),
                    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
                      if (event.target !== event.currentTarget) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        selectNode(node.id)
                      }
                    },
                  }

                  if (node.isOrganization) {
                    const ownerName = organizationManagerName
                    return (
                      <div key={node.id} {...cardHandlers} className={`${cardClass} flex items-center gap-3 p-4`} style={{ left: slot.x, top: slot.y, width: TREE_CARD_WIDTH, height: slot.cardHeight }}>
                        {ownerName ? (
                          <>
                            <Avatar member={organizationManager} name={ownerName} size={52} />
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-[14px] font-semibold leading-5 text-[#17202E]">{ownerName}</strong>
                              <span className="block truncate text-[12px] leading-4 text-[#586174]">{organizationManager?.position || ot('structure.t32')}</span>
                              <span className="mt-0.5 block truncate text-[12px] leading-4 text-[#7B8494]">{organization.name}</span>
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]"><MaterialSymbol name="business" size={22} color="currentColor" /></span>
                            <span className="min-w-0 flex-1">
                              <strong className="block truncate text-[14px] font-semibold leading-5 text-[#17202E]">{organization.name}</strong>
                              <span className="block truncate text-[12px] leading-4 text-[#586174]">{ot('structure.t33')}</span>
                            </span>
                          </>
                        )}
                      </div>
                    )
                  }

                  const presentation = unitTypePresentation(node.unitType, node.isOrganization)
                  const manager = node.managerId ? membersById.get(node.managerId) : undefined
                  const managerName = manager?.full_name || manager?.email || ''
                  const memberCount = descendantMemberCount.get(node.id) ?? 0
                  return (
                    <div key={node.id} className="contents">
                      <div {...cardHandlers} data-tree-card className={`${cardClass} p-4`} style={{ left: slot.x, top: slot.y, width: TREE_CARD_WIDTH, height: slot.cardHeight }}>
                        <div className="flex items-start gap-3">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] ${presentation.tone}`}><MaterialSymbol name={presentation.icon} size={20} color="currentColor" /></span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-[14px] font-semibold leading-5 text-[#17202E]">{node.name}</strong>
                            <span className="mt-0.5 block text-[12px] leading-4 tabular-nums text-[#586174]">{ot('structure.members', { count: memberCount })}</span>
                          </span>
                          {node.unit && canManageStructure ? (
                            <div className="-mr-1.5 -mt-1.5" onClick={(event) => event.stopPropagation()}>
                              <RowMenu onEdit={() => openEdit(node.unit!)} onMove={() => { setMovingUnit(node.unit!); setMoveParentId(node.unit?.parent_unit_id ?? '') }} onDelete={() => archiveUnit(node.unit!)} />
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-3 flex items-center gap-2.5">
                          {managerName ? (
                            <Avatar member={manager} name={managerName} size={32} />
                          ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] text-[#7B8494]" aria-hidden>
                              <MaterialSymbol name="person" size={16} color="currentColor" />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-medium leading-5 text-[#17202E]">{managerName || ot('structure.t33')}</span>
                            <span className="block truncate text-[12px] leading-4 text-[#586174]">{manager?.position || (managerName ? ot('structure.t37') : '—')}</span>
                          </span>
                        </div>
                        {slot.canExpand ? (
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); toggleExpanded(node.id) }}
                            aria-expanded={slot.expanded}
                            aria-label={slot.expanded ? ot('structure.collapseNamed', { name: node.name }) : ot('structure.expandNamed', { name: node.name })}
                            className={`absolute bottom-1.5 left-1/2 flex h-6 w-8 -translate-x-1/2 items-center justify-center rounded-[6px] transition-colors duration-[120ms] hover:bg-[#F1F2F4] ${AXIS_UI.focus} ${slot.expanded ? 'text-[#2458D3]' : 'text-[#586174] hover:text-[#2458D3]'}`}
                          >
                            <MaterialSymbol name={slot.expanded ? 'expand_less' : 'expand_more'} size={18} color="currentColor" />
                          </button>
                        ) : null}
                      </div>

                      {slot.members.map(({ member, x, y }) => {
                        const name = member.full_name || member.email
                        return (
                          <div key={`member-${node.id}-${member.id}`} className="absolute flex items-center gap-3 rounded-[10px] border border-[#E2E5EA] bg-white px-3 shadow-[0_1px_4px_rgba(23,32,46,0.04)]" style={{ left: x, top: y, width: TREE_MEMBER_WIDTH, height: TREE_MEMBER_HEIGHT }}>
                            <Avatar member={member} name={name} size={36} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-medium leading-5 text-[#17202E]">{name}</span>
                              <span className="block truncate text-[12px] leading-4 text-[#586174]">{member.position || member.email}</span>
                            </span>
                            {renderMemberMoveButton(member)}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>

              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <div className="flex h-9 items-center overflow-hidden rounded-[8px] border border-[#E2E5EA] bg-white shadow-[0_2px_8px_rgba(23,32,46,0.06)]">
                  <button type="button" onClick={() => zoomFromCenter(1 / 1.15)} className="flex h-full w-9 items-center justify-center text-[#586174] hover:bg-[#F6F7F9] hover:text-[#17202E]" aria-label={ot('structure.t38')}><MaterialSymbol name="remove" size={16} color="currentColor" /></button>
                  <span className="w-12 text-center text-[12px] font-medium tabular-nums text-[#17202E]">{Math.round(view.scale * 100)}%</span>
                  <button type="button" onClick={() => zoomFromCenter(1.15)} className="flex h-full w-9 items-center justify-center text-[#586174] hover:bg-[#F6F7F9] hover:text-[#17202E]" aria-label={ot('structure.t39')}><MaterialSymbol name="add" size={16} color="currentColor" /></button>
                </div>
                <button type="button" onClick={fitTree} className={`${AXIS_UI.iconButton} shadow-[0_2px_8px_rgba(23,32,46,0.06)]`} aria-label={ot('structure.t40')} title={ot('structure.t41')}><MaterialSymbol name="fit_screen" size={16} color="currentColor" /></button>
              </div>

              <div className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 text-[12px] text-[#586174] lg:flex">
                <MaterialSymbol name="drag_indicator" size={14} color="currentColor" />
                {ot('structure.t42')}
              </div>

              <div
                role="button"
                tabIndex={-1}
                aria-label={ot('structure.t43')}
                onClick={jumpFromMinimap}
                className="absolute bottom-4 right-4 h-[96px] w-[160px] cursor-pointer overflow-hidden rounded-[8px] border border-[#E2E5EA] bg-white shadow-[0_2px_8px_rgba(23,32,46,0.06)]"
              >
                <div className="relative h-full w-full bg-[#F6F7F9]">
                  {treeLayout.slots.map((slot) => (
                    <span
                      key={`mini-${slot.node.id}`}
                      className={`absolute rounded-[2px] ${selectedNode.id === slot.node.id ? 'bg-[#2458D3]' : 'bg-[#C4C9D2]'}`}
                      style={{
                        left: `${(slot.x / treeLayout.width) * 100}%`,
                        top: `${(slot.y / treeLayout.height) * 100}%`,
                        width: `${Math.max(4, (TREE_CARD_WIDTH / treeLayout.width) * 100)}%`,
                        height: `${Math.max(4, ((slot.blockBottom - slot.y) / treeLayout.height) * 100)}%`,
                      }}
                    />
                  ))}
                  {viewportSize.width > 0 ? (
                    <span
                      className="pointer-events-none absolute rounded-[2px] border-[1.5px] border-[#2458D3] bg-[#2458D3]/5"
                      style={{
                        left: `${((-view.x / view.scale) / treeLayout.width) * 100}%`,
                        top: `${((-view.y / view.scale) / treeLayout.height) * 100}%`,
                        width: `${((viewportSize.width / view.scale) / treeLayout.width) * 100}%`,
                        height: `${((viewportSize.height / view.scale) / treeLayout.height) * 100}%`,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="overflow-hidden rounded-[12px] border border-[#E2E5EA] bg-white 2xl:sticky 2xl:top-5">
          <div className="p-5">
            <div className="flex items-start gap-3">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] ${selectedPresentation.tone}`}><MaterialSymbol name={selectedPresentation.icon} size={22} color="currentColor" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[18px] font-semibold leading-[26px] text-[#17202E]">{selectedNode.name}</h2>
                <p className="mt-0.5 truncate text-[14px] leading-5 text-[#586174]">{selectedNode.isOrganization ? ot('structure.t00') : `${selectedPresentation.label} · ${organization.name}`}</p>
              </div>
              {canManageStructure && selectedUnit ? (
                <button type="button" onClick={() => openEdit(selectedUnit)} className={AXIS_UI.ghostIconButton} aria-label={ot('structure.t44')} title={ot('structure.t13')}><MaterialSymbol name="edit" size={16} color="currentColor" /></button>
              ) : canManageStructure && onOpenOrganizationSettings ? (
                <button type="button" onClick={onOpenOrganizationSettings} className={AXIS_UI.ghostIconButton} aria-label={ot('structure.t45')} title={ot('structure.t45')}><MaterialSymbol name="settings" size={16} color="currentColor" /></button>
              ) : null}
              {!selectedNode.isOrganization ? (
                <button type="button" onClick={() => selectNode(ORGANIZATION_NODE_ID)} className={AXIS_UI.ghostIconButton} aria-label={ot('structure.t46')} title={ot('structure.t47')}><MaterialSymbol name="close" size={18} color="currentColor" /></button>
              ) : null}
            </div>
            {selectedNode.description ? <p className="mt-3 text-[14px] leading-5 text-[#586174]">{selectedNode.description}</p> : null}
          </div>

          <div className="flex gap-4 overflow-x-auto border-b border-[#E2E5EA] px-5 [scrollbar-width:none]">
            {([['info', ot('structure.t48'), null], ['employees', ot('structure.t49'), selectedMembers.length], ['children', ot('structure.t50'), selectedChildren.length]] as const).map(([id, label, count]) => (
              <button key={id} type="button" onClick={() => setDetailTab(id)} aria-current={detailTab === id ? 'page' : undefined} className={`${AXIS_UI.tab} !h-10 whitespace-nowrap ${detailTab === id ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}>
                {label}
                {count !== null ? <span className={AXIS_UI.countBadge}>{count}</span> : null}
              </button>
            ))}
          </div>

          {detailTab === 'info' ? (
            <div>
              <section className="border-b border-[#E2E5EA] px-5 py-4">
                <h3 className="text-[14px] font-semibold leading-5 text-[#17202E]">{ot('structure.t37')}</h3>
                {selectedManagerName ? (
                  <div className="mt-3 flex items-center gap-3">
                    <Avatar member={selectedManager} name={selectedManagerName} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium leading-5 text-[#17202E]">{selectedManagerName}</div>
                      <div className="mt-0.5 truncate text-[12px] leading-4 text-[#586174]">{selectedManager?.position || (selectedNode.isOrganization ? ot('structure.t32') : ot('structure.t51'))}</div>
                    </div>
                    {canManageStructure && selectedUnit ? <button type="button" onClick={() => openEdit(selectedUnit)} className="text-[14px] font-medium text-[#2458D3] hover:underline">{ot('structure.t53')}</button> : null}
                  </div>
                ) : <p className="mt-2 text-[14px] text-[#586174]">{ot('structure.t54')}</p>}
              </section>

              {parentNode ? (
                <section className="border-b border-[#E2E5EA] px-5 py-4">
                  <h3 className="text-[14px] font-semibold leading-5 text-[#17202E]">{ot('structure.t55')}</h3>
                  <button type="button" onClick={() => selectNode(parentNode.id)} className={`-mx-2 mt-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-[8px] p-2 text-left transition-colors duration-[120ms] hover:bg-[#F6F7F9] ${AXIS_UI.focus}`}>
                    {parentManagerName ? (
                      <>
                        <Avatar member={parentManager} name={parentManagerName} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium leading-5 text-[#17202E]">{parentManagerName}</span>
                          <span className="mt-0.5 block truncate text-[12px] leading-4 text-[#586174]">{parentManager?.position || (parentNode.isOrganization ? ot('structure.t32') : ot('structure.headOf', { name: parentNode.name }))}</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${unitTypePresentation(parentNode.unitType, parentNode.isOrganization).tone}`}><MaterialSymbol name={unitTypePresentation(parentNode.unitType, parentNode.isOrganization).icon} size={18} color="currentColor" /></span>
                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#17202E]">{parentNode.name}</span>
                      </>
                    )}
                    <MaterialSymbol name="chevron_right" size={18} color="#586174" />
                  </button>
                </section>
              ) : null}

              <section className="px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-semibold leading-5 text-[#17202E]">{ot('structure.t02')}</h3>
                    <span className={AXIS_UI.countBadge}>{selectedMembers.length}</span>
                  </div>
                  {selectedMembers.length > 3 ? <button type="button" onClick={() => setDetailTab('employees')} className="text-[14px] font-medium text-[#2458D3] hover:underline">{ot('structure.t56')}</button> : null}
                </div>
                <div className="mt-2">
                  {selectedMembers.slice(0, 3).map(memberRow)}
                  {selectedMembers.length === 0 ? <p className="mt-1 rounded-[8px] bg-[#F6F7F9] p-4 text-center text-[14px] text-[#586174]">{ot('structure.t57')}</p> : null}
                </div>
                {canManageStructure ? (
                  <div className="mt-3">
                    {selectedUnit ? (
                  <button type="button" onClick={openAddMember} className={`${AXIS_UI.secondaryButton} w-full !h-10 !border-[#2458D3] !text-[#2458D3] hover:!bg-[#EDF2FF]`}>
                    <MaterialSymbol name="person_add" size={16} color="currentColor" />
                    {ot('structure.t58')}
                  </button>
                ) : onAddEmployee ? (
                  <button type="button" onClick={onAddEmployee} className={`${AXIS_UI.secondaryButton} w-full !h-10 !border-[#2458D3] !text-[#2458D3] hover:!bg-[#EDF2FF]`}>
                    <MaterialSymbol name="person_add" size={16} color="currentColor" />
                    {ot('structure.t58')}
                  </button>
                ) : (
                  <button type="button" onClick={() => setEmployeesOpen(true)} className={`${AXIS_UI.secondaryButton} w-full !h-10 !border-[#2458D3] !text-[#2458D3] hover:!bg-[#EDF2FF]`}>
                    <MaterialSymbol name="person_add" size={16} color="currentColor" />
                    {ot('structure.t59')}
                  </button>
                )}
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {detailTab === 'employees' ? (
            <div className="custom-scrollbar max-h-[480px] overflow-y-auto overflow-x-hidden px-5 py-2">
              {selectedMembers.map(memberRow)}
              {selectedMembers.length === 0 ? <div className="py-10 text-center text-[14px] text-[#586174]">{ot('structure.t60')}</div> : null}
            </div>
          ) : null}

          {detailTab === 'children' ? (
            <div className="custom-scrollbar max-h-[480px] overflow-y-auto overflow-x-hidden px-3 py-2">
              {selectedChildren.map((unit) => {
                const childPresentation = unitTypePresentation(unit.unit_type)
                const count = descendantMemberCount.get(unit.id) ?? 0
                return (
                  <button key={unit.id} type="button" onClick={() => selectNode(unit.id)} className={`flex w-full items-center gap-3 rounded-[8px] p-2 text-left transition-colors duration-[120ms] hover:bg-[#F6F7F9] ${AXIS_UI.focus}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${childPresentation.tone}`}><MaterialSymbol name={childPresentation.icon} size={18} color="currentColor" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium leading-5 text-[#17202E]">{unit.name}</span>
                      <span className="text-[12px] leading-4 tabular-nums text-[#586174]">{ot('structure.members', { count })}</span>
                    </span>
                    <MaterialSymbol name="chevron_right" size={18} color="#586174" />
                  </button>
                )
              })}
              {selectedChildren.length === 0 ? <div className="py-10 text-center text-[14px] text-[#586174]">{ot('structure.t61')}</div> : null}
            </div>
          ) : null}

          {/* Действия внизу панели зависят от вкладки */}
          {!canManageStructure ? (
            <div className="border-t border-[#E2E5EA] p-5">
              <p className="flex items-start gap-2 text-[12px] leading-4 text-[#586174]">
                <MaterialSymbol name="info" size={16} color="currentColor" />
                {ot('structure.t62')}
              </p>
            </div>
          ) : detailTab === 'info' && selectedUnit ? (
            <div className="flex flex-wrap gap-2 border-t border-[#E2E5EA] p-5">
              <button type="button" onClick={() => { setMovingUnit(selectedUnit); setMoveParentId(selectedUnit.parent_unit_id ?? '') }} className={`${AXIS_UI.secondaryButton} !h-10`}>
                <MaterialSymbol name="sync_alt" size={16} color="currentColor" />
                {ot('structure.t14')}
              </button>
              <button type="button" onClick={() => archiveUnit(selectedUnit)} className={`${AXIS_UI.secondaryButton} ml-auto !h-10 !text-[#C03437] hover:!border-[#C03437] hover:!bg-[#FFF0F0]`}>
                <MaterialSymbol name="delete" size={16} color="currentColor" />
                {ot('structure.t15')}
              </button>
            </div>
          ) : detailTab === 'employees' ? (
            <div className="border-t border-[#E2E5EA] p-5">
              {selectedUnit ? (
                  <button type="button" onClick={openAddMember} className={`${AXIS_UI.secondaryButton} w-full !h-10 !border-[#2458D3] !text-[#2458D3] hover:!bg-[#EDF2FF]`}>
                    <MaterialSymbol name="person_add" size={16} color="currentColor" />
                    {ot('structure.t58')}
                  </button>
                ) : onAddEmployee ? (
                  <button type="button" onClick={onAddEmployee} className={`${AXIS_UI.secondaryButton} w-full !h-10 !border-[#2458D3] !text-[#2458D3] hover:!bg-[#EDF2FF]`}>
                    <MaterialSymbol name="person_add" size={16} color="currentColor" />
                    {ot('structure.t58')}
                  </button>
                ) : (
                  <button type="button" onClick={() => setEmployeesOpen(true)} className={`${AXIS_UI.secondaryButton} w-full !h-10 !border-[#2458D3] !text-[#2458D3] hover:!bg-[#EDF2FF]`}>
                    <MaterialSymbol name="person_add" size={16} color="currentColor" />
                    {ot('structure.t59')}
                  </button>
                )}
            </div>
          ) : detailTab === 'children' ? (
            <div className="border-t border-[#E2E5EA] p-5">
              <button type="button" onClick={() => openCreate(selectedNode.isOrganization ? undefined : selectedNode.id)} className={`${AXIS_UI.secondaryButton} w-full !h-10`}>
                <MaterialSymbol name="add" size={16} color="currentColor" />
                {selectedNode.isOrganization ? ot('structure.t63') : ot('structure.t64')}
              </button>
            </div>
          ) : null}
        </aside>
      </div>

      {formMode ? (
        <AppModal
          title={formMode === 'edit' ? selectedUnit?.name ?? ot('structure.t65') : ot('structure.t63')}
          onClose={() => setFormMode(null)}
          maxWidth={600}
          animated
          closeOnBackdrop
          footer={<>
            <button type="button" onClick={() => setFormMode(null)} className="ts-button ts-button--secondary">{ot('structure.t71')}</button>
            <button type="button" onClick={() => void saveForm()} disabled={!form.name.trim() || saving} className="ts-button ts-button--primary">{saving ? ot('structure.t72') : ot('structure.t73')}</button>
          </>}
        >
          <p className="mb-4 text-[13px] leading-5 text-[#586174]">{formMode === 'edit' ? ot('structure.t65') : ot('structure.t66')}</p>
          {actionError ? <p role="alert" className="mb-4 text-sm text-red-700">{actionError}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={FIELD_LABEL}>{ot('structure.t67')}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={FIELD_CONTROL} /></label>
              <label className={FIELD_LABEL}>{ot('structure.t68')}<input list="structure-unit-types" value={form.unit_type} onChange={(event) => setForm({ ...form, unit_type: event.target.value })} className={FIELD_CONTROL} /><datalist id="structure-unit-types"><option value="department" /><option value="team" /><option value="branch" /><option value="project" />{unitTypes.map((type) => <option key={type} value={type} />)}</datalist></label>
              <label className={FIELD_LABEL}>{ot('structure.t69')}<select value={form.parent_unit_id} onChange={(event) => setForm({ ...form, parent_unit_id: event.target.value })} className={FIELD_CONTROL}><option value="">{ot('structure.t00')}</option>{units.filter((unit) => unit.id !== selectedUnit?.id).map((unit) => <option key={unit.id} value={unit.id}>{buildUnitPath(unit, unitsById)}</option>)}</select></label>
              <label className={FIELD_LABEL}>{ot('structure.t37')}<select value={form.manager_id} onChange={(event) => setForm({ ...form, manager_id: event.target.value })} className={FIELD_CONTROL}><option value="">{ot('structure.t54')}</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}</select></label>
              <label className={`${FIELD_LABEL} sm:col-span-2`}>{ot('structure.t70')}<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${FIELD_CONTROL} !h-auto min-h-24 py-2.5`} /></label>
          </div>
        </AppModal>
      ) : null}

      {movingUnit ? (
        <AppModal
          title={movingUnit.name}
          onClose={() => setMovingUnit(null)}
          maxWidth={480}
          animated
          closeOnBackdrop
          footer={<>
            <button type="button" onClick={() => setMovingUnit(null)} className="ts-button ts-button--secondary">{ot('structure.t71')}</button>
            <button type="button" onClick={() => void moveUnit()} disabled={saving} className="ts-button ts-button--primary">{saving ? ot('structure.t76') : ot('structure.t14')}</button>
          </>}
        >
          <p className="mb-4 text-[13px] leading-5 text-[#586174]">{ot('structure.t74')}</p>
          <label className={`${FIELD_LABEL} block`}>{ot('structure.t75')}<select value={moveParentId} onChange={(event) => setMoveParentId(event.target.value)} className={FIELD_CONTROL}><option value="">{ot('structure.t00')}</option>{units.filter((unit) => !descendantIds.has(unit.id)).map((unit) => <option key={unit.id} value={unit.id}>{buildUnitPath(unit, unitsById)}</option>)}</select></label>
        </AppModal>
      ) : null}

      {addMemberOpen && selectedUnit ? (
        <AppModal title={selectedUnit.name} onClose={() => { if (addingMemberId === null) setAddMemberOpen(false) }} maxWidth={560} animated closeOnBackdrop>
          <p className="mb-4 text-[13px] leading-5 text-[#586174]">{ot('structure.t58')}</p>
          <label className={AXIS_UI.inputShell}>
            <MaterialSymbol name="search" size={16} color="#586174" />
            <input data-ui="bare" value={addMemberQuery} onChange={(event) => setAddMemberQuery(event.target.value)} placeholder={ot('structure.t77')} aria-label={ot('structure.t78')} className={AXIS_UI.input} autoFocus />
          </label>
          {addMemberError ? <div className="mt-3 rounded-[8px] bg-[#FFF0F0] px-3 py-2.5 text-[13px] text-[#C03437]">{addMemberError}</div> : null}
            <div className="custom-scrollbar mt-3 min-h-0 flex-1 divide-y divide-[#EEF0F3] overflow-x-hidden">
              {addMemberCandidates.map((member) => {
                const name = member.full_name || member.email
                const currentUnit = member.unit_id ? unitsById.get(member.unit_id) : undefined
                return (
                  <div key={member.id} className="flex items-center gap-3 py-2.5">
                    <Avatar member={member} name={name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium leading-5 text-[#17202E]">{name}</div>
                      <div className="truncate text-[12px] leading-4 text-[#586174]">
                        {member.position || member.email} · {currentUnit ? buildUnitPath(currentUnit, unitsById) : ot('structure.t79')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void addMemberToSelectedUnit(member)}
                      disabled={addingMemberId !== null}
                      className={`${AXIS_UI.secondaryButton} disabled:opacity-50`}
                    >
                      {addingMemberId === member.id ? ot('structure.t80') : ot('structure.t81')}
                    </button>
                  </div>
                )
              })}
              {addMemberCandidates.length === 0 ? (
                <p className="py-8 text-center text-[14px] text-[#586174]">
                  {addMemberQuery.trim() ? ot('structure.t82') : ot('structure.t83')}
                </p>
              ) : null}
            </div>
            <p className="mt-3 flex items-start gap-2 border-t border-[#E2E5EA] pt-3 text-[12px] leading-4 text-[#586174]">
              <MaterialSymbol name="info" size={16} color="currentColor" />
              {ot('structure.t84')}
            </p>
        </AppModal>
      ) : null}

      {employeesOpen ? (
        <AppModal title={selectedNode.name} onClose={() => setEmployeesOpen(false)} maxWidth={672} animated closeOnBackdrop>
          <p className="mb-4 text-[13px] leading-5 text-[#586174]">{ot('structure.t85')}</p>
          <div className="divide-y divide-[#EEF0F3]">
              {members.map((member) => {
                const name = member.full_name || member.email
                return (
                  <div key={member.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                    <Avatar member={member} name={name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium leading-5 text-[#17202E]">{name}</div>
                      <div className="truncate text-[12px] leading-4 text-[#586174]">{member.position || member.email}</div>
                    </div>
                    {canManageStructure ? (
                      <select value={member.unit_id ?? ''} onChange={(event) => void onAssignMember(member, event.target.value)} aria-label={ot('structure.memberUnit', { name })} className="ts-input sm:max-w-[260px]">
                        <option value="">{ot('structure.t79')}</option>
                        {units.map((unit) => <option key={unit.id} value={unit.id}>{buildUnitPath(unit, unitsById)}</option>)}
                      </select>
                    ) : (
                      <span className="text-[12px] text-[#586174]">{member.unit_id && unitsById.get(member.unit_id) ? buildUnitPath(unitsById.get(member.unit_id)!, unitsById) : ot('structure.t79')}</span>
                    )}
                  </div>
                )
              })}
            </div>
        </AppModal>
      ) : null}

      {movingMember ? (
        <AppModal
          title={ot('structure.t87')}
          onClose={() => { if (!memberMoveSaving) { setMovingMember(null); setMemberMoveError(null) } }}
          maxWidth={480}
          animated
          closeOnBackdrop
          footer={<>
            <button type="button" disabled={memberMoveSaving} onClick={() => { setMovingMember(null); setMemberMoveError(null) }} className="ts-button ts-button--secondary">{ot('structure.t71')}</button>
            <button type="button" onClick={() => void moveMember()} disabled={memberMoveSaving || memberDestinationId === (movingMember.unit_id ?? '')} className="ts-button ts-button--primary"><MaterialSymbol name="sync_alt" size={16} color="currentColor" />{memberMoveSaving ? ot('structure.t76') : ot('structure.t14')}</button>
          </>}
        >
          <p className="mb-4 text-[13px] leading-5 text-[#586174]">{ot('structure.t86')}</p>
          <div className="flex items-center gap-3 rounded-[12px] border border-[#E6EAF1] bg-[#FAFBFC] p-4">
              <Avatar member={movingMember} name={movingMember.full_name || movingMember.email} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium leading-5 text-[#17202E]">{movingMember.full_name || movingMember.email}</div>
                <div className="mt-0.5 truncate text-[12px] leading-4 text-[#586174]">{movingMember.position || movingMember.email}</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[12px] leading-4 text-[#586174]">{ot('structure.t88')}</div>
              <div className="mt-1 text-[14px] leading-5 text-[#17202E]">{movingMember.unit_id && unitsById.get(movingMember.unit_id) ? buildUnitPath(unitsById.get(movingMember.unit_id)!, unitsById) : ot('structure.t79')}</div>
            </div>
            <label className={`${FIELD_LABEL} mt-4 block`}>{ot('structure.t66')}<select value={memberDestinationId} onChange={(event) => { setMemberDestinationId(event.target.value); setMemberMoveError(null) }} disabled={memberMoveSaving} className={FIELD_CONTROL}><option value="">{ot('structure.t79')}</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{buildUnitPath(unit, unitsById)}</option>)}</select></label>
            {memberMoveError ? <div className="mt-3 rounded-[8px] bg-[#FFF0F0] px-3 py-2.5 text-[13px] text-[#C03437]">{memberMoveError}</div> : null}
        </AppModal>
      ) : null}

      <AppConfirmDialog
        open={Boolean(deletingUnit)}
        title={ot('structure.deleteTitle')}
        message={deletingUnit ? ot('structure.deleteConfirm', { name: deletingUnit.name }) : ''}
        confirmText={i18n.t('common:actions.delete')}
        isLoading={archivingUnit}
        onConfirm={() => void confirmArchiveUnit()}
        onCancel={() => setDeletingUnit(null)}
      />
      {growyRolesOpen && canManageStructure && onSaveGrowyPositionRoles ? (
        <GrowyPositionRolesDialog key={organization.id} organizationName={organization.name} mappings={growyPositionRoles} onSave={onSaveGrowyPositionRoles} onClose={() => setGrowyRolesOpen(false)} />
      ) : null}
    </main>
  )
}
