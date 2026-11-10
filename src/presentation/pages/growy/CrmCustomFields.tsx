import { useEffect, useState } from 'react'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { ErrorNotice, Field } from './growyUi'
import { inputClass } from './growyShared'
import CrmSelect from './CrmSelect'

interface Definition { id: number; key: string; label: string; field_type: string; options: string[]; required: boolean; is_active: boolean }
export default function CrmCustomFields({ repository, entity, values, onChange }: {
  repository: HttpGrowyPlatformRepository; entity: string; values: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void
}) {
  const [fields, setFields] = useState<Definition[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      const definitions: Definition[] = []
      try {
        let page = 1
        while (!controller.signal.aborted) {
          const result = await repository.collection<Definition>(`crm/lead-custom-fields/?entity_type=${entity}`, page, controller.signal)
          definitions.push(...result.results.filter((field) => field.is_active))
          if (!result.hasNext) break
          page += 1
        }
        if (!controller.signal.aborted) setFields(definitions)
      } catch (error) { if (!controller.signal.aborted) setError(growyErrorMessage(error)) }
    }
    void load()
    return () => controller.abort()
  }, [repository, entity])
  const update = (key: string, value: unknown) => onChange({ ...values, [key]: value })
  return <>{error && <ErrorNotice message={error} />}{fields.map((field) => {
    const value = values[field.key]
    let string = value == null ? '' : String(value)
    if (field.field_type === 'datetime' && string) { const date = new Date(string); if (!Number.isNaN(date.getTime())) string = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
    if (field.field_type === 'checkbox') return <label key={field.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value === true} onChange={(event) => update(field.key, event.target.checked)} />{field.label}</label>
    return <Field key={field.key} label={`${field.label}${field.required ? ' *' : ''}`}>{field.field_type === 'textarea' ? <textarea className={inputClass} required={field.required} rows={3} value={string} onChange={(event) => update(field.key, event.target.value)} /> : field.field_type === 'select' ? <CrmSelect required={field.required} value={string} onChange={(next) => update(field.key, next)} options={[{ value: '', label: 'Не выбрано' }, ...field.options.map((option) => ({ value: option, label: option }))]} /> : field.field_type === 'multiselect' ? <CrmSelect required={field.required} multiple value="" values={Array.isArray(value) ? value.map(String) : []} onValuesChange={(next) => update(field.key, next)} onChange={() => undefined} options={field.options.map((option) => ({ value: option, label: option }))} /> : <input className={inputClass} required={field.required} type={({ number: 'number', decimal: 'number', money: 'number', date: 'date', datetime: 'datetime-local', phone: 'tel', email: 'email', url: 'url', reference: 'number' } as Record<string, string>)[field.field_type] || 'text'} step={field.field_type === 'number' || field.field_type === 'reference' ? '1' : 'any'} value={string} onChange={(event) => update(field.key, field.field_type === 'datetime' && event.target.value ? new Date(event.target.value).toISOString() : event.target.value)} />}</Field>
  })}</>
}
