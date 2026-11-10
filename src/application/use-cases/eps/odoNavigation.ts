const sectionTargets = {
  approvals: '/odo/approvals',
  signings: '/odo/signings',
  'create-assignment': '/odo/assignments/create',
} as const

export type ODOSection = keyof typeof sectionTargets

export const odoSectionLaunchRoute = (section: ODOSection): string =>
  `/eps?section=${section}`

// Only known EDO pages may receive the one-time handoff code. Never accept an
// arbitrary redirect URL or a host from the launch query string.
export function odoHandoffTarget(search: string): string {
  const params = new URLSearchParams(search)
  const documentId = params.get('document')
  if (documentId) return `/odo/documents/${encodeURIComponent(documentId)}`

  const section = params.get('section')
  return section && Object.prototype.hasOwnProperty.call(sectionTargets, section)
    ? sectionTargets[section as ODOSection]
    : '/odo/'
}
