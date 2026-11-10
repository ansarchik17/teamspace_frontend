import { useMemo, useState } from 'react'
import AppSelect from '../../../shared/ui/AppSelect'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type { BoardOptionViewModel } from '../../view-models/BoardViewModel'
import { formatDate } from '../../../shared/i18n'
import { bt } from './boardText'

interface BoardPickerGridProps {
  boards: BoardOptionViewModel[]
  highlightedBoardId?: string
  progressByBoardId?: Record<string, number>
  membersByBoardId?: Record<string, Array<{ initials: string; name: string; avatarUrl?: string }>>
  columnsByBoardId?: Record<string, Array<{ name: string; key: string; totalTasks: number }>>
  onSelectBoard: (boardId: string) => void
  onCreateBoard?: () => void
}

type SortMode = 'name' | 'created_desc' | 'created_asc'
type ViewMode = 'all' | 'recent'

type BoardMemberPreview = {
  initials: string
  name: string
  avatarUrl?: string
}

type BoardColumnPreview = {
  name: string
  key: string
  totalTasks: number
}

const BOARD_VISIT_IDS_KEY = 'superapp.board_visit_ids'

const PREVIEW_COLUMNS = [
  { get label() { return bt('page.tabs.tasks') }, color: '#4C8EF7', tint: '#F2F7FF', border: '#DCEAFF' },
  { get label() { return bt('status.IN_PROGRESS') }, color: '#F4B740', tint: '#FFF9EE', border: '#F6E7BF' },
  { get label() { return bt('status.TEST') }, color: '#8B6CF6', tint: '#F8F5FF', border: '#E8DFFF' },
  { get label() { return bt('status.DONE') }, color: '#39C6A4', tint: '#F0FBF8', border: '#D4F2EA' },
] as const

const MEMBER_COLORS = ['#2F55F5', '#00A887', '#F29D38', '#7A5AF8', '#E65B7A']

