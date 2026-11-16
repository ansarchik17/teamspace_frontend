import type { OrganizationUnit } from '../../../infrastructure/repositories/HttpOrganizationRepository'

export type EmployeeUnitChoices = {
  scope: string
  items: OrganizationUnit[]
  failed?: boolean
}

export type EmployeeSubdivisionIssue = 'loading' | 'loadFailed' | 'unavailable'

/** Unassigned employees are allowed; a selected subdivision must be current. */
export function employeeSubdivisionIssue(
  scope: string,
  choices: EmployeeUnitChoices | null,
  selectedId: string,
): EmployeeSubdivisionIssue | null {
  if (!scope || !selectedId) return null
  if (choices?.scope !== scope) return 'loading'
  if (choices.failed) return 'loadFailed'
  return choices.items.some(unit => unit.id === selectedId) ? null : 'unavailable'
}
