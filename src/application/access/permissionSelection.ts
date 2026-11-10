import type { AccessDependency, AccessPermission } from '../../domain/entities/AccessPermission'

export function missingPermissionDependencies(selected: string[], rules: AccessDependency[]) {
  const actual = new Set(selected)
  return rules.filter(rule => actual.has(rule.permission) && !rule.any_of.some(code => actual.has(code)))
}

// The server owns the rules. Never manufacture a permission absent from this
// company's catalog, and preserve an existing alternative with broader scope.
export function changePermissionSelection(selected: string[], codes: string[], enabled: boolean, catalog: AccessPermission[], rules: AccessDependency[]) {
  const allowed = new Set(catalog.map(permission => permission.code))
  const requested = new Set(codes.filter(code => allowed.has(code)))
  const next = new Set(selected)
  const removed = new Set<string>()
  for (const code of requested) {
    if (enabled) next.add(code)
    else { next.delete(code); removed.add(code) }
  }
  // Each pass adds/removes at least one code; even a cyclic future rule set
  // terminates. Empty alternatives fail closed and remain visible as missing.
  let changed = true
  while (changed) {
    changed = false
    for (const rule of rules) {
      if (!next.has(rule.permission) || rule.any_of.some(code => next.has(code))) continue
      if (enabled) {
        const required = rule.any_of.find(code => allowed.has(code))
        if (required) { next.add(required); changed = true }
      } else if (rule.any_of.some(code => removed.has(code))) {
        next.delete(rule.permission); removed.add(rule.permission); changed = true
      }
    }
  }
  return [...next]
}
