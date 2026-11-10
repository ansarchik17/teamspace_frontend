import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AXIS_UI } from './axisTokens'

export interface DataTableColumn<T> {
  key: string
  label: ReactNode
  track: string
  wide?: boolean
  align?: 'right'
  skeleton?: string
  render: (row: T) => ReactNode
}

export const DATA_TABLE_ROW_ICON = `flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[#586174] transition-colors duration-[120ms] hover:bg-[#EEF0F3] hover:text-[#17202E] disabled:opacity-40 ${AXIS_UI.focus}`
const PAGER = `flex h-8 w-8 items-center justify-center rounded-[8px] text-[#465066] hover:bg-[#F1F3F6] disabled:text-[#B4BAC5] disabled:hover:bg-transparent ${AXIS_UI.focus}`

export function DataTablePager({ label, page, canPrev, canNext, onPrev, onNext, prevLabel, nextLabel, extra }: {
  label: ReactNode
  page: number
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  extra?: ReactNode
}) {
  return <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#E6EAF1] px-6 py-2.5 text-[13px] text-[#465066]">
    <span className="tabular-nums">{label}</span>
    <div className="flex items-center gap-1.5">
      {extra}
      <button type="button" className={PAGER} aria-label={prevLabel} title={prevLabel} disabled={!canPrev} onClick={onPrev}><ChevronLeft size={18} /></button>
      <span className="flex h-8 min-w-8 items-center justify-center rounded-[8px] border border-[#2458D3] bg-[#EDF2FF] px-2 font-medium tabular-nums text-[#2458D3]">{page}</span>
      <button type="button" className={PAGER} aria-label={nextLabel} title={nextLabel} disabled={!canNext} onClick={onNext}><ChevronRight size={18} /></button>
    </div>
  </footer>
}

export default function DataTable<T>({ rows, rowKey, columns, loading, empty, actionsLabel, actions, actionsTrack = '112px', onRowClick, selectedKey, footer, fill = false, ariaLabel, skeletonRows = 8 }: {
  rows: T[]
  rowKey: (row: T) => string | number
  columns: DataTableColumn<T>[]
  loading: boolean
  empty: ReactNode
  actionsLabel?: ReactNode
  actions?: (row: T) => ReactNode
  actionsTrack?: string
  onRowClick?: (row: T) => void
  selectedKey?: string | number | null
  footer?: ReactNode
  fill?: boolean
  ariaLabel?: string
  skeletonRows?: number
}) {
  const extra = actions ? [actionsTrack] : []
  const style = {
    '--dt-cols': [...columns.filter((column) => !column.wide).map((column) => column.track), ...extra].join(' '),
    '--dt-cols-wide': [...columns.map((column) => column.track), ...extra].join(' '),
  } as CSSProperties
  const grid = 'grid grid-cols-[var(--dt-cols)] items-center gap-4 @min-[900px]:grid-cols-[var(--dt-cols-wide)]'
  const cell = (column: DataTableColumn<T>) => `${column.wide ? 'hidden @min-[900px]:block' : ''} ${column.align === 'right' ? 'text-right' : ''} min-w-0`
  const onKey = (event: KeyboardEvent<HTMLDivElement>, row: T) => {
    if (event.target === event.currentTarget && event.key === 'Enter') onRowClick?.(row)
  }

  return <section className={`@container flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white ${fill ? 'min-h-0 flex-1' : ''}`} style={style}>
    <div className={`${fill ? 'min-h-0 flex-1 overflow-y-auto' : ''} overflow-x-auto [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin]`}>
      <div role="table" aria-label={ariaLabel} className="min-w-min">
        <div role="row" className={`${grid} sticky top-0 z-10 h-11 border-b border-[#E6EAF1] bg-[#FAFBFC] px-6 text-[13px] font-medium text-[#586174]`}>
          {columns.map((column) => <span key={column.key} role="columnheader" className={`${cell(column)} truncate`}>{column.label}</span>)}
          {actions && <span role="columnheader" className="truncate text-right">{actionsLabel}</span>}
        </div>
        {loading ? Array.from({ length: skeletonRows }, (_, index) => (
          <div key={index} aria-hidden className={`${grid} h-[60px] border-b border-[#EEF0F3] px-6 last:border-b-0`}>
            {columns.map((column, position) => <span key={column.key} className={cell(column)}>
              {position === 0 ? <span className="flex items-center gap-3"><span className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[#EEF0F3]" /><span className="h-3.5 w-40 max-w-full animate-pulse rounded bg-[#EEF0F3]" /></span>
                : <span className={`block h-3.5 max-w-full animate-pulse rounded bg-[#EEF0F3] ${column.skeleton || 'w-20'}`} />}
            </span>)}
            {actions && <span />}
          </div>
        )) : rows.length === 0 ? empty : rows.map((row) => {
          const key = rowKey(row)
          const selected = selectedKey != null && selectedKey === key
          return <div key={key} role="row" tabIndex={onRowClick ? 0 : undefined} aria-selected={selectedKey != null ? selected : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined} onKeyDown={onRowClick ? (event) => onKey(event, row) : undefined}
            className={`${grid} group h-[60px] border-b border-[#EEF0F3] px-6 text-[14px] text-[#465066] transition-colors duration-[120ms] last:border-b-0 ${onRowClick ? `cursor-pointer ${AXIS_UI.focus}` : ''} ${selected ? 'bg-[#F7F9FF] shadow-[inset_3px_0_0_#2458D3]' : onRowClick ? 'hover:bg-[#F8F9FB]' : ''}`}>
            {columns.map((column) => <div key={column.key} role="cell" className={cell(column)}>{column.render(row)}</div>)}
            {actions && <div role="cell" className="flex justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>{actions(row)}</div>}
          </div>
        })}
      </div>
    </div>
    {footer}
  </section>
}

export function DataTableEmpty({ title, text, icon }: { title: ReactNode; text?: ReactNode; icon?: ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-2 p-8 text-center">
    {icon && <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]">{icon}</span>}
    <h3 className="font-semibold text-[#17202E]">{title}</h3>
    {text && <p className="max-w-md text-sm text-[#586174]">{text}</p>}
  </div>
}
