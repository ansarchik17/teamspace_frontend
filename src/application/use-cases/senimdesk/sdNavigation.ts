export function sdHandoffTarget(redirect: string, search: string): string {
  const ticket = new URLSearchParams(search).get('ticket')
  if (!ticket || !/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(ticket)) return redirect
  const target = new URL(redirect)
  const fragment = new URLSearchParams(target.hash.slice(1))
  fragment.set('ticket', ticket)
  target.hash = fragment.toString()
  return target.toString()
}
