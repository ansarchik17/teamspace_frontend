import type { AlemContact } from '../../../domain/entities/AlemContact'
import type { AuthSessionStore } from '../../../domain/services/AuthSessionStore'
import { HttpOrganizationRepository, type OrganizationMember, type OrganizationUnit } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'

type DirectoryOrganization = {
  id: string
  name: string
  ownerId?: number | null
  units: OrganizationUnit[]
  members: OrganizationMember[]
}

type OrganizationDirectory = {
  contacts: AlemContact[]
  organizations: string[]
}

function unitPath(unitId: string | null | undefined, unitsById: Map<string, OrganizationUnit>, trail = new Set<string>()): string | null {
  if (!unitId || trail.has(unitId)) return null
  const unit = unitsById.get(unitId)
  if (!unit) return null

  const nextTrail = new Set(trail)
  nextTrail.add(unitId)
  const parentPath = unitPath(unit.parent_unit_id, unitsById, nextTrail)
  return parentPath ? `${parentPath} / ${unit.name}` : unit.name
}

function memberToContact(
  member: OrganizationMember,
  organization: DirectoryOrganization,
  unitsById: Map<string, OrganizationUnit>,
  memberIds: Set<number>,
): AlemContact {
  const unit = member.unit_id ? unitsById.get(member.unit_id) : undefined
  const validManager = (id: number | null | undefined) => id != null && id !== member.id && memberIds.has(id)
  let directManagerId: number | null = null
  const visited = new Set<string>()
  let currentUnit = unit
  while (currentUnit && !visited.has(currentUnit.id)) {
    visited.add(currentUnit.id)
    if (validManager(currentUnit.manager_id)) {
      directManagerId = currentUnit.manager_id!
      break
    }
    currentUnit = currentUnit.parent_unit_id ? unitsById.get(currentUnit.parent_unit_id) : undefined
  }
  if (member.id === organization.ownerId) directManagerId = null
  else {
    if (directManagerId == null && validManager(organization.ownerId)) directManagerId = organization.ownerId!
    if (directManagerId == null && validManager(member.manager_id)) directManagerId = member.manager_id!
  }
  const fullName = member.full_name.trim() || member.email
  return {
    id: member.id,
    keycloak_id: '',
    iin: null,
    email: member.email,
    username: member.username || member.email,
    full_name: fullName,
    first_name: null,
    last_name: null,
    middle_name: null,
    position: member.position ?? null,
    avatar_url: normalizeBackendAssetUrl(member.avatar_url) ?? member.avatar_url ?? null,
    is_active: member.is_active !== false,
    role: 'user',
    organization_id: organization.id,
    team_id: member.unit_id ?? null,
    manager_id: directManagerId,
    availability_status: member.availability_status ?? null,
    ministry_id: null,
    state_body_id: null,
    department_id: null,
    division_id: null,
    organization: organization.name,
    department_unit: unitPath(member.unit_id, unitsById),
    job_uid: null,
    sub_uid: member.unit_id ?? null,
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
  }
}

async function loadOrganizationsForAdmin(repository: HttpOrganizationRepository): Promise<DirectoryOrganization[]> {
  const organizations: DirectoryOrganization[] = []
  let offset = 0
  let total = Number.POSITIVE_INFINITY

  while (offset < total) {
    const page = await repository.listPlatformOrganizations({ limit: 100, offset })
    total = page.total
    const pageData = await Promise.all(page.items
      .filter((organization) => organization.status === 'active')
      .map(async (organization) => {
        const [units, members] = await Promise.all([
          repository.listPlatformUnits(organization.id),
          repository.listPlatformMembers(organization.id),
        ])
        return { id: organization.id, name: organization.name, ownerId: organization.owner_id, units, members }
      }))
    organizations.push(...pageData)
    if (page.items.length === 0) break
    offset += page.items.length
  }

  return organizations
}

/** Organization membership supplies all directory fields; no legacy HR lookup is needed. */
export async function loadOrganizationDirectory(sessionStore: AuthSessionStore, userRole?: string): Promise<OrganizationDirectory> {
  const repository = new HttpOrganizationRepository(sessionStore)
  let organizations: DirectoryOrganization[]

  if (userRole?.toLowerCase() === 'admin') {
    organizations = await loadOrganizationsForAdmin(repository)
  } else {
    const organization = await repository.getCurrent()
    const [units, members] = await Promise.all([repository.listUnits(), repository.listMembers()])
    organizations = [{ id: organization.id, name: organization.name, ownerId: organization.owner_id, units, members }]
  }

  const contacts = organizations
    .flatMap((organization) => {
      const unitsById = new Map(organization.units.map((unit) => [unit.id, unit]))
      const memberIds = new Set(organization.members.filter((member) => member.is_active !== false).map((member) => member.id))
      return organization.members.map((member) => memberToContact(member, organization, unitsById, memberIds))
    })
    .sort((a, b) => {
      const organizationOrder = (a.organization ?? '').localeCompare(b.organization ?? '', 'ru')
      if (organizationOrder !== 0) return organizationOrder
      const departmentOrder = (a.department_unit ?? '').localeCompare(b.department_unit ?? '', 'ru')
      return departmentOrder || a.full_name.localeCompare(b.full_name, 'ru')
    })

  return {
    contacts,
    organizations: [...new Set(organizations.map((organization) => organization.name))].sort((a, b) => a.localeCompare(b, 'ru')),
  }
}

/** Deep links resolve membership only within the current company, including for platform admins. */
export async function loadCurrentOrganizationContact(sessionStore: AuthSessionStore, id: number): Promise<AlemContact | undefined> {
  const { contacts } = await loadOrganizationDirectory(sessionStore)
  return contacts.find((contact) => contact.id === id)
}
