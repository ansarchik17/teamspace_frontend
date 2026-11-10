import PageHeader from '../../../shared/ui/PageHeader'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArchiveRestore, CalendarDays, Check, ExternalLink, MoreHorizontal, Pin, RotateCcw, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import FloatingMenu from '../../../shared/ui/FloatingMenu'
import { PINNED_BOARDS_CHANGED, PINNED_BOARDS_KEY } from '../work/workTabs'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type { BoardOptionViewModel, BoardTaskViewModel, BoardUserViewModel } from '../../view-models/BoardViewModel'
import { AXIS_AVATAR_COLORS, AXIS_TONE_CLASS, AXIS_UI, type AxisTone } from '../../../shared/ui/axisTokens'
import ViewToggle from '../../../shared/ui/ViewToggle'
import BoardsEmptyState from './BoardsEmptyState'
import { formatDate as formatSharedDate } from '../../../shared/i18n'
import { bt } from './boardText'

export type BoardHubMember = { userId: number; initials: string; name: string; avatarUrl?: string }
export type BoardHubColumn = { name: string; key: string; totalTasks: number }
export type BoardHubCover = { image?: string; color?: string }

export interface BoardProjectHubProps {
  boards: BoardOptionViewModel[]
  users?: BoardUserViewModel[]
  currentUserId?: number | null
  highlightedBoardId?: string
  progressByBoardId?: Record<string, number>
  membersByBoardId?: Record<string, BoardHubMember[]>
  coversByBoardId?: Record<string, BoardHubCover>
  columnsByBoardId?: Record<string, BoardHubColumn[]>
  weekTasks?: BoardTaskViewModel[]
  archivedBoardIds?: string[]
  onArchiveBoard?: (boardId: string, archived: boolean) => void | Promise<void>
  onDeleteBoard?: (boardId: string, boardName: string) => void
  onSelectBoard: (boardId: string) => void
  /** Открыть конкретную задачу (доска + карточка задачи) */
  onOpenTask?: (boardId: string, taskId: string) => void
  /** Открыть доску и окно её участников */
  onInviteMembers?: (boardId: string) => void
  onCreateBoard?: () => void
}

type HubMode = 'overview' | 'mine' | 'archive'
type SortMode = 'updated_desc' | 'created_desc' | 'name' | 'progress_desc'
type LayoutMode = 'list' | 'grid'
type StatusFilter = 'all' | 'active' | 'review' | 'planned' | 'done'
type ArchiveNotice = { kind: 'archived' | 'restored' | 'error'; boardId: string; name: string }

const PINNED_BOARD_IDS_KEY = 'superapp.pinned_board_ids'

const ARCHIVED_BOARD_IDS_KEY = 'superapp.archived_board_ids'
const MAX_PINNED_BOARDS = 3
const BOARD_ICONS = [
  'view_kanban',
  'rocket_launch',
  'campaign',
  'dashboard_customize',
  'account_tree',
  'track_changes',
  'insights',
  'folder',
] as const

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ')

const readIds = (key: string): string[] => {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]') as unknown
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const writeIds = (key: string, value: string[]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Browser storage is optional.
  }
}

const DEFAULT_COVER_TONE = '#DCE7FF'

const hashValue = (value: string) =>
  Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0)

const coverGradient = (hex: string) => {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let hue = 0
  if (delta) {
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
  }
  hue = Math.round(hue * 60 + 360) % 360
  const lightness = (max + min) / 2
  const saturation = delta ? Math.round((delta / (1 - Math.abs(2 * lightness - 1))) * 100) : 0
  const tone = Math.max(saturation, 48)
  return `radial-gradient(120% 120% at 85% 0%, hsl(${hue} ${tone}% 96% / 0.9) 0%, transparent 55%), linear-gradient(135deg, hsl(${hue} ${tone}% 90%) 0%, hsl(${hue} ${Math.min(tone + 10, 80)}% 74%) 100%)`
}

const timeValue = (value?: string) => {
  if (!value) return 0
  const result = new Date(value).getTime()
  return Number.isNaN(result) ? 0 : result
}

const formatDate = (value?: string, compact = false): string => {
  if (!value) return bt('list.noDue')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return bt('list.noDue')
  return formatSharedDate(date, compact ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
}

const initials = (value: string) =>
  value.trim().split(/\s+/).slice(0, 2).map((item) => item[0]?.toUpperCase() || '').join('') || '—'

type BoardStatus = { key: Exclude<StatusFilter, 'all'>; label: string; tone: AxisTone }

const boardStatus = (board: BoardOptionViewModel, columns: BoardHubColumn[] = []): BoardStatus => {
  const total = board.progress?.totalTasks || 0
  const progress = board.progress?.completionPercent || 0
  const reviewTasks = columns
    .filter((column) => /TEST|REVIEW|ПРОВЕР/i.test(column.key + ' ' + column.name)) // i18n-ignore
    .reduce((sum, column) => sum + column.totalTasks, 0)
  const activeTasks = columns
    .filter((column) => /IN_PROGRESS|IN PROGRESS|В РАБОТ/i.test(column.key + ' ' + column.name)) // i18n-ignore
    .reduce((sum, column) => sum + column.totalTasks, 0)
  if (total > 0 && progress >= 100) return { key: 'done', label: bt('status.DONE'), tone: 'success' }
  if (reviewTasks > 0) return { key: 'review', label: bt('hub.status.review'), tone: 'warning' }
  if (activeTasks > 0 || progress > 0) return { key: 'active', label: bt('status.IN_PROGRESS'), tone: 'action' }
  return { key: 'planned', label: bt('hub.status.planned'), tone: 'neutral' }
}

function StatusChip({ label, tone }: { label: string; tone: AxisTone }) {
  return (
    <span className={cx('inline-flex h-6 shrink-0 items-center rounded-[6px] px-2 text-[12px] font-medium', AXIS_TONE_CLASS[tone])}>
      {label}
    </span>
  )
}

function Avatar({ member, index }: { member: BoardHubMember; index: number }) {
  return (
    <span
      className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white text-[11px] font-semibold text-white"
      style={{ backgroundColor: AXIS_AVATAR_COLORS[index % AXIS_AVATAR_COLORS.length] }}
    >
      {member.initials}
      {member.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = 'none' }}
        />
      ) : null}
    </span>
  )
}

