export { suggestedEmployeeLogin } from '../../../deploy/mail/source/shared/companyMailNaming'

export function companyMailDomain(slug: string) {
  const base = (import.meta.env.VITE_WORKSPACE_MAIL_DOMAIN_BASE || 'teamspace.kz').trim().toLowerCase()
  return slug && base ? `${slug}.${base}` : ''
}
