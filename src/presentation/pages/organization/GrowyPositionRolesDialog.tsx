import { useState } from 'react'
import type { GrowyPositionRoleMapping, GrowyRoleCode } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppModal from '../../../shared/ui/AppModal'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { ot } from './orgText'

const ROLES: Array<{ code: GrowyRoleCode; label: string; description: string }> = [
  { code: 'employee', get label() { return ot('growyRoles.t00') }, get description() { return ot('growyRoles.t01') } },
  { code: 'tenant_admin', get label() { return ot('growyRoles.t02') }, get description() { return ot('growyRoles.t03') } },
  { code: 'manager', get label() { return ot('growyRoles.t04') }, get description() { return ot('growyRoles.t05') } },
  { code: 'issuer', get label() { return ot('growyRoles.t06') }, get description() { return ot('growyRoles.t07') } },
]

type Props = {
  organizationName: string
  mappings: GrowyPositionRoleMapping[]
  onSave: (mappings: GrowyPositionRoleMapping[]) => Promise<GrowyPositionRoleMapping[]>
  onClose: () => void
}

export default function GrowyPositionRolesDialog({ organizationName, mappings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(() => mappings.map((item) => ({ ...item, growy_roles: [...(item.growy_roles ?? [item.growy_role])] })))
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleRole = (position: string, code: GrowyRoleCode) => {
    setError(null)
    setDraft((items) => items.map((item) => {
      if (item.position !== position) return item
      const roles = item.growy_roles.includes(code) ? item.growy_roles.filter((role) => role !== code) : [...item.growy_roles, code]
      return { ...item, growy_roles: roles, growy_role: roles[0] ?? item.growy_role }
    }))
  }

  const save = async () => {
    if (draft.some((item) => item.growy_roles.length === 0)) {
      setError(ot('growyRoles.t08'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : ot('growyRoles.t09'))
    } finally {
      setSaving(false)
    }
  }

  const filtered = draft.filter((item) => item.position.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return (
    <AppModal
      title={ot('growyRoles.t10')}
      onClose={() => { if (!saving) onClose() }}
      maxWidth={960}
      animated
      footer={<>
        <button type="button" disabled={saving} onClick={onClose} className="ts-button ts-button--secondary">{ot('growyRoles.t16')}</button>
        <button type="button" disabled={saving || draft.length === 0} onClick={() => void save()} className="ts-button ts-button--primary">{saving ? ot('growyRoles.t17') : ot('growyRoles.t18')}</button>
      </>}
    >
      <p className="text-[14px] font-medium text-[#17202E]">{organizationName}</p>
      <p className="mt-1 text-[14px] leading-5 text-[#586174]">{ot('growyRoles.t12')}</p>
      <label className={`${AXIS_UI.inputShell} mt-4`}>
        <MaterialSymbol name="search" size={16} color="#586174" />
        <input data-ui="bare" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} aria-label={ot('growyRoles.t13')} placeholder={ot('growyRoles.t13')} className={AXIS_UI.input} />
      </label>
      <div className="mt-4">
        {filtered.map((item) => (
          <fieldset key={item.position} disabled={saving} className="mb-4 rounded-[12px] border border-[#E6EAF1] p-4">
            <legend className="px-1 text-[14px] font-semibold">{item.position} <span className="font-normal text-[#586174]">· {ot('positions.membersCountLower', { count: item.user_count })}</span></legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((role) => (
                <label key={role.code} className="flex cursor-pointer items-start gap-2 text-[14px]">
                  <input type="checkbox" checked={item.growy_roles.includes(role.code)} onChange={() => toggleRole(item.position, role.code)} className="mt-1 accent-[#2458D3]" />
                  <span><span className="block font-medium">{role.label}</span><span className="block text-[12px] text-[#586174]">{role.description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {filtered.length === 0 ? <p className="py-8 text-center text-[14px] text-[#586174]">{draft.length === 0 ? ot('growyRoles.t14') : ot('growyRoles.t15')}</p> : null}
      </div>
      {error ? <p role="alert" className="mt-3 rounded-[8px] bg-[#FFF0F0] px-3 py-2 text-[13px] text-[#C03437]">{error}</p> : null}
    </AppModal>
  )
}
