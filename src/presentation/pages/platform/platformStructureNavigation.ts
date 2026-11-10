/** Вкладка «Структура» раздела «Люди» для системного администратора */
export const PLATFORM_STRUCTURE_HREF = '/platform/structure'
export const PLATFORM_ORGANIZATIONS_HREF = '/platform/organizations'
export const PLATFORM_CREATE_ORGANIZATION_HREF = `${PLATFORM_ORGANIZATIONS_HREF}?create=1`

const LAST_ORGANIZATION_KEY = 'superapp.platform_structure_organization_id'

export function readLastPlatformOrganizationId(): string {
  try {
    return window.localStorage.getItem(LAST_ORGANIZATION_KEY) ?? ''
  } catch {
    return ''
  }
}

export function rememberPlatformOrganizationId(organizationId: string): void {
  try {
    window.localStorage.setItem(LAST_ORGANIZATION_KEY, organizationId)
  } catch {
    // Хранилище браузера необязательно: без него просто откроется первая компания.
  }
}
