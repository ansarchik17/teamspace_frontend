import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository'
import {
  HttpOrganizationRepository,
  type CreateOrganizationUnitInput,
  type GrowyPositionRoleMapping,
  type Organization,
  type OrganizationMember,
  type OrganizationTreeNode,
  type OrganizationUnit,
  type UpdateOrganizationUnitInput,
} from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import OrganizationStructureWorkspace from './OrganizationStructureWorkspace'
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { useTranslation } from 'react-i18next'
import { ot } from './orgText'

export default function OrganizationStructurePage() {
  useTranslation('administration')
  const navigate = useNavigate()
  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const authRepository = useMemo(() => new HttpAuthRepository(sessionStore), [sessionStore])
  const repository = useMemo(() => new HttpOrganizationRepository(sessionStore), [sessionStore])
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [organizationReady, setOrganizationReady] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [units, setUnits] = useState<OrganizationUnit[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [growyPositionRoles, setGrowyPositionRoles] = useState<GrowyPositionRoleMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const currentUser = await authRepository.me().catch(() => null)
      const platformAdmin = currentUser?.role === 'admin'
      setIsPlatformAdmin(platformAdmin)
      if (platformAdmin) {
        navigate('/platform/structure', { replace: true })
        return
      }

      let currentOrganization: Organization | null = null
      try {
        currentOrganization = await repository.getCurrent()
      } catch (organizationError) {
        if (!(organizationError instanceof HttpError) || organizationError.status !== 404) {
          throw organizationError
        }
      }
      if (!currentOrganization) {
        setOrganization(null)
        setOrganizationReady(false)
        setUnits([])
        setMembers([])
        setGrowyPositionRoles([])
        return
      }

      const tree = await repository.getTree().catch(() => null)
      if (tree) currentOrganization = { ...currentOrganization, can_manage_structure: tree.can_manage_structure }
      const flattenTree = () => {
        const result: OrganizationUnit[] = []
        const visit = (nodes: OrganizationTreeNode[], parentId: string | null) => {
          nodes.forEach((node) => {
            result.push({
              id: node.id,
              organization_id: tree?.organization_id || currentOrganization?.id || '',
              parent_unit_id: node.parent_unit_id ?? parentId,
              name: node.name,
              unit_type: node.unit_type,
              description: node.description ?? null,
              manager_id: node.manager?.id ?? null,
              display_order: node.display_order ?? 0,
            })
            visit(Array.isArray(node.children) ? node.children : [], node.id)
          })
        }
        visit(tree?.items ?? [], null)
        return result
      }
      const [nextUnits, nextMembers, nextGrowyRoles] = await Promise.all([
        tree ? Promise.resolve(flattenTree()) : repository.listUnits(),
        repository.listMembers().catch((membersError) => repository.listContactsAsMembers().catch(() => { throw membersError })),
        currentOrganization.can_manage_structure ? repository.listGrowyPositionRoles().catch(() => []) : Promise.resolve([]),
      ])
      setOrganization(currentOrganization)
      setUnits(nextUnits)
      setMembers(nextMembers)
      setGrowyPositionRoles(nextGrowyRoles)
      setOrganizationReady(true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : ot('structurePage.t00'))
    } finally {
      setLoading(false)
    }
  }, [authRepository, navigate, repository])

  useEffect(() => {
    void reload()
  }, [reload])

  if (!loading && !organizationReady) {
    if (isPlatformAdmin) return null
    return (
      <main className="min-h-full bg-[#F6F7F9] px-4 py-6 [font-family:Inter,sans-serif] md:px-6 xl:px-8">
        <PeopleSectionHeader active="structure" title={ot('structurePage.t01')} structureHref="/organization" description={ot('structurePage.t02')} />
        <div className="mx-auto mt-10 max-w-xl rounded-[12px] border border-[#E2E5EA] bg-white p-8 text-center">
          <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${error ? 'bg-[#FFF0F0] text-[#C03437]' : 'bg-[#EDF2FF] text-[#2458D3]'}`}>
            <MaterialSymbol name={error ? 'error_outline' : 'business'} size={22} color="currentColor" />
          </span>
          <h2 className="mt-4 text-[18px] font-semibold leading-[26px] text-[#17202E]">
            {error ? ot('structurePage.t03') : ot('structurePage.t04')}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-5 text-[#586174]">
            {error
              ? error
              : ot('structurePage.t05')}
          </p>
          {error ? (
            <button type="button" onClick={() => void reload()} className={`${AXIS_UI.primaryButton} mt-6`}>
              <MaterialSymbol name="refresh" size={18} color="currentColor" />{ot('structurePage.retry')}
            </button>
          ) : null}
        </div>
      </main>
    )
  }

  return (
    <OrganizationStructureWorkspace
      organization={{
        id: organization?.id ?? '',
        name: organization?.name ?? ot('structurePage.t06'),
        ownerId: organization?.owner_id,
        ownerName: organization?.owner_name,
      }}
      canManageStructure={organization?.can_manage_structure === true}
      units={units}
      members={members}
      loading={loading}
      error={error}
      onReload={reload}
      onCreateUnit={async (input: CreateOrganizationUnitInput) => {
        await repository.createUnit(input)
        await reload()
      }}
      onUpdateUnit={async (unit: OrganizationUnit, input: UpdateOrganizationUnitInput) => {
        await repository.updateUnit(unit.id, input)
        await reload()
      }}
      onReorderUnits={async (operations) => {
        try {
          await Promise.all(operations.map(({ unit, input }) => repository.updateUnit(unit.id, input)))
        } finally {
          await reload()
        }
      }}
      onArchiveUnit={async (unit: OrganizationUnit) => {
        await repository.archiveUnit(unit.id)
        await reload()
      }}
      onAssignMember={async (member: OrganizationMember, unitId: string) => {
        await repository.assignUser(member.id, { unit_id: unitId || null, manager_id: member.manager_id ?? null })
        await reload()
      }}
      growyPositionRoles={growyPositionRoles}
      onSaveGrowyPositionRoles={async (mappings) => {
        const updated = await repository.saveGrowyPositionRoles(mappings)
        setGrowyPositionRoles(updated)
        return updated
      }}
    />
  )
}