function MemberStack({ members, limit = 4 }: { members: BoardHubMember[]; limit?: number }) {
  if (members.length === 0) {
    return <span className={AXIS_UI.caption}>{bt('hub.noMembers')}</span>
  }
  const visible = members.slice(0, limit)
  const rest = Math.max(0, members.length - visible.length)
  return (
    <div className="flex items-center -space-x-1.5" aria-label={bt('page.membersCount', { count: members.length })}>
      {visible.map((member, index) => (
        <Avatar key={member.userId + '-' + index} member={member} index={index} />
      ))}
      {rest > 0 ? (
        <span className="relative flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-[#F1F2F4] px-1 text-[11px] font-semibold tabular-nums text-[#586174]">
          +{rest}
        </span>
      ) : null}
    </div>
  )
}

function Progress({ value, className = 'w-full' }: { value: number; className?: string }) {
  const normalized = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      className={cx('h-1.5 overflow-hidden rounded-full bg-[#E2E5EA]', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
    >
      <div className="h-full rounded-full bg-[#2458D3] transition-[width] duration-200" style={{ width: normalized + '%' }} />
    </div>
  )
}

function BoardIcon({ boardId, muted = false }: { boardId: string; muted?: boolean }) {
  const icon = BOARD_ICONS[hashValue(boardId) % BOARD_ICONS.length]
  return (
    <span
      className={cx(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px]',
        muted ? 'bg-[#F1F2F4] text-[#586174]' : 'bg-[#EDF2FF] text-[#2458D3]',
      )}
      aria-hidden
    >
      <MaterialSymbol name={icon} size={20} color="currentColor" />
    </span>
  )
}

type BoardMeta = {
  members: BoardHubMember[]
  ownerName: string
  ownerMember: BoardHubMember
  total: number
  completed: number
  progress: number
  status: BoardStatus
}

const OVERLAY_BUTTON = 'bg-white/90 shadow-[0_1px_3px_rgba(23,32,46,0.12)] backdrop-blur-sm hover:!bg-white'

function PinButton({ pinned, boardName, onToggle, overlay = false }: { pinned: boolean; boardName: string; onToggle: () => void; overlay?: boolean }) {
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      aria-pressed={pinned}
      aria-label={pinned ? `${bt('hub.unpinBoard')}: ${boardName}` : `${bt('hub.pinBoard')}: ${boardName}`}
      className={cx(
        'flex h-8 w-8 items-center justify-center rounded-[6px] transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)]',
        overlay && OVERLAY_BUTTON,
        pinned ? 'text-[#2458D3] hover:bg-[#EDF2FF]' : 'text-[#7B8494] hover:bg-[#F6F7F9] hover:text-[#17202E]',
      )}
    >
      <Pin className={cx('h-4 w-4 rotate-45', pinned && 'fill-current')} strokeWidth={1.75} />
    </button>
  )
}

function BoardCardMenu({
  boardName,
  archived,
  overlay = false,
  canDelete,
  onOpen,
  onToggleArchive,
  onDelete,
}: {
  boardName: string
  archived: boolean
  overlay?: boolean
  canDelete: boolean
  onOpen: () => void
  onToggleArchive: () => void
  onDelete?: () => void
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const open = Boolean(anchor)
  const close = () => setAnchor(null)
  const run = (handler: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    close()
    handler()
  }
  const itemClass = 'flex h-9 w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors duration-[120ms] focus-visible:outline-none focus-visible:bg-[#F6F7F9] disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); setAnchor(open ? null : event.currentTarget) }}
        className={cx(
          'flex h-8 w-8 items-center justify-center rounded-[6px] text-[#586174] transition-colors duration-[120ms] hover:bg-[#F6F7F9] hover:text-[#17202E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)]',
          overlay && OVERLAY_BUTTON,
          open && 'bg-[#F6F7F9] text-[#17202E]',
        )}
        data-no-tooltip
        aria-label={bt('hub.boardActions', { name: boardName })}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
      </button>
      <FloatingMenu
        anchor={anchor}
        open={open}
        onClose={close}
        className="!min-w-0 w-[224px] !rounded-[8px] border border-[#E2E5EA] !py-1 !shadow-[0_12px_32px_rgba(23,32,46,0.12)]"
      >
        {!archived ? (
          <>
            <button type="button" role="menuitem" onClick={run(onOpen)} className={cx(itemClass, 'text-[#17202E] hover:bg-[#F6F7F9]')}>
              <ExternalLink className="h-4 w-4 shrink-0 text-[#586174]" strokeWidth={1.75} />
              {bt('hub.open')}
            </button>
            <div className="my-1 h-px bg-[#E2E5EA]" />
          </>
        ) : null}
        <button type="button" role="menuitem" onClick={run(onToggleArchive)} className={cx(itemClass, 'text-[#17202E] hover:bg-[#F6F7F9]')}>
          {archived ? <ArchiveRestore className="h-4 w-4 shrink-0 text-[#586174]" strokeWidth={1.75} /> : <Archive className="h-4 w-4 shrink-0 text-[#586174]" strokeWidth={1.75} />}
          {archived ? bt('hub.restore') : bt('hub.archive')}
        </button>
        {archived && canDelete && onDelete ? (
          <>
            <div className="my-1 h-px bg-[#E2E5EA]" />
            <button type="button" role="menuitem" onClick={run(onDelete)} className={cx(itemClass, 'text-[#C03437] hover:bg-[#FFF0F0]')}>
              <Trash2 className="h-4 w-4 shrink-0 text-[#C03437]" strokeWidth={1.75} />
              {bt('delete')}
            </button>
          </>
        ) : null}
      </FloatingMenu>
    </>
  )
}

