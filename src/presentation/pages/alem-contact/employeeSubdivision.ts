import type { OrganizationUnit } from '../../../infrastructure/repositories/HttpOrganizationRepository'

export type EmployeeUnitChoices = {
  scope: string
  items: OrganizationUnit[]
  failed?: boolean
}

export type EmployeeSubdivisionIssue = 'loading' | 'loadFailed' | 'empty' | 'required'

/** Only a subdivision loaded for the current company/request may be submitted. */
export function employeeSubdivisionIssue(
  scope: string,
  choices: EmployeeUnitChoices | null,
  selectedId: string,
): EmployeeSubdivisionIssue | null {
  if (!scope) return null
  if (choices?.scope !== scope) return 'loading'
  if (choices.failed) return 'loadFailed'
  if (choices.items.length === 0) return 'empty'
  return choices.items.some(unit => unit.id === selectedId) ? null : 'required'
}
