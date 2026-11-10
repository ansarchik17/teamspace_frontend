const EPS_ALLOWED_EMAILS = new Set([
  'tamerlankartaev04@gmail.com',
  'nurzhan.sarsenbayev@nitec.kz',
  'sayan.ashirbekov@nitec.kz',
  'sultan.sultan@gmail.com',
])

export function canAccessEps(email: string | null | undefined): boolean {
  return EPS_ALLOWED_EMAILS.has((email ?? '').trim().toLowerCase())
}
