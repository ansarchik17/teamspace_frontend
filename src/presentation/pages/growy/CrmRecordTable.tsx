import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import type { CrmRecord, Page } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import DataTable, { DATA_TABLE_ROW_ICON, DataTablePager, type DataTableColumn } from '../../../shared/ui/DataTable'
import type { CrmCardAction } from './CrmKanban'
import { EmptyState } from './growyUi'
import { recordName } from './growyShared'

export type CrmTableColumn = DataTableColumn<CrmRecord>

const PAGE_SIZE = 25
export const CRM_ROW_ICON = DATA_TABLE_ROW_ICON

export default function CrmRecordTable({ records, loading, page, filtered, columns, quickActions, menuActions, onPage, onOpen }: {
  records: Page<CrmRecord>; loading: boolean; page: number; filtered: boolean
  columns: CrmTableColumn[]; quickActions?: (record: CrmRecord) => ReactNode; menuActions: (record: CrmRecord) => CrmCardAction[]
  onPage: (page: number) => void; onOpen: (record: CrmRecord) => void
}) {
  const { t } = useTranslation('shell')
  const [menu, setMenu] = useState<{ anchor: HTMLElement; record: CrmRecord } | null>(null)
  const from = records.count ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = records.count ? from + records.results.length - 1 : 0

  return <>
    <DataTable fill rows={records.results} rowKey={(record) => record.id} columns={columns} loading={loading} onRowClick={onOpen}
      empty={<EmptyState title={filtered ? t('crm.table.notFoundTitle') : t('crm.table.emptyTitle')} description={filtered ? t('crm.table.notFoundText') : t('crm.table.emptyText')} />}
      actionsLabel={t('crm.table.actions')}
      actions={(record) => <>
        {quickActions?.(record)}
        <button type="button" className={CRM_ROW_ICON} title={t('crm.table.more')} aria-label={`${t('crm.table.more')}: ${recordName(record)}`} aria-haspopup="menu"
          onClick={(event) => setMenu({ anchor: event.currentTarget, record })}><MoreHorizontal size={18} /></button>
      </>}
      footer={<DataTablePager label={t('crm.table.range', { from, to, total: records.count })} page={page} canPrev={page > 1 && !loading} canNext={records.hasNext && !loading}
        onPrev={() => onPage(page - 1)} onNext={() => onPage(page + 1)} prevLabel={t('crm.table.prev')} nextLabel={t('crm.table.next')} />} />
    <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={() => setMenu(null)} className="min-w-[200px]">
      {menu && menuActions(menu.record).map((action) => <button key={action.key} type="button" className={floatingMenuItemClass} disabled={action.disabled}
        onClick={() => { setMenu(null); action.onClick() }}>{action.icon}{action.label}</button>)}
    </FloatingMenu>
  </>
}
