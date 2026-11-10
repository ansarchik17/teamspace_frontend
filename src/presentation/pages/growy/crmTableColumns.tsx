import type { TFunction } from 'i18next'
import { BriefcaseBusiness, Layers, SquareCheck } from 'lucide-react'
import type { CrmRecord, CrmResource } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import type { CrmTableColumn } from './CrmRecordTable'
import { Chip, Muted, NameCell, Person } from './crmTableCells'
import { recordName, statusLabels } from './growyShared'

type T = TFunction<'shell'>

const SOURCE_TONES: Record<string, [string, string]> = {
  whatsapp: ['#E6F5EE', '#0F7A55'],
  website: ['#EDF1FE', '#2446D1'],
  instagram: ['#FDEDEA', '#C5301B'],
  facebook: ['#EDF1FE', '#2446D1'],
  meta: ['#EDF1FE', '#2446D1'],
  referral: ['#FFF4E5', '#9A5B00'],
}
const STATUS_TONES: Record<string, [string, string]> = {
  active: ['#EDF2FF', '#2458D3'],
  new: ['#EDF2FF', '#2458D3'],
  in_progress: ['#EDF2FF', '#2458D3'],
  completed: ['#E7F5EE', '#16734B'],
  cancelled: ['#F1F3F6', '#8A93A5'],
  overdue: ['#FDECEC', '#C03437'],
}

const shortDate = (value?: string | null, withTime = false) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  return date.toLocaleString('ru-RU', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
const money = (record: CrmRecord) => `${Number(record.amount || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${!record.currency || record.currency === 'KZT' ? '₸' : record.currency}`

const sourceChip = (source: string | undefined, labels: Record<string, string>) => {
  if (!source) return <Muted />
  const [bg, color] = SOURCE_TONES[source] ?? ['#EFF1F5', '#465066']
  return <Chip label={labels[source] || source} bg={bg} color={color} />
}
const statusChip = (status?: string) => {
  if (!status) return <Muted />
  const [bg, color] = STATUS_TONES[status] ?? ['#F1F3F6', '#465066']
  return <Chip label={statusLabels[status] || status} bg={bg} color={color} />
}
const phoneCell = (record: CrmRecord) => {
  const phone = record.phone || record.whatsapp || ''
  if (!phone) return <Muted />
  return <span className={`block truncate tabular-nums ${phone === recordName(record) ? 'text-[#8A93A5]' : ''}`} title={phone}>{phone}</span>
}

export function crmTableColumns(resource: CrmResource, t: T, sourceLabels: Record<string, string>): CrmTableColumn[] {
  if (resource === 'leads') return [
    { key: 'name', label: t('crm.table.lead'), track: 'minmax(180px,1.6fr)', render: (record) => <NameCell record={record} subtitle={record.email} /> },
    { key: 'phone', label: t('crm.table.phone'), track: 'minmax(130px,1fr)', skeleton: 'w-28', render: phoneCell },
    { key: 'source', label: t('crm.table.source'), track: '100px', skeleton: 'w-16', render: (record) => sourceChip(record.source, sourceLabels) },
    { key: 'stage', label: t('crm.table.stage'), track: 'minmax(110px,0.9fr)', render: (record) => record.stage ? <Chip label={record.stage.name} bg="#F1F3F6" color="#3C3C43" dot={record.stage.color || '#7B8494'} /> : statusChip(record.status) },
    { key: 'manager', label: t('crm.table.manager'), track: 'minmax(130px,1fr)', wide: true, render: (record) => <Person record={record} empty={t('crm.table.noManager')} /> },
  ]
  if (resource === 'contacts') return [
    { key: 'name', label: t('crm.table.contact'), track: 'minmax(180px,1.6fr)', render: (record) => <NameCell record={record} subtitle={record.is_active === false ? t('crm.table.inactive') : record.email} /> },
    { key: 'phone', label: t('crm.table.phone'), track: 'minmax(130px,1fr)', skeleton: 'w-28', render: phoneCell },
    { key: 'source', label: t('crm.table.source'), track: '100px', skeleton: 'w-16', render: (record) => sourceChip(record.created_source || record.external_source, sourceLabels) },
    { key: 'history', label: t('crm.table.history'), track: 'minmax(100px,0.8fr)', wide: true, render: (record) => {
      const leads = record.lead_history_count ?? 0
      const deals = record.deals_count ?? 0
      if (!leads && !deals) return <Muted>{t('crm.table.noHistory')}</Muted>
      return <span className="block truncate text-[13px]">{[leads ? t('crm.table.leads', { count: leads }) : '', deals ? t('crm.table.deals', { count: deals }) : ''].filter(Boolean).join(' · ')}</span>
    } },
    { key: 'created', label: t('crm.table.created'), track: '110px', wide: true, render: (record) => <span className="text-[13px] tabular-nums">{shortDate(record.created_date) || '—'}</span> },
  ]
  if (resource === 'deals') return [
    { key: 'name', label: t('crm.table.deal'), track: 'minmax(180px,1.8fr)', render: (record) => <NameCell record={record} icon={<BriefcaseBusiness size={16} />} subtitle={record.comment} /> },
    { key: 'amount', label: t('crm.table.amount'), track: '120px', align: 'right', skeleton: 'ml-auto w-24', render: (record) => <span className="font-semibold tabular-nums text-[#17202E]">{money(record)}</span> },
    { key: 'status', label: t('crm.table.status'), track: '110px', skeleton: 'w-16', render: (record) => statusChip(record.status) },
    { key: 'manager', label: t('crm.table.manager'), track: 'minmax(130px,1fr)', wide: true, render: (record) => <Person record={record} empty={t('crm.table.noManager')} /> },
    { key: 'created', label: t('crm.table.created'), track: '100px', wide: true, render: (record) => <span className="text-[13px] tabular-nums">{shortDate(record.created_date) || '—'}</span> },
  ]
  if (resource === 'tasks') return [
    { key: 'name', label: t('crm.table.task'), track: 'minmax(200px,1.8fr)', render: (record) => <NameCell record={record} icon={<SquareCheck size={16} />} subtitle={record.lead?.full_name || record.description} /> },
    { key: 'due', label: t('crm.table.due'), track: '140px', skeleton: 'w-24', render: (record) => {
      if (!record.due_at) return <Muted />
      const overdue = new Date(record.due_at).getTime() < Date.now() && !['completed', 'cancelled'].includes(record.status || '')
      return <span className={`text-[13px] tabular-nums ${overdue ? 'font-medium text-[#C03437]' : ''}`}>{shortDate(record.due_at, true)}</span>
    } },
    { key: 'status', label: t('crm.table.status'), track: '120px', skeleton: 'w-16', render: (record) => statusChip(record.status) },
    { key: 'manager', label: t('crm.table.manager'), track: 'minmax(130px,1fr)', wide: true, render: (record) => <Person record={record} empty={t('crm.table.noManager')} /> },
  ]
  return [
    { key: 'name', label: t('crm.table.stage'), track: 'minmax(200px,1.8fr)', render: (record) => <NameCell record={record} icon={<Layers size={16} />} /> },
    { key: 'order', label: t('crm.table.order'), track: '100px', skeleton: 'w-10', render: (record) => <span className="tabular-nums">{record.order ?? '—'}</span> },
    { key: 'color', label: t('crm.table.status'), track: '130px', skeleton: 'w-16', render: (record) => <Chip label={record.is_active === false ? t('crm.table.inactive') : t('crm.table.active')} bg="#F1F3F6" color="#3C3C43" dot={record.color || '#7B8494'} /> },
  ]
}
