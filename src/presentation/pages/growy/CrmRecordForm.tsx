import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { CrmRecord, CrmResource, HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import CrmCustomFields from './CrmCustomFields'
import CrmAssigneePicker from './CrmAssigneePicker'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import { ErrorNotice, Field } from './growyUi'
import { inputClass, recordName, statusLabels } from './growyShared'
import CrmSelect from './CrmSelect'

const labels: Record<CrmResource, string> = { leads: 'лид', contacts: 'контакт', deals: 'сделку', tasks: 'задачу', 'lead-stages': 'стадию', 'task-kanban-columns': 'колонку' }
const localDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function RecordPicker({ resource, repository, value, onChange, initial }: {
  resource: 'leads' | 'contacts' | 'deals'; repository: HttpGrowyPlatformRepository
  value: string; onChange: (value: string) => void; initial?: string
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<CrmRecord[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setError('')
      repository.list(resource, { search, signal: controller.signal }).then((page) => { if (!controller.signal.aborted) setOptions(page.results) }).catch((error: unknown) => {
        if (!controller.signal.aborted) setError(growyErrorMessage(error))
      })
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timeout) }
  }, [repository, resource, search])
  return <div className="grid gap-2"><input aria-label="Поиск записи для связи" className={inputClass} placeholder="Найти по имени или названию" value={search} onChange={(e) => setSearch(e.target.value)} />
    <CrmSelect ariaLabel="Связанная запись" value={value} onChange={onChange} searchable={false} options={[{ value: '', label: 'Без связи' }, ...(value && !options.some((item) => String(item.id) === value) ? [{ value, label: initial || `№ ${value}` }] : []), ...options.map((item) => ({ value: String(item.id), label: recordName(item) }))]} />
    {error && <span role="alert" className="text-xs text-red-700">{error}</span>}</div>
}

