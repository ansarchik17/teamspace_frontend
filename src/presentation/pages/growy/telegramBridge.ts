// Restrict the shared inbox bridge to tenant Telegram JSON/binary API routes.
export function telegramBridgePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.includes('#')) return null
  const pathname = value.split('?')[0]
  if (!/^telegram\/accounts\/(?:[1-9][0-9]*\/(?:status\/|ws-ticket\/|auth\/(?:phone|resend|code|password|qr|qr\/poll)\/|disconnect\/|stories\/(?:[1-9][0-9]*\/[1-9][0-9]*\/)?|dialogs\/(?:[1-9][0-9]*\/(?:messages\/(?:[1-9][0-9]*\/(?:attachment|edit|delete|pin|reaction|forward)\/)?|details\/|participants\/|members\/|topics\/|pinned\/|avatar\/|attachments\/|read\/|typing\/|sponsored\/))?)?)?$/.test(pathname)) return null
  return value
}
