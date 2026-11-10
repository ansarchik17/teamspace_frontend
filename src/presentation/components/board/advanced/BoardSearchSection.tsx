import { useState } from 'react'
import AppSelect from '../../../../shared/ui/AppSelect'
import type { BoardLabelViewModel, BoardTaskViewModel, BoardUserViewModel } from '../../../view-models/BoardViewModel'
import { bt } from '../boardText'

interface BoardSearchSectionProps {
  users: BoardUserViewModel[]
  labels: BoardLabelViewModel[]
  columnKeyOptions: Array<{ key: string; name: string }>
  myTodoTasks: BoardTaskViewModel[]
  searchResults: BoardTaskViewModel[]
  isLoading: boolean
  onLoadMyTodo: () => Promise<void>
  onSearchTasks: (payload: {
    q?: string
    priorities?: string[]
    assigneeIds?: number[]
    columnKeys?: string[]
    labelIds?: string[]
    dateFrom?: string
    dateTo?: string
  }) => Promise<void>
}

const toStartOfDayUtcIso = (dateValue: string): string => {
  if (!dateValue) return ''
  return new Date(`${dateValue}T00:00:00.000Z`).toISOString()
}

const toEndOfDayUtcIso = (dateValue: string): string => {
  if (!dateValue) return ''
  return new Date(`${dateValue}T23:59:59.999Z`).toISOString()
}

export default function BoardSearchSection({
  users,
  labels,
  columnKeyOptions,
  myTodoTasks,
  searchResults,
  isLoading,
  onLoadMyTodo,
  onSearchTasks,
}: BoardSearchSectionProps) {
  const [searchText, setSearchText] = useState('')
  const [priority, setPriority] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [labelId, setLabelId] = useState('')
  const [columnKey, setColumnKey] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  return (
    <section className="rounded-2xl border border-[#E2EAF5] bg-white p-4">
      <h4 className="text-base font-bold text-[#0A1628]">{bt('search.title')}</h4>
      <p className="mt-1 text-xs text-[#7186A7]">{bt('search.hint')}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-7">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => {
            void onLoadMyTodo()
          }}
          className="h-10 rounded-xl border border-[#DDE3EE] bg-white px-3 text-sm font-semibold text-[#334E73] hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {bt('search.loadMine')}
        </button>

        <input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={bt('search.textPlaceholder')}
          className="h-10 rounded-xl border border-[#DDE3EE] bg-[#F9FBFE] px-3 text-sm text-[#0A1628] outline-none focus:border-[#2458D3]"
        />

        <AppSelect
          value={priority}
          options={[
            { value: '', label: bt('search.anyPriority') },
            { value: 'low', label: bt('priority.low') },
            { value: 'medium', label: bt('priority.medium') },
            { value: 'high', label: bt('priority.high') },
            { value: 'critical', label: bt('priority.critical') },
          ]}
          onChange={setPriority}
          ariaLabel={bt('search.byPriority')}
        />

        <AppSelect
          value={assigneeId}
          options={[{ value: '', label: bt('search.anyAssignee') }, ...users.map((item) => ({ value: String(item.id), label: item.fullName }))]}
          onChange={setAssigneeId}
          ariaLabel={bt('search.byAssignee')}
        />

        <AppSelect
          value={labelId}
          options={[{ value: '', label: bt('search.anyLabel') }, ...labels.map((item) => ({ value: item.id, label: item.name }))]}
          onChange={setLabelId}
          ariaLabel={bt('search.byLabel')}
        />

        <AppSelect
          value={columnKey}
          options={[
            { value: '', label: bt('search.anyColumn') },
            ...columnKeyOptions.map((item) => ({ value: item.key, label: `${item.name} (${item.key})` })),
          ]}
          onChange={setColumnKey}
          ariaLabel={bt('search.byColumn')}
        />

        <button
          type="button"
          disabled={isLoading}
          onClick={() => {
            void onSearchTasks({
              q: searchText.trim() || undefined,
              priorities: priority ? [priority] : undefined,
              assigneeIds: assigneeId ? [Number(assigneeId)] : undefined,
              columnKeys: columnKey ? [columnKey] : undefined,
              labelIds: labelId ? [labelId] : undefined,
              dateFrom: dateFrom ? toStartOfDayUtcIso(dateFrom) : undefined,
              dateTo: dateTo ? toEndOfDayUtcIso(dateTo) : undefined,
            })
          }}
          className="ts-button ts-button--primary h-10 rounded-xl bg-[#2458D3] px-4 text-sm font-semibold text-white transition hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {bt('search.find')}
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          className="h-10 rounded-xl border border-[#DDE3EE] bg-[#F9FBFE] px-3 text-sm text-[#0A1628] outline-none focus:border-[#2458D3]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          className="h-10 rounded-xl border border-[#DDE3EE] bg-[#F9FBFE] px-3 text-sm text-[#0A1628] outline-none focus:border-[#2458D3]"
        />
      </div>

      <div className="mt-3 rounded-xl border border-[#EEF3FB] bg-[#F9FCFF] p-3 text-sm text-[#486284]">
        TODO: <span className="font-semibold text-[#0A1628]">{myTodoTasks.length}</span> · {bt('search.found')} <span className="font-semibold text-[#0A1628]">{searchResults.length}</span>
      </div>

      {!isLoading && searchResults.length === 0 ? (
        <p className="mt-2 text-xs text-[#8CA1C0]">{bt('search.nothing')}</p>
      ) : null}
    </section>
  )
}