function BoardCard({
  board,
  meta,
  archived,
  pinned,
  cover,
  onSelectBoard,
  onTogglePin,
  onToggleArchive,
  onDeleteBoard,
  canDelete,
}: {
  board: BoardOptionViewModel
  meta: BoardMeta
  archived: boolean
  pinned: boolean
  cover?: BoardHubCover
  onSelectBoard: (boardId: string) => void
  onTogglePin: (boardId: string) => void
  onToggleArchive: (boardId: string, archived: boolean) => void
  onDeleteBoard?: (boardId: string, boardName: string) => void
  canDelete: boolean
}) {
  const progress = Math.round(meta.progress)
  const people = meta.members.length > 0 ? meta.members : [meta.ownerMember]
  const icon = BOARD_ICONS[hashValue(board.id) % BOARD_ICONS.length]

  return (
    <article className="group relative flex h-full min-w-0 flex-col rounded-[12px] border border-[#E6EAF1] bg-white p-1.5 transition-[border-color,box-shadow] duration-[120ms] hover:border-[#D3D9E3] hover:shadow-[0_8px_24px_-16px_rgba(16,24,40,0.25)]">
      <button
        type="button"
        onClick={() => onSelectBoard(board.id)}
        className="absolute inset-0 z-0 rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)]"
        aria-label={bt('hub.openBoard', { name: board.name })}
      />

      <div className="pointer-events-none relative z-10 h-[104px] overflow-hidden rounded-[8px] bg-[#EEF2F8]">
        {cover?.image ? (
          <img
            src={cover.image}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cx('h-full w-full object-cover', archived && 'opacity-60 grayscale')}
          />
        ) : (
          <span
            className={cx('block h-full w-full', archived && 'opacity-60 grayscale')}
            style={{ backgroundImage: coverGradient(cover?.color || DEFAULT_COVER_TONE) }}
          />
        )}
        <span className={cx('absolute bottom-2.5 left-2.5 flex h-10 w-10 items-center justify-center rounded-[8px] bg-white/90 shadow-[0_1px_3px_rgba(23,32,46,0.12)] backdrop-blur-sm', archived ? 'text-[#586174]' : 'text-[#2458D3]')} aria-hidden>
          <MaterialSymbol name={icon} size={20} color="currentColor" />
        </span>
        <div className="pointer-events-auto absolute right-2 top-2 flex items-center gap-1.5">
          {!archived ? <PinButton overlay pinned={pinned} boardName={board.name} onToggle={() => onTogglePin(board.id)} /> : null}
          <BoardCardMenu
            overlay
            boardName={board.name}
            archived={archived}
            canDelete={canDelete}
            onOpen={() => onSelectBoard(board.id)}
            onToggleArchive={() => onToggleArchive(board.id, !archived)}
            onDelete={onDeleteBoard ? () => onDeleteBoard(board.id, board.name) : undefined}
          />
        </div>
      </div>

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col px-2.5 pb-2.5 pt-3">
        <h3 className={cx('line-clamp-2 break-words text-[15px] font-medium leading-5', archived ? 'text-[#586174]' : 'text-[#17202E]')}>
          {board.name}
        </h3>
        <p className="mt-0.5 truncate text-[13px] leading-5 text-[#586174]">{meta.ownerName}</p>
        <div className="mt-auto pt-3.5">
          <div className="mb-2 flex items-center justify-between gap-2 text-[12px] leading-4 text-[#586174]">
            <span className="truncate tabular-nums">{bt('hub.tasksProgress', { done: meta.completed, total: meta.total })}</span>
            <span className="font-medium tabular-nums text-[#17202E]">{progress}%</span>
          </div>
          <Progress value={progress} />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EEF0F3] pt-3">
            <MemberStack members={people} limit={4} />
            {archived ? (
              <StatusChip label={bt('hub.inArchive')} tone="neutral" />
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-[#586174]">
                <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate tabular-nums">{formatDate(board.nextDueAt || board.updatedAt, true)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function CreateBoardTile({ onCreateBoard }: { onCreateBoard: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreateBoard}
      className={cx(
        'flex min-h-[240px] h-full w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-[#D3D9E3] bg-transparent text-[14px] font-medium text-[#586174] transition-colors duration-[120ms] hover:border-[#2458D3] hover:bg-white hover:text-[#2458D3]',
        AXIS_UI.focus,
      )}
    >
      <MaterialSymbol name="add" size={20} color="currentColor" />
      {bt('hub.createBoard')}
    </button>
  )
}

function EmptyState({ archiveMode }: { archiveMode: boolean }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[10px] border border-[#E6EAF1] bg-white p-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]">
        <MaterialSymbol name={archiveMode ? 'archive' : 'search'} size={20} color="currentColor" />
      </span>
      <p className="mt-3 text-[14px] font-semibold text-[#17202E]">
        {archiveMode ? bt('hub.archiveEmpty') : bt('hub.noMatches')}
      </p>
      <p className="mt-1 text-[12px] leading-4 text-[#586174]">
        {archiveMode
          ? bt('hub.archiveHint')
          : bt('hub.changeFilters')}
      </p>
    </div>
  )
}

function BoardList({
  boards,
  layout,
  pinnedIds,
  covers,
  archiveMode,
  getMeta,
  onSelectBoard,
  onTogglePin,
  onToggleArchive,
  onDeleteBoard,
  currentUserId,
  onCreateBoard,
}: {
  boards: BoardOptionViewModel[]
  layout: LayoutMode
  pinnedIds: string[]
  covers: Record<string, BoardHubCover>
  archiveMode: boolean
  getMeta: (board: BoardOptionViewModel) => BoardMeta
  onSelectBoard: (boardId: string) => void
  onTogglePin: (boardId: string) => void
  onToggleArchive: (boardId: string, archived: boolean) => void
  onDeleteBoard?: (boardId: string, boardName: string) => void
  currentUserId?: number | null
  onCreateBoard?: () => void
}) {
  if (boards.length === 0) {
    if (!archiveMode && onCreateBoard && layout === 'grid') {
      return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
          <CreateBoardTile onCreateBoard={onCreateBoard} />
        </div>
      )
    }
    return <EmptyState archiveMode={archiveMode} />
  }

  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-3">
        {boards.map((board) => (
          <BoardCard
            key={board.id}
            board={board}
            meta={getMeta(board)}
            archived={archiveMode}
            pinned={pinnedIds.includes(board.id)}
            cover={covers[board.id]}
            onSelectBoard={onSelectBoard}
            onTogglePin={onTogglePin}
            onToggleArchive={onToggleArchive}
            onDeleteBoard={onDeleteBoard}
            canDelete={currentUserId === board.ownerId}
          />
        ))}
        {!archiveMode && onCreateBoard ? <CreateBoardTile onCreateBoard={onCreateBoard} /> : null}
      </div>
    )
  }

  const midColumns = '@[600px]:grid-cols-[minmax(0,1fr)_110px_150px_80px]'
  const desktopColumns = '@[860px]:grid-cols-[minmax(200px,1fr)_110px_120px_140px_124px_80px]'
  const rowGrid = cx('grid grid-cols-[minmax(0,1fr)_80px] items-center gap-3 px-4', midColumns, desktopColumns)

  return (
    <div className="@container overflow-hidden rounded-[10px] border border-[#E6EAF1] bg-white">
      <div className={cx(rowGrid, 'h-10 whitespace-nowrap border-b border-[#E6EAF1] bg-[#FAFBFC] text-[13px] font-medium text-[#586174]')}>
        <span>{bt('hub.columns.name')}</span>
        <span className="hidden @[600px]:block">{bt('hub.columns.members')}</span>
        <span className="hidden @[860px]:block">{bt('hub.columns.status')}</span>
        <span className="hidden @[600px]:block">{bt('hub.columns.progress')}</span>
        <span className="hidden @[860px]:block">{bt('hub.columns.nearestDue')}</span>
        <span />
      </div>
      <ul className="divide-y divide-[#EEF0F3]">
        {boards.map((board) => {
          const meta = getMeta(board)
          const pinned = pinnedIds.includes(board.id)
          return (
            <li key={board.id}>
              <div
                className={cx(rowGrid, 'min-h-14 cursor-pointer py-2 transition-colors duration-[120ms] hover:bg-[#F6F7F9]', AXIS_UI.focus)}
                onClick={() => onSelectBoard(board.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter') onSelectBoard(board.id) }}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="scale-90"><BoardIcon boardId={board.id} muted={archiveMode} /></span>
                  <span className="min-w-0">
                    <span className={cx('block truncate text-[14px] font-medium leading-5', archiveMode ? 'text-[#586174]' : 'text-[#17202E]')}>{board.name}</span>
                    <span className="block truncate text-[12px] leading-4 text-[#586174]">{meta.ownerName}</span>
                  </span>
                </span>
                <span className="hidden items-center @[600px]:flex">
                  <MemberStack members={meta.members.length > 0 ? meta.members : [meta.ownerMember]} limit={3} />
                </span>
                <span className="hidden min-w-0 @[860px]:flex">
                  {archiveMode ? <StatusChip label={bt('hub.inArchive')} tone="neutral" /> : <StatusChip label={meta.status.label} tone={meta.status.tone} />}
                </span>
                <span className="hidden items-center gap-2 @[600px]:flex">
                  <Progress value={meta.progress} className="w-[88px]" />
                  <span className="text-[12px] font-medium tabular-nums text-[#17202E]">{Math.round(meta.progress)}%</span>
                </span>
                <span className="hidden truncate text-[13px] tabular-nums text-[#586174] @[860px]:block">{formatDate(board.nextDueAt || board.updatedAt, true)}</span>
                <span className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
                  {!archiveMode ? <PinButton pinned={pinned} boardName={board.name} onToggle={() => onTogglePin(board.id)} /> : null}
                  <BoardCardMenu
                    boardName={board.name}
                    archived={archiveMode}
                    canDelete={currentUserId === board.ownerId}
                    onOpen={() => onSelectBoard(board.id)}
                    onToggleArchive={() => onToggleArchive(board.id, !archiveMode)}
                    onDelete={onDeleteBoard ? () => onDeleteBoard(board.id, board.name) : undefined}
                  />
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      {onCreateBoard && !archiveMode ? (
        <div className="border-t border-[#E2E5EA] p-2">
          <button
            type="button"
            onClick={onCreateBoard}
            className={cx('flex h-9 w-full items-center gap-2 rounded-[6px] px-3 text-[14px] font-medium text-[#2458D3] transition-colors duration-[120ms] hover:bg-[#EDF2FF]', AXIS_UI.focus)}
          >
            <MaterialSymbol name="add" size={18} color="currentColor" />{bt('hub.createBoard')}</button>
        </div>
      ) : null}
    </div>
  )
}

const pluralMembers = (count: number) => {
  return bt('hub.members', { count })
}

function InviteButton({
  boards,
  onInvite,
}: {
  boards: BoardOptionViewModel[]
  onInvite: (boardId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => {
          if (boards.length === 1) {
            onInvite(boards[0].id)
            return
          }
          setOpen((value) => !value)
        }}
        aria-haspopup={boards.length > 1 ? 'menu' : undefined}
        aria-expanded={boards.length > 1 ? open : undefined}
        className={cx(AXIS_UI.secondaryButton, 'w-full justify-center')}
      >
        <MaterialSymbol name="person_add" size={18} color="currentColor" />
        {bt('hub.invite')}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+4px)] right-0 z-30 w-[240px] rounded-[8px] border border-[#E2E5EA] bg-white p-1 shadow-[0_8px_24px_rgba(23,32,46,0.12)]"
        >
          <p className="px-3 pb-1 pt-2 text-[12px] leading-4 text-[#586174]">{bt('hub.inviteWhich')}</p>
          <div className="max-h-[240px] overflow-y-auto">
            {boards.map((board) => (
              <button
                key={board.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  onInvite(board.id)
                }}
                className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] text-[#17202E] transition-colors duration-[120ms] hover:bg-[#F6F7F9]"
              >
                <span className="truncate">{board.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WeekAgenda({
  tasks,
  boardById,
  allMembers,
  onSelectBoard,
  onOpenTask,
  onInviteMembers,
  inviteBoards,
  wide = false,
}: {
  tasks: BoardTaskViewModel[]
  boardById: Map<string, BoardOptionViewModel>
  allMembers: BoardHubMember[]
  onSelectBoard: (boardId: string) => void
  onOpenTask?: (boardId: string, taskId: string) => void
  onInviteMembers?: (boardId: string) => void
  inviteBoards: BoardOptionViewModel[]
  wide?: boolean
}) {
  const navigate = useNavigate()
  const { t } = useTranslation('shell')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const shownMembers = allMembers.slice(0, 4)
  return (
    <aside className={wide ? 'grid h-fit grid-cols-1 items-start gap-3 md:grid-cols-2' : 'flex h-fit flex-col gap-3 2xl:sticky 2xl:top-0'}>
      <section className="rounded-[10px] border border-[#E6EAF1] bg-white p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold leading-6 text-[#17202E]">{bt('hub.thisWeek')}</h2>
          <button type="button" onClick={() => navigate('/calendar')} aria-label={t('navigation.calendar')} data-no-tooltip className={AXIS_UI.ghostIconButton}>
            <MaterialSymbol name="calendar_month" size={18} color="currentColor" />
          </button>
        </div>
        {tasks.length > 0 ? (
          <ol>
            {tasks.map((task) => {
              const due = new Date(task.dueAt)
              const dueDay = new Date(due)
              dueDay.setHours(0, 0, 0, 0)
              const dayDifference = Math.round((dueDay.getTime() - today.getTime()) / 86400000)
              const relative = dayDifference < 0 ? bt('goals.overdue') : dayDifference === 0 ? bt('taskDetail.history.today') : dayDifference === 1 ? bt('hub.tomorrow') : ''
              const urgent = dayDifference <= 0
              const weekday = formatSharedDate(due, { weekday: 'short' }).replace('.', '')
              const boardName = boardById.get(task.boardId)?.name
              return (
                <li key={task.id} className="border-t border-[#EEF0F3] first:border-t-0">
                  <button
                    type="button"
                    onClick={() => (onOpenTask ? onOpenTask(task.boardId, task.id) : onSelectBoard(task.boardId))}
                    aria-label={boardName ? bt('hub.openTaskOnBoard', { title: task.title, board: boardName }) : bt('hub.openTask', { title: task.title })}
                    className={cx('group grid w-full grid-cols-[40px_minmax(0,1fr)] items-center gap-3 rounded-[6px] py-2.5 text-left', AXIS_UI.focus)}
                  >
                    <span className={cx('flex h-11 w-10 flex-col items-center justify-center rounded-[8px] text-center', urgent ? 'bg-[#FFF1E6] text-[#9A3412]' : 'bg-[#F1F3F6] text-[#17202E]')}>
                      <span className="text-[10px] font-semibold uppercase leading-3">{weekday}</span>
                      <span className="text-[15px] font-semibold leading-[18px] tabular-nums">{due.getDate()}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="line-clamp-1 text-[13px] font-medium leading-5 text-[#17202E] transition-colors duration-[120ms] group-hover:text-[#2458D3]">{task.title}</span>
                      <span className="block truncate text-[12px] leading-4 text-[#586174]">
                        {relative ? <span className={cx('font-medium', dayDifference < 0 ? 'text-[#C2410C]' : 'text-[#9A3412]')}>{relative} · </span> : null}
                        {boardName}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="mt-2 rounded-[8px] bg-[#F6F7F9] px-4 py-5 text-center text-[13px] text-[#586174]">{bt('hub.noDeadlines')}</p>
        )}
      </section>
      <section className="flex flex-col gap-3 rounded-[10px] border border-[#E6EAF1] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold leading-6 text-[#17202E]">{bt('hub.team')}</h2>
          {allMembers.length > 0 ? <span className="text-[12px] tabular-nums text-[#586174]">{pluralMembers(allMembers.length)}</span> : null}
        </div>
        {shownMembers.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {shownMembers.map((member, index) => (
              <li key={member.userId} className="flex items-center gap-2.5">
                <Avatar member={member} index={index} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#17202E]">{member.name}</span>
              </li>
            ))}
            {allMembers.length > shownMembers.length ? <li className="pl-[38px] text-[12px] text-[#586174]">+{allMembers.length - shownMembers.length}</li> : null}
          </ul>
        ) : (
          <p className="text-[13px] text-[#586174]">{bt('hub.noMembers')}</p>
        )}
        {onInviteMembers && inviteBoards.length > 0 ? <InviteButton boards={inviteBoards} onInvite={onInviteMembers} /> : null}
      </section>
    </aside>
  )
}

export default function BoardProjectHub({
  boards,
  users = [],
  currentUserId,
  progressByBoardId = {},
  membersByBoardId = {},
  coversByBoardId = {},
  columnsByBoardId = {},
  weekTasks = [],
  archivedBoardIds,
  onArchiveBoard,
  onDeleteBoard,
  onSelectBoard,
  onOpenTask,
  onInviteMembers,
  onCreateBoard,
}: BoardProjectHubProps) {
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    const stored = readIds(PINNED_BOARD_IDS_KEY)
    const limited = Array.from(new Set(stored)).slice(0, MAX_PINNED_BOARDS)
    if (stored.length > MAX_PINNED_BOARDS) writeIds(PINNED_BOARD_IDS_KEY, limited)
    return limited
  })
  const [archivedIds, setArchivedIds] = useState<string[]>(() => archivedBoardIds ?? readIds(ARCHIVED_BOARD_IDS_KEY))
  const [notice, setNotice] = useState<ArchiveNotice | null>(null)
  const [pinMessage, setPinMessage] = useState('')
  const [mode, setMode] = useState<HubMode>('overview')
  const [layout, setLayout] = useState<LayoutMode>('grid')
  const [sort, setSort] = useState<SortMode>('updated_desc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [filtersAnchor, setFiltersAnchor] = useState<HTMLElement | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (archivedBoardIds) setArchivedIds(archivedBoardIds)
  }, [archivedBoardIds])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const archivedSet = useMemo(() => new Set(archivedIds), [archivedIds])
  const activeBoards = useMemo(() => boards.filter((board) => !archivedSet.has(board.id)), [archivedSet, boards])
  const archivedBoards = useMemo(() => boards.filter((board) => archivedSet.has(board.id)), [archivedSet, boards])

  const boardById = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards])
  const activePinnedIds = useMemo(
    () => pinnedIds.filter((id) => boardById.has(id) && !archivedSet.has(id)).slice(0, MAX_PINNED_BOARDS),
    [archivedSet, boardById, pinnedIds],
  )
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const allMembers = useMemo(() => {
    const byId = new Map<number, BoardHubMember>()
    Object.values(membersByBoardId).flat().forEach((member) => byId.set(member.userId, member))
    return Array.from(byId.values())
  }, [membersByBoardId])

  const featuredBoards = useMemo(() => {
    return activePinnedIds.map((id) => boardById.get(id)).filter(Boolean) as BoardOptionViewModel[]
  }, [activePinnedIds, boardById])

  useEffect(() => {
    try {
      window.localStorage.setItem(PINNED_BOARDS_KEY, JSON.stringify(featuredBoards.map((board) => ({ id: board.id, name: board.name }))))
    } catch {
      return
    }
    window.dispatchEvent(new Event(PINNED_BOARDS_CHANGED))
  }, [featuredBoards])

  const visibleBoards = useMemo(() => {
    const source = mode === 'archive' ? archivedBoards : activeBoards
    const query = search.trim().toLocaleLowerCase('ru-RU')
    const filtered = source.filter((board) => {
      if (mode === 'mine') {
        const isOwner = currentUserId != null && board.ownerId === currentUserId
        if (!isOwner) return false
      }
      if (statusFilter !== 'all' && boardStatus(board, columnsByBoardId[board.id] || []).key !== statusFilter) return false
      return !query
        || board.name.toLocaleLowerCase('ru-RU').includes(query)
        || board.ownerFullName.toLocaleLowerCase('ru-RU').includes(query)
    })
    filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'ru')
      if (sort === 'created_desc') return timeValue(b.createdAt) - timeValue(a.createdAt)
      if (sort === 'progress_desc') return (b.progress?.completionPercent || 0) - (a.progress?.completionPercent || 0)
      return timeValue(b.updatedAt || b.createdAt) - timeValue(a.updatedAt || a.createdAt)
    })
    if (mode === 'archive') return filtered
    const pinRank = (board: BoardOptionViewModel) => {
      const index = activePinnedIds.indexOf(board.id)
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    }
    return [...filtered].sort((a, b) => pinRank(a) - pinRank(b))
  }, [activeBoards, activePinnedIds, archivedBoards, columnsByBoardId, currentUserId, mode, search, sort, statusFilter])

  const agenda = useMemo(() => weekTasks
    .filter((task) => Boolean(task.dueAt) && boardById.has(task.boardId) && !archivedSet.has(task.boardId))
    .sort((a, b) => timeValue(a.dueAt) - timeValue(b.dueAt))
    .slice(0, 4), [archivedSet, boardById, weekTasks])

  const getMeta = (board: BoardOptionViewModel): BoardMeta => {
    const members = membersByBoardId[board.id] || []
    const ownerUser = usersById.get(board.ownerId)
    const ownerFromMembers = members.find((member) => member.userId === board.ownerId)
    const ownerName = board.ownerFullName || ownerUser?.fullName || ownerFromMembers?.name || bt('hub.noOwner')
    const total = board.progress?.totalTasks
      ?? (columnsByBoardId[board.id] || []).reduce((sum, column) => sum + column.totalTasks, 0)
    return {
      members,
      ownerName,
      ownerMember: {
        userId: board.ownerId,
        name: ownerName,
        initials: ownerUser?.initials || ownerFromMembers?.initials || initials(ownerName),
        avatarUrl: ownerUser?.avatarUrl || ownerFromMembers?.avatarUrl,
      },
      total,
      completed: board.progress?.completedTasks || 0,
      progress: progressByBoardId[board.id] ?? board.progress?.completionPercent ?? 0,
      status: boardStatus(board, columnsByBoardId[board.id] || []),
    }
  }

  const togglePin = (boardId: string) => {
    if (activePinnedIds.includes(boardId)) {
      const next = activePinnedIds.filter((id) => id !== boardId)
      setPinMessage('')
      writeIds(PINNED_BOARD_IDS_KEY, next)
      setPinnedIds(next)
      return
    }
    if (activePinnedIds.length >= MAX_PINNED_BOARDS) {
      setPinMessage(bt('hub.pinLimit'))
      return
    }
    const next = [boardId, ...activePinnedIds]
    setPinMessage('')
    writeIds(PINNED_BOARD_IDS_KEY, next)
    setPinnedIds(next)
  }

  const applyArchived = (boardId: string, archived: boolean) => {
    setArchivedIds((current) => {
      const next = archived
        ? Array.from(new Set([boardId, ...current]))
        : current.filter((id) => id !== boardId)
      if (!archivedBoardIds) writeIds(ARCHIVED_BOARD_IDS_KEY, next)
      return next
    })
  }

  const setBoardArchived = async (boardId: string, archived: boolean) => {
    const name = boardById.get(boardId)?.name || bt('page.board')
    applyArchived(boardId, archived)

    if (archived && pinnedIds.includes(boardId)) {
      const nextPinned = pinnedIds.filter((id) => id !== boardId)
      writeIds(PINNED_BOARD_IDS_KEY, nextPinned)
      setPinnedIds(nextPinned)
      setPinMessage('')
    }

    setNotice({ kind: archived ? 'archived' : 'restored', boardId, name })

    try {
      await onArchiveBoard?.(boardId, archived)
    } catch {
      applyArchived(boardId, !archived)
      setNotice({ kind: 'error', boardId, name })
    }
  }

  const mineCount = activeBoards.filter((board) => currentUserId != null && board.ownerId === currentUserId).length
  const tabs: Array<[HubMode, string, number]> = [
    ['overview', bt('hub.tabs.overview'), activeBoards.length],
    ['mine', bt('hub.tabs.mine'), mineCount],
    ['archive', bt('hub.tabs.archive'), archivedBoards.length],
  ]
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (sort !== 'updated_desc' ? 1 : 0)
  const filterItemClass = (active: boolean) => cx(
    'flex h-9 w-full items-center justify-between gap-2.5 px-3 text-left text-[14px] transition-colors duration-[120ms] hover:bg-[#F6F7F9] focus-visible:bg-[#F6F7F9] focus-visible:outline-none',
    active ? 'font-medium text-[#17202E]' : 'text-[#17202E]',
  )

  if (boards.length === 0) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto">
        <BoardsEmptyState onCreateBoard={onCreateBoard} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <PageHeader title={bt('hub.title')} description={bt('hub.subtitle')} className="pb-5 min-[1101px]:pb-10" actions={
        <>
          {onCreateBoard ? (
            <button type="button" onClick={onCreateBoard} className={cx(AXIS_UI.primaryButton, 'ts-button--compact min-[1101px]:!hidden')}>
              <MaterialSymbol name="add" size={18} color="currentColor" />
              {bt('hub.newBoard')}
            </button>
          ) : null}
        </>
      } />

      <div className="flex shrink-0 flex-wrap items-end gap-y-3">
        <nav className="flex min-w-[220px] flex-1 items-center gap-5 overflow-x-auto border-b border-[#E2E5EA] [scrollbar-width:none]" aria-label={bt('hub.sections')}>
          {tabs.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-current={mode === value ? 'page' : undefined}
              className={cx(AXIS_UI.tab, '!h-10', mode === value ? AXIS_UI.tabActive : AXIS_UI.tabIdle)}
            >
              {label}
              <span className="text-[12px] font-normal tabular-nums text-[#7B8494]">{count}</span>
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-b border-[#E2E5EA] pb-2 pl-4 max-sm:w-full max-sm:border-b-0 max-sm:pb-0 max-sm:pl-0">
          <label className={cx(AXIS_UI.inputShell, 'w-full flex-1 sm:w-[240px] sm:flex-none')}>
            <MaterialSymbol name="search" size={16} color="#586174" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={bt('hub.search')}
              aria-label={bt('hub.search')}
              className={AXIS_UI.input}
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} className="shrink-0 text-[#586174] hover:text-[#17202E]" aria-label={bt('hub.clearSearch')}>
                <MaterialSymbol name="close" size={16} color="currentColor" />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={Boolean(filtersAnchor)}
            onClick={(event) => setFiltersAnchor(filtersAnchor ? null : event.currentTarget)}
            className={activeFilterCount ? AXIS_UI.secondaryButtonActive : AXIS_UI.secondaryButton}
          >
            <MaterialSymbol name="filter_list" size={16} color="currentColor" />
            {bt('hub.filters')}
            {activeFilterCount > 0 ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-[#2458D3] px-1 text-[12px] text-white">{activeFilterCount}</span> : null}
          </button>
          <ViewToggle
            value={layout}
            options={[
              { value: 'grid', icon: 'grid_view', label: bt('hub.grid') },
              { value: 'list', icon: 'view_list', label: bt('page.list') },
            ]}
            onChange={setLayout}
          />
          <FloatingMenu
            anchor={filtersAnchor}
            open={Boolean(filtersAnchor)}
            onClose={() => setFiltersAnchor(null)}
            className="!min-w-0 w-[240px] !rounded-[8px] border border-[#E2E5EA] !py-1 !shadow-[0_12px_32px_rgba(23,32,46,0.12)]"
          >
            <div className="px-3 pb-1 pt-2 text-[12px] font-medium text-[#7B8494]">{bt('list.status')}</div>
            {([['all', bt('hub.statusAll')], ['active', bt('status.IN_PROGRESS')], ['review', bt('hub.status.review')], ['planned', bt('hub.status.planned')], ['done', bt('status.DONE')]] as const).map(([value, label]) => (
              <button key={value} type="button" role="menuitemradio" aria-checked={statusFilter === value} className={filterItemClass(statusFilter === value)} onClick={() => setStatusFilter(value)}>
                <span className="truncate">{label}</span>
                {statusFilter === value ? <Check className="h-4 w-4 shrink-0 text-[#2458D3]" strokeWidth={2} /> : null}
              </button>
            ))}
            <div className="my-1 h-px bg-[#E2E5EA]" />
            <div className="px-3 pb-1 pt-2 text-[12px] font-medium text-[#7B8494]">{bt('hub.sort.label')}</div>
            {([['updated_desc', bt('hub.sort.updated')], ['created_desc', bt('hub.sort.created')], ['progress_desc', bt('hub.sort.progress')], ['name', bt('hub.sort.name')]] as const).map(([value, label]) => (
              <button key={value} type="button" role="menuitemradio" aria-checked={sort === value} className={filterItemClass(sort === value)} onClick={() => setSort(value)}>
                <span className="truncate">{label}</span>
                {sort === value ? <Check className="h-4 w-4 shrink-0 text-[#2458D3]" strokeWidth={2} /> : null}
              </button>
            ))}
            {activeFilterCount > 0 ? (
              <>
                <div className="my-1 h-px bg-[#E2E5EA]" />
                <button
                  type="button"
                  onClick={() => { setStatusFilter('all'); setSort('updated_desc') }}
                  className="flex h-9 w-full items-center gap-2.5 px-3 text-left text-[14px] text-[#2458D3] transition-colors duration-[120ms] hover:bg-[#F6F7F9] focus-visible:bg-[#F6F7F9] focus-visible:outline-none"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {bt('filters.resetShort')}
                </button>
              </>
            ) : null}
          </FloatingMenu>
        </div>
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-6 pr-0.5">
        <div className={cx('grid min-w-0 grid-cols-1 gap-4', layout === 'grid' && 'xl:grid-cols-[minmax(0,1fr)_300px]')}>
          <div className="min-w-0 space-y-6">

            <section>
              {pinMessage ? <p className="mb-3 text-[12px] font-medium text-[#946000]">{pinMessage}</p> : null}
              <BoardList
                boards={visibleBoards}
                layout={layout}
                pinnedIds={activePinnedIds}
                covers={coversByBoardId}
                archiveMode={mode === 'archive'}
                getMeta={getMeta}
                onSelectBoard={onSelectBoard}
                onTogglePin={togglePin}
                onToggleArchive={setBoardArchived}
                onDeleteBoard={onDeleteBoard}
                currentUserId={currentUserId}
                onCreateBoard={onCreateBoard}
              />
            </section>
          </div>
          <WeekAgenda
            tasks={agenda}
            boardById={boardById}
            allMembers={allMembers}
            onSelectBoard={onSelectBoard}
            onOpenTask={onOpenTask}
            onInviteMembers={onInviteMembers}
            inviteBoards={activeBoards}
            wide={layout === 'list'}
          />
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-3 rounded-[8px] bg-[#17202E] px-4 py-3 text-[14px] text-white shadow-[0_8px_24px_rgba(23,32,46,0.24)]"
        >
          <MaterialSymbol
            name={notice.kind === 'error' ? 'error' : notice.kind === 'archived' ? 'archive' : 'history'}
            size={18}
            color="currentColor"
          />
          <span className="min-w-0 truncate">
            {notice.kind === 'archived' && <>{bt('hub.notice.archived', { name: notice.name })}</>}
            {notice.kind === 'restored' && <>{bt('hub.notice.restored', { name: notice.name })}</>}
            {notice.kind === 'error' && <>{bt('hub.notice.error', { name: notice.name })}</>}
          </span>
          {notice.kind !== 'error' ? (
            <button
              type="button"
              onClick={() => setBoardArchived(notice.boardId, notice.kind !== 'archived')}
              className="shrink-0 font-medium text-[#8BAEFF] transition-colors duration-[120ms] hover:text-white"
            >
              {bt('hub.undo')}
            </button>
          ) : null}
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-[#B3BDCD] hover:text-white" aria-label={bt('close')}>
            <MaterialSymbol name="close" size={16} color="currentColor" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