const readBoardVisitIdsFromStorage = (): string[] => {
  try {
    const raw = window.localStorage.getItem(BOARD_VISIT_IDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

const hashValue = (value: string): number => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

const createdAtMs = (board: BoardOptionViewModel): number => {
  if (!board.createdAt) return 0
  const timestamp = new Date(board.createdAt).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const formatCreatedLabel = (iso?: string): string => {
  if (!iso) return bt('picker.noDate')

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return bt('picker.noDate')

  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const dateStart = new Date(date)
  dateStart.setHours(0, 0, 0, 0)
  const days = Math.round((dayStart.getTime() - dateStart.getTime()) / 86_400_000)

  if (days <= 0) return bt('picker.createdToday')
  if (days === 1) return bt('picker.createdYesterday')
  if (days < 7) return bt('picker.createdDaysAgo', { count: days })

  return bt('picker.createdOn', { date: formatDate(date, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' as const }),
  }) })
}

const formatTaskCount = (count: number): string => {
  const normalized = Math.max(0, Math.round(count))
  return bt('projects.tasks', { count: normalized })
}

const getStatusMeta = (totalTasks: number, isCurrent: boolean) => {
  if (isCurrent) {
    return { label: bt('picker.current'), className: 'bg-[#EAF1FF] text-[#2F55F5]' }
  }
  return { label: formatTaskCount(totalTasks), className: 'bg-[#F0F4FA] text-[#607493]' }
}

const getColumnTone = (key: string, index: number) => {
  const normalized = key.trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (normalized === 'TODO' || normalized === 'TO_DO') return PREVIEW_COLUMNS[0]
  if (normalized === 'IN_PROGRESS') return PREVIEW_COLUMNS[1]
  if (normalized === 'TEST' || normalized === 'REVIEW') return PREVIEW_COLUMNS[2]
  if (normalized === 'DONE' || normalized === 'COMPLETED') return PREVIEW_COLUMNS[3]
  return PREVIEW_COLUMNS[index % PREVIEW_COLUMNS.length]
}

function MiniBoardPreview({
  board,
  columns,
  featured,
}: {
  board: BoardOptionViewModel
  columns: BoardColumnPreview[]
  featured: boolean
}) {
  const seed = hashValue(`${board.id}:${board.name}`)
  const previewColumns = columns.length > 0
    ? columns.slice(0, 4)
    : PREVIEW_COLUMNS.map((column) => ({ name: column.label, key: column.label, totalTasks: 0 }))

  return (
    <div className={`grid grid-cols-4 gap-1.5 ${featured ? 'h-[116px]' : 'h-[98px]'}`} aria-hidden>
      {previewColumns.map((column, columnIndex) => {
        const tone = getColumnTone(column.key, columnIndex)
        const taskCount = Math.max(0, Math.round(column.totalTasks))
        const visibleTasks = Math.min(taskCount, featured ? 3 : 2)

        return (
          <div
            key={`${column.key}-${columnIndex}`}
            className="min-w-0 overflow-hidden rounded-[10px] border p-2"
            style={{ backgroundColor: tone.tint, borderColor: tone.border }}
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <span className="truncate text-[9px] font-semibold" style={{ color: tone.color }}>
                {column.name}
              </span>
              <span className="text-[9px] font-semibold tabular-nums text-[#6E7F99]">{taskCount}</span>
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: visibleTasks }).map((_, taskIndex) => {
                const width = 50 + ((seed + columnIndex * 19 + taskIndex * 13) % 42)
                return (
                  <div
                    key={taskIndex}
                    className="rounded-[6px] border border-white/80 bg-white px-1.5 py-1.5 shadow-[0_1px_3px_rgba(26,48,84,0.04)]"
                  >
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tone.color }} />
                      <span className="h-1 rounded-full bg-[#DFE7F1]" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MemberStack({ members }: { members: BoardMemberPreview[] }) {
  if (members.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-[#8293AA]">
        <MaterialSymbol name="group" size={16} color="currentColor" />
        {bt('hub.noMembers')}
      </span>
    )
  }

  const visibleMembers = members.slice(0, 3)
  const rest = Math.max(members.length - visibleMembers.length, 0)

  return (
    <div className="flex items-center -space-x-2" aria-label={bt('page.membersCount', { count: members.length })}>
      {visibleMembers.map((member, index) => (
        <span
          key={`${member.name}-${index}`}
          title={member.name}
          className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-white text-[9px] font-bold text-white shadow-[0_2px_5px_rgba(24,45,78,0.12)]"
          style={{ backgroundColor: MEMBER_COLORS[index % MEMBER_COLORS.length] }}
        >
          <span>{member.initials}</span>
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
            />
          ) : null}
        </span>
      ))}
      {rest > 0 ? (
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#EFF3FB] text-[10px] font-bold text-[#52709B]">
          +{rest}
        </span>
      ) : null}
    </div>
  )
}

function BoardCard({
  board,
  featured,
  highlightedBoardId,
  progressByBoardId,
  membersByBoardId,
  columnsByBoardId,
  onSelectBoard,
}: {
  board: BoardOptionViewModel
  featured: boolean
  highlightedBoardId?: string
  progressByBoardId: Record<string, number>
  membersByBoardId: Record<string, BoardMemberPreview[]>
  columnsByBoardId: Record<string, BoardColumnPreview[]>
  onSelectBoard: (boardId: string) => void
}) {
  const isCurrent = highlightedBoardId === board.id
  const columns = columnsByBoardId[board.id] ?? []
  const totalTasks = columns.length > 0
    ? columns.reduce((total, column) => total + Math.max(0, column.totalTasks), 0)
    : Math.max(0, board.progress?.totalTasks ?? 0)
  const progress = Math.max(
    0,
    Math.min(100, Math.round(progressByBoardId[board.id] ?? board.progress?.completionPercent ?? 0)),
  )
  const members = membersByBoardId[board.id] ?? []
  const status = getStatusMeta(totalTasks, isCurrent)

  return (
    <button
      type="button"
      onClick={() => onSelectBoard(board.id)}
      className={[
        'group flex h-full w-full flex-col rounded-[16px] border bg-white p-4 text-left transition duration-200',
        'hover:-translate-y-0.5 hover:border-[#C9D8F0] hover:shadow-[0_16px_36px_rgba(36,66,112,0.10)] active:translate-y-0',
        isCurrent
          ? 'border-[#AFC6FF] shadow-[0_10px_26px_rgba(47,85,245,0.10)] ring-1 ring-[#DDE7FF]'
          : 'border-[#E1E8F2] shadow-[0_5px_18px_rgba(37,60,92,0.055)]',
      ].join(' ')}
    >
      <MiniBoardPreview board={board} columns={columns} featured={featured} />

      <div className="mt-4 flex items-start justify-between gap-3">
        <h3 className={`${featured ? 'text-[17px]' : 'text-[15px]'} line-clamp-2 font-semibold leading-snug tracking-[-0.015em] text-[#10213B]`}>
          {board.name}
        </h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${status.className}`}>
          {status.label}
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#7184A1]">
          <span>{bt('hub.columns.progress')}</span>
          <span className="font-semibold tabular-nums text-[#435B7E]">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#E8EDF5]">
          <div
            className="h-full rounded-full bg-[#3D63F3] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#EEF2F7] pt-3">
        <MemberStack members={members} />
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-[#7588A6]">
          <MaterialSymbol name="schedule" size={15} color="currentColor" />
          <span className="truncate">{formatCreatedLabel(board.createdAt)}</span>
        </span>
      </div>
    </button>
  )
}

export default function BoardPickerGrid({
  boards,
  highlightedBoardId,
  progressByBoardId = {},
  membersByBoardId = {},
  columnsByBoardId = {},
  onSelectBoard,
  onCreateBoard,
}: BoardPickerGridProps) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortMode>('created_desc')
  const [viewMode, setViewMode] = useState<ViewMode>('all')

  const visitIds = useMemo(() => readBoardVisitIdsFromStorage(), [])
  const byId = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards])

  const recentBoards = useMemo(() => {
    const visited = visitIds.map((id) => byId.get(id)).filter(Boolean) as BoardOptionViewModel[]
    if (visited.length > 0) return visited.slice(0, 3)
    return [...boards].sort((a, b) => createdAtMs(b) - createdAtMs(a)).slice(0, 3)
  }, [boards, byId, visitIds])

  const filteredSorted = useMemo(() => {
    const query = search.trim().toLowerCase()
    const list = query ? boards.filter((board) => board.name.toLowerCase().includes(query)) : [...boards]

    if (sort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }))
    } else if (sort === 'created_desc') {
      list.sort((a, b) => createdAtMs(b) - createdAtMs(a))
    } else {
      list.sort((a, b) => createdAtMs(a) - createdAtMs(b))
    }

    return list
  }, [boards, search, sort])

  const filteredRecent = useMemo(() => {
    const query = search.trim().toLowerCase()
    return query ? recentBoards.filter((board) => board.name.toLowerCase().includes(query)) : recentBoards
  }, [recentBoards, search])

  const visibleBoards = viewMode === 'recent' ? filteredRecent : filteredSorted

  const renderCard = (board: BoardOptionViewModel, featured: boolean) => (
    <BoardCard
      key={board.id}
      board={board}
      featured={featured}
      highlightedBoardId={highlightedBoardId}
      progressByBoardId={progressByBoardId}
      membersByBoardId={membersByBoardId}
      columnsByBoardId={columnsByBoardId}
      onSelectBoard={onSelectBoard}
    />
  )

  return (
    <div className="flex w-full animate-fade-in flex-col pb-8">
      <div className="mb-7 flex flex-col gap-3 rounded-[18px] border border-[#E1E8F2] bg-white/90 p-2.5 shadow-[0_6px_20px_rgba(37,60,92,0.05)] backdrop-blur-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-[12px] bg-[#F4F7FB] p-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-[9px] px-3.5 text-[12px] font-semibold transition ${
              viewMode === 'all'
                ? 'bg-[#3D63F3] text-white shadow-[0_4px_10px_rgba(61,99,243,0.24)]'
                : 'text-[#607493] hover:bg-white hover:text-[#243B60]'
            }`}
          >
            {bt('hub.allBoards')}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${viewMode === 'all' ? 'bg-white/20 text-white' : 'bg-white text-[#55709B]'}`}>
              {boards.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('recent')}
            className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-[9px] px-3.5 text-[12px] font-semibold transition ${
              viewMode === 'recent'
                ? 'bg-[#3D63F3] text-white shadow-[0_4px_10px_rgba(61,99,243,0.24)]'
                : 'text-[#607493] hover:bg-white hover:text-[#243B60]'
            }`}
          >
            {bt('picker.recent')}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${viewMode === 'recent' ? 'bg-white/20 text-white' : 'bg-white text-[#55709B]'}`}>
              {recentBoards.length}
            </span>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row lg:max-w-[510px] lg:justify-end">
          <label className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7890B2]">
              <MaterialSymbol name="search" size={19} color="currentColor" />
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={bt('hub.search')}
              className="h-10 w-full rounded-[11px] border border-[#DDE5F0] bg-white py-2 pl-10 pr-3 text-[13px] text-[#163052] outline-none transition placeholder:text-[#91A1B8] focus:border-[#9DB7F8] focus:ring-3 focus:ring-[#DCE6FF]/70"
            />
          </label>
          <AppSelect
              value={sort}
              onChange={(value) => setSort(value as SortMode)}
              options={[
                { value: 'created_desc', label: bt('hub.sort.created') },
                { value: 'created_asc', label: bt('picker.oldestFirst') },
                { value: 'name', label: bt('hub.sort.name') },
              ]}
              showButtonAvatar={false}
              showOptionAvatar={false}
              ariaLabel={bt('hub.sort.label')}
              className="shrink-0 sm:w-[178px]"
              buttonClassName="!h-10 !rounded-[11px] !bg-white !text-[12px]"
            />
        </div>
      </div>

      {viewMode === 'all' && filteredRecent.length > 0 ? (
        <section className="mb-8">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#10213B]">{bt('picker.recent')}</h2>
            <button
              type="button"
              onClick={() => setViewMode('recent')}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3D63F3] transition hover:text-[#2447D5]"
            >
              {bt('picker.showAll')}
              <MaterialSymbol name="arrow_forward" size={16} color="currentColor" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredRecent.map((board) => renderCard(board, true))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3.5 flex items-center gap-2.5">
          <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-[#10213B]">
            {viewMode === 'recent' ? bt('picker.recentBoards') : bt('hub.allBoards')}
          </h2>
          <span className="rounded-full bg-[#EAF0FC] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#4E6F9E]">
            {visibleBoards.length}
          </span>
        </div>

        {visibleBoards.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[16px] border border-dashed border-[#C7D5E8] bg-white/70 px-6 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#EDF3FF] text-[#3D63F3]">
              <MaterialSymbol name="search_off" size={22} color="currentColor" />
            </span>
            <p className="text-[14px] font-semibold text-[#294260]">{bt('picker.notFound')}</p>
            <p className="mt-1 text-[12px] text-[#7D8FA8]">{bt('picker.tryAnother')}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleBoards.map((board) => (
              <li key={board.id}>{renderCard(board, false)}</li>
            ))}
            {viewMode === 'all' && onCreateBoard ? (
              <li>
                <button
                  type="button"
                  onClick={onCreateBoard}
                  className="group flex min-h-[286px] h-full w-full flex-col items-center justify-center rounded-[16px] border border-dashed border-[#AFC7F5] bg-white/45 px-6 text-center transition hover:-translate-y-0.5 hover:border-[#6D94EE] hover:bg-white/75 hover:shadow-[0_14px_32px_rgba(49,84,144,0.08)]"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF1FF] text-[#3D63F3] transition group-hover:scale-105 group-hover:bg-[#DDE8FF]">
                    <MaterialSymbol name="add" size={25} color="currentColor" />
                  </span>
                  <span className="text-[15px] font-semibold text-[#2F55D9]">{bt('hub.createBoard')}</span>
                  <span className="mt-1.5 max-w-[190px] text-[12px] leading-relaxed text-[#8293AA]">
                    {bt('picker.createHint')}
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </div>
  )
}