export default function CrmRecordForm({ resource, repository, record, stages, defaultLeadId, defaultDealId, defaultContactId, defaultStageId, defaultColumnId, onClose, onSaved }: {
  resource: CrmResource; repository: HttpGrowyPlatformRepository; record?: CrmRecord
  stages: CrmRecord[]; defaultLeadId?: number; defaultDealId?: number; defaultContactId?: number; defaultStageId?: number; defaultColumnId?: number; onClose: () => void; onSaved: () => void
}) {
  const formId = useId()
  const [fields, setFields] = useState<Record<string, string>>({
    full_name: record?.full_name ?? '', first_name: record?.first_name ?? '', last_name: record?.last_name ?? '',
    phone: record?.phone ?? '', email: record?.email ?? '', whatsapp: record?.whatsapp ?? '',
    title: record?.title ?? '', name: record?.name ?? '', notes: record?.notes ?? '',
    comment: record?.comment ?? '', description: record?.description ?? '',
    amount: record?.amount ?? '0.00', currency: record?.currency ?? 'KZT', source: record?.source ?? 'workspace',
    status: record?.status ?? (resource === 'deals' ? 'active' : 'new'),
    priority: record?.priority ?? 'medium', task_type: record?.task_type ?? 'custom', due_at: localDate(record?.due_at),
    stage_id: String(record?.stage?.id ?? defaultStageId ?? ''),
    lead_id: String(defaultLeadId ?? record?.source_lead_id ?? record?.lead_id ?? record?.lead?.id ?? ''),
    contact_id: String(record?.contact_id ?? record?.contact?.id ?? defaultContactId ?? ''), deal_id: String(defaultDealId ?? record?.deal_id ?? ''),
    assignee_id: String(record?.assigned_to?.id ?? record?.manager_id ?? ''),
    color: record?.color ?? '#2458D3', order: String(record?.order ?? 0),
  })
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(record?.custom_fields || {})
  const [customChanged, setCustomChanged] = useState(false)
  const [isFinal, setIsFinal] = useState(record?.is_final ?? false)
  const [active, setActive] = useState(record?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const change = (name: string, value: string) => setFields((current) => ({ ...current, [name]: value }))
  const text = (name: string, label: string, required = false, type = 'text') => <Field label={label}><input className={inputClass} type={type} required={required} value={fields[name]} onChange={(e) => change(name, e.target.value)} maxLength={name === 'email' ? 254 : 150} /></Field>
  const select = (name: string, label: string, values: Record<string, string>) => <Field label={label}><CrmSelect value={fields[name]} onChange={(next) => change(name, next)} options={Object.entries(values).map(([key, label]) => ({ value: key, label }))} /></Field>
  const note = (name: string, label: string) => <Field label={label}><textarea className={inputClass} rows={3} value={fields[name]} onChange={(e) => change(name, e.target.value)} /></Field>
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError('')
    let payload: Record<string, unknown> = {}
    if (resource === 'leads') payload = { full_name: fields.full_name.trim(), phone: fields.phone.trim(), email: fields.email.trim(), whatsapp: fields.whatsapp.trim(), source: fields.source.trim(), comment: fields.comment, stage_id: fields.stage_id ? Number(fields.stage_id) : null }
    if (resource === 'contacts') payload = { first_name: fields.first_name.trim(), last_name: fields.last_name.trim(), phone: fields.phone.trim(), email: fields.email.trim(), whatsapp: fields.whatsapp.trim(), notes: fields.notes, contact_type: 'generic' }
    if (resource === 'deals') {
      if (!record && !fields.lead_id && !fields.contact_id) { setError('Выберите лид или контакт для сделки.'); setSaving(false); return }
      payload = { title: fields.title.trim(), amount: fields.amount, currency: fields.currency, status: fields.status, comment: fields.comment }
      if (!record) {
        if (fields.lead_id) payload.lead_id = Number(fields.lead_id)
        else if (fields.contact_id) payload.contact_id = Number(fields.contact_id)
      }
    }
    if (resource === 'tasks') {
      payload = { title: fields.title.trim(), description: fields.description, status: fields.status, priority: fields.priority, task_type: fields.task_type, due_at: fields.due_at ? new Date(fields.due_at).toISOString() : null }
      if (!record) {
        if (fields.lead_id) payload.lead_id = Number(fields.lead_id)
        if (fields.deal_id) payload.deal_id = Number(fields.deal_id)
      }
    }
    if (resource === 'tasks' && !record && defaultColumnId) payload.kanban_column_id = defaultColumnId
    if (resource === 'task-kanban-columns') payload = { name: fields.name.trim(), color: fields.color, order: Number(fields.order), status: fields.status, is_active: active }
    if (resource === 'lead-stages') payload = { name: fields.name.trim(), color: fields.color, order: Number(fields.order), is_active: active, is_final: isFinal }
    if (customChanged || (!record && Object.keys(customFields).length)) payload.custom_fields = customFields
    if (resource === 'leads' || resource === 'tasks' || resource === 'deals') {
      const original = String(record?.assigned_to?.id ?? record?.manager_id ?? '')
      if (fields.assignee_id !== original || (!record && fields.assignee_id)) payload[resource === 'deals' ? 'manager_id' : 'assigned_to_id'] = fields.assignee_id ? Number(fields.assignee_id) : null
    }
    try {
      if (record) await repository.update(resource, record.id, payload)
      else await repository.create(resource, payload)
      onSaved()
    } catch (error) { setError(growyErrorMessage(error)) }
    finally { setSaving(false) }
  }
  return <AppModal title={`${record ? 'Редактировать' : 'Создать'} ${labels[resource]}`} onClose={() => { if (!saving) onClose() }} maxWidth={620} footer={<><AppButton type="button" variant="secondary" disabled={saving} onClick={onClose}>Отмена</AppButton><AppButton type="submit" form={formId} isLoading={saving}>Сохранить</AppButton></>}>
    <form id={formId} onSubmit={save} className="grid gap-4"><fieldset disabled={saving} className="grid gap-4">
      {resource === 'leads' && <>{text('full_name', 'Имя клиента', true)}<div className="grid gap-4 sm:grid-cols-2">{text('phone', 'Телефон', false, 'tel')}{text('email', 'Email', false, 'email')}</div>{text('whatsapp', 'Номер WhatsApp', false, 'tel')}{text('source', 'Источник', true)}<Field label="Стадия"><CrmSelect value={fields.stage_id} onChange={(next) => change('stage_id', next)} options={[{ value: '', label: 'По умолчанию' }, ...(fields.stage_id && !stages.some((stage) => String(stage.id) === fields.stage_id) ? [{ value: fields.stage_id, label: record?.stage?.name || `№ ${fields.stage_id}` }] : []), ...stages.filter((stage) => stage.is_active || String(stage.id) === fields.stage_id).map((stage) => ({ value: String(stage.id), label: stage.name || '' }))]} /></Field>{note('comment', 'Комментарий')}</>}
      {resource === 'contacts' && <><div className="grid gap-4 sm:grid-cols-2">{text('first_name', 'Имя', true)}{text('last_name', 'Фамилия')}</div><div className="grid gap-4 sm:grid-cols-2">{text('phone', 'Телефон', false, 'tel')}{text('email', 'Email', false, 'email')}</div>{text('whatsapp', 'Номер WhatsApp', false, 'tel')}{note('notes', 'Заметки')}</>}
      {resource === 'deals' && <>{text('title', 'Название сделки', true)}{!record && <>{!defaultLeadId && <Field label="Лид"><RecordPicker resource="leads" repository={repository} value={fields.lead_id} onChange={(value) => { change('lead_id', value); change('contact_id', '') }} /></Field>}{!fields.lead_id && <Field label="Контакт"><RecordPicker resource="contacts" repository={repository} value={fields.contact_id} onChange={(value) => change('contact_id', value)} /></Field>}{defaultLeadId && <p className="text-sm text-[#8497B4]">Создание из лида № {defaultLeadId}</p>}</>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Сумма сделки"><input className={inputClass} type="number" min="0" max="999999999999.99" step="0.01" required value={fields.amount} onChange={(e) => change('amount', e.target.value)} /></Field>{text('currency', 'Валюта', true)}</div>{select('status', 'Статус', { active: 'Активная', completed: 'Завершена', cancelled: 'Отменена' })}{note('comment', 'Комментарий')}</>}
      {resource === 'tasks' && <>{text('title', 'Название задачи', true)}{!record && <><Field label="Лид"><RecordPicker resource="leads" repository={repository} value={fields.lead_id} onChange={(value) => { change('lead_id', value); change('deal_id', '') }} /></Field>{!fields.lead_id && <Field label="Сделка"><RecordPicker resource="deals" repository={repository} value={fields.deal_id} onChange={(value) => change('deal_id', value)} /></Field>}</>}{text('due_at', 'Срок выполнения', true, 'datetime-local')}{select('task_type', 'Тип задачи', { custom: 'Задача', call: 'Звонок', message: 'Сообщение', follow_up: 'Повторный контакт' })}{select('priority', 'Приоритет', { low: 'Низкий', medium: 'Средний', high: 'Высокий' })}{select('status', 'Статус', Object.fromEntries(['new', 'in_progress', 'completed', 'cancelled'].map((key) => [key, statusLabels[key]])))}{note('description', 'Описание')}</>}
      {(resource === 'leads' || resource === 'tasks' || resource === 'deals') && <Field label={resource === 'tasks' ? 'Ответственный' : 'Менеджер'}><CrmAssigneePicker repository={repository} entity={resource === 'leads' ? 'lead' : resource === 'tasks' ? 'task' : 'deal'} value={fields.assignee_id} initialName={record?.assigned_to?.full_name || record?.assigned_to?.name || record?.manager?.full_name || record?.manager?.name} onChange={(value) => change('assignee_id', value)} /></Field>}
      {(resource === 'leads' || resource === 'contacts' || resource === 'deals') && <CrmCustomFields repository={repository} entity={resource === 'leads' ? 'lead' : resource === 'contacts' ? 'contact' : 'deal'} values={customFields} onChange={(values) => { setCustomFields(values); setCustomChanged(true) }} />}
      {resource === 'task-kanban-columns' && <>{text('name', 'Название колонки', true)}{text('color', 'Цвет', true, 'color')}{select('status', 'Статус задач в колонке', Object.fromEntries(['new', 'in_progress', 'overdue', 'completed', 'cancelled'].map((key) => [key, statusLabels[key]])))}</>}
      {resource === 'lead-stages' && <>{text('name', 'Название стадии', true)}<div className="grid gap-4 sm:grid-cols-2">{text('color', 'Цвет', true, 'color')}<Field label="Порядок"><input type="number" min="0" required className={inputClass} value={fields.order} onChange={(e) => change('order', e.target.value)} /></Field></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Активная стадия</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />Завершающая стадия</label>{record?.is_system && <p className="text-xs text-[#8497B4]">Это системная стадия. Допустимые изменения проверяются сервером.</p>}</>}
    </fieldset>{error && <ErrorNotice message={error} />}</form>
  </AppModal>
}
