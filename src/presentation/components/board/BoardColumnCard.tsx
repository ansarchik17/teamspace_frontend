import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import type { BoardColumnViewModel } from '../../view-models/BoardViewModel'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AxisAvatar from './AxisAvatar'
import { KANBAN_COLUMN_BG } from './kanbanTheme'
import { isDoneColumn } from '../../../shared/ui/axisTokens'
import { DueDate, PriorityChip } from './TaskMeta'
import { bt } from './boardText'

interface BoardColumnCardProps {
  column: BoardColumnViewModel
  columnIndex?: number
  assigneeNamesById?: Map<number, string>
  assigneeAvatarsById?: Map<number, string>
  activeDragColumnId: string
  columnDropTargetId: string
  onColumnDrop: (targetColumnId: string) => void
  onColumnDragHover: (columnId: string) => void
  onColumnDragHoverLeave: () => void
  onTaskDrop: (targetColumnId: string) => void
  onTaskDragStart: (taskId: string, sourceColumnId: string) => void
  onTaskDragEnd: () => void
  onColumnDragStart: (columnId: string) => void
  onColumnDragEnd: () => void
  onTaskOpen: (taskId: string) => void
  onCreateTask: (columnId: string) => void
  onRenameColumn: (columnId: string, currentName: string, currentKey: string) => void
  onDeleteColumn: (columnId: string) => void
  canManageTasks?: boolean
  canManageColumn?: boolean
  isTaskDragging?: boolean
  onLoadMore?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
}

const toInitials = (value: string): string => {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '??'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function AssigneeAvatar({ id, fullName, avatarUrl }: { id: number; fullName?: string; avatarUrl?: string }) {
  const label = fullName?.trim() || `User ${id}`
  const initials = fullName ? toInitials(fullName) : String(id).slice(-2)

  return (
    <>
      <AxisAvatar initials={initials} src={avatarUrl} size={24} seed={id} />
      <span className="sr-only">{label}</span>
    </>
  )
}

/** Однострочное превью описания без markdown-разметки */
const toPlainPreview = (value: string): string =>
  value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function StackedAssignees({
  ids,
  assigneeNamesById,
  assigneeAvatarsById,
}: {
  ids: number[]
  assigneeNamesById?: Map<number, string>
  assigneeAvatarsById?: Map<number, string>
}) {
  if (!ids || ids.length === 0) return null

  const visibleIds = ids.slice(0, 3)
  const remainingCount = ids.length - visibleIds.length

  return (
    <div className="flex shrink-0 items-center -space-x-1">
      {visibleIds.map((id) => (
        <div key={id} className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-white ring-2 ring-white">
          <AssigneeAvatar
            id={id}
            fullName={assigneeNamesById?.get(id)}
            avatarUrl={assigneeAvatarsById?.get(id)}
          />
        </div>
      ))}
      {remainingCount > 0 ? (
        <div className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#F1F2F4] px-1 text-[11px] font-semibold tabular-nums text-[#586174] ring-2 ring-white">
          +{remainingCount}
        </div>
      ) : null}
    </div>
  )
}

function MetaCount({ icon, count, label }: { icon: string; count: number; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] leading-4 tabular-nums text-[#586174]">
      <MaterialSymbol name={icon} size={14} color="currentColor" />
      {count}
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Метка: нейтральная прозрачно-серая плашка, цвет метки — только точкой */
function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex h-6 max-w-[160px] shrink-0 items-center gap-1.5 rounded-[6px] bg-[#17202E]/[0.05] px-2 text-[12px] font-medium text-[#586174]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color || '#7B8494' }} />
      <span className="truncate">{name}</span>
    </span>
  )
}

function ColumnHeaderMenu({
  canManageColumn,
  onRename,
  onDelete,
}: {
  canManageColumn: boolean
  onRename: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!canManageColumn) return null

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#17202E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2458D3]"
        aria-label={bt('column.settings')}
      >
        <MaterialSymbol name="more_horiz" size={18} color="currentColor" />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[176px] rounded-[8px] border border-[#E2E5EA] bg-white p-1 shadow-[0_8px_24px_rgba(23,32,46,0.12)]">
          <button
            type="button"
            onClick={() => {
              onRename()
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] text-[#17202E] transition-colors duration-[120ms] hover:bg-[#F6F7F9]"
          >
            <MaterialSymbol name="edit" size={15} color="currentColor" />
            {bt('column.rename')}
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete()
              setOpen(false)
            }}
            className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] text-[#C03437] transition-colors duration-[120ms] hover:bg-[#FFF0F0]"
          >
            <MaterialSymbol name="delete" size={15} color="currentColor" />
            {bt('delete')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export default function BoardColumnCard({
  column,
  assigneeNamesById,
  assigneeAvatarsById,
  activeDragColumnId,
  columnDropTargetId,
  onColumnDrop,
  onColumnDragHover,
  onColumnDragHoverLeave,
  onTaskDrop,
  onTaskDragStart,
  onTaskDragEnd,
  onColumnDragStart,
  onColumnDragEnd,
  onTaskOpen,
  onCreateTask,
  onRenameColumn,
  onDeleteColumn,
  canManageTasks = true,
  canManageColumn = true,
  isTaskDragging = false,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: BoardColumnCardProps) {
  const [isTaskOver, setIsTaskOver] = useState(false)
  const sectionRef = useRef<HTMLElement | null>(null)
  const taskListRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const isColumnBeingDragged = activeDragColumnId === column.id
  const isColumnDropTarget =
    !!activeDragColumnId && !isColumnBeingDragged && columnDropTargetId === column.id

  const setupObserver = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }

      if (!node || !hasMore || isLoadingMore || !onLoadMore) return

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            onLoadMore()
          }
        },
        {
          root: taskListRef.current,
          rootMargin: '100px',
          threshold: 0,
        },
      )
      observerRef.current.observe(node)
    },
    [hasMore, isLoadingMore, onLoadMore],
  )

  const doneColumn = isDoneColumn(column.key)

  return (
    <section
      ref={sectionRef}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        if (activeDragColumnId && !isColumnBeingDragged) {
          onColumnDragHover(column.id)
        }

        if (isTaskDragging && taskListRef.current) {
          const container = taskListRef.current
          const rect = container.getBoundingClientRect()
          const threshold = 100
          const scrollSpeed = 25

          if (event.clientY < rect.top + threshold) {
            container.scrollTop -= scrollSpeed
          } else if (event.clientY > rect.bottom - threshold) {
            container.scrollTop += scrollSpeed
          }
        }
      }}
      onDragLeave={() => {
        if (isColumnDropTarget) {
          onColumnDragHoverLeave()
        }
      }}
      onDrop={() => {
        onColumnDragHoverLeave()
        onColumnDrop(column.id)
      }}
      className={[
        'flex h-full max-h-full min-h-[160px] w-full flex-col rounded-[8px] border border-[#E2E5EA] p-2 md:w-[288px] md:shrink-0',
        'transition-[opacity,box-shadow,border-color] duration-[120ms]',
        isColumnBeingDragged ? 'opacity-60' : '',
        isColumnDropTarget ? 'border-[#2458D3] ring-2 ring-[#2458D3]/20' : '',
      ].join(' ')}
      style={{ backgroundColor: KANBAN_COLUMN_BG }}
    >
      <div
        className={`flex shrink-0 items-center gap-2 px-2 pb-2 pt-1 ${canManageColumn ? 'cursor-grab active:cursor-grabbing' : ''}`}
        draggable={canManageColumn}
        onDragStart={
          canManageColumn
            ? (e: DragEvent) => {
                e.stopPropagation()
                e.dataTransfer.effectAllowed = 'move'
                if (sectionRef.current) {
                  const { width, height } = sectionRef.current.getBoundingClientRect()
                  e.dataTransfer.setDragImage(sectionRef.current, width / 2, Math.min(height / 2, 120))
                }
                onColumnDragStart(column.id)
              }
            : undefined
        }
        onDragEnd={onColumnDragEnd}
      >
        <h3 className="min-w-0 truncate text-[14px] font-semibold leading-5 text-[#17202E]">{column.name}</h3>
        <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[12px] font-medium tabular-nums text-[#586174]">
          {column.totalTasks}
        </span>
        <span className="min-w-0 flex-1" />
        {canManageTasks ? (
          <button
            type="button"
            onClick={() => onCreateTask(column.id)}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#17202E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2458D3]"
            aria-label={bt('column.addTaskTo', { name: column.name })}
          >
            <MaterialSymbol name="add" size={18} color="currentColor" />
          </button>
        ) : null}
        <ColumnHeaderMenu
          canManageColumn={canManageColumn}
          onRename={() => onRenameColumn(column.id, column.name, column.key)}
          onDelete={() => onDeleteColumn(column.id)}
        />
      </div>

      <div
        ref={taskListRef}
        className={[
          'flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-[6px] p-0.5',
          '[scrollbar-gutter:stable] [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin]',
          'outline-dashed outline-2 -outline-offset-2 transition-[background-color,outline-color] duration-[120ms]',
          isTaskOver && isTaskDragging
            ? 'bg-[#EDF2FF] outline-[#2458D3]/40'
            : 'outline-transparent',
        ].join(' ')}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDragEnter={(e) => {
          if (isTaskDragging) {
            e.preventDefault()
            setIsTaskOver(true)
          }
        }}
        onDragLeave={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < rect.left ||
            e.clientX >= rect.right ||
            e.clientY < rect.top ||
            e.clientY >= rect.bottom
          ) {
            setIsTaskOver(false)
          }
        }}
        onDrop={() => {
          setIsTaskOver(false)
          onTaskDrop(column.id)
        }}
      >
        {column.tasks.map((task) => {
          const taskKeyLabel = task.taskKey?.trim() || ''
          const descriptionPreview = task.description ? toPlainPreview(task.description) : ''
          const attachmentsCount = task.attachmentsCount || task.attachments?.length || 0
          const subtasksCount = task.subtasks?.length ?? 0
          const assigneesCount = task.assigneeIds?.length ?? 0
          const hasFooter = Boolean(task.dueAt) || attachmentsCount > 0 || subtasksCount > 0 || assigneesCount > 0

          return (
            <button
              key={task.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.stopPropagation()
                e.dataTransfer.effectAllowed = 'move'
                const target = e.currentTarget as HTMLElement
                if (target) {
                  e.dataTransfer.setDragImage(target, 150, 40)
                }
                onTaskDragStart(task.id, column.id)
              }}
              onDragEnd={onTaskDragEnd}
              onClick={() => onTaskOpen(task.id)}
              aria-label={
                taskKeyLabel
                  ? bt('column.openTaskKey', { key: taskKeyLabel, title: task.title })
                  : bt('hub.openTask', { title: task.title })
              }
              className={[
                'group relative flex w-full shrink-0 cursor-pointer flex-col rounded-[8px] border border-[#E2E5EA] bg-white px-3.5 py-3.5 text-left',
                'transition-[border-color,box-shadow] duration-[120ms]',
                'hover:border-[#C4C9D2] hover:shadow-[0_2px_8px_rgba(23,32,46,0.06)]',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2458D3]',
                'active:cursor-grabbing',
              ].join(' ')}
            >
              <div className="mb-3 flex w-full select-none items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {doneColumn ? (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EDF8F1] text-[#16734B]"
                    >
                      <MaterialSymbol name="check" size={14} color="currentColor" />
                      <span className="sr-only">{bt('status.DONE')}</span>
                    </span>
                  ) : (
                    <PriorityChip priority={task.priority} />
                  )}
                </div>
                {taskKeyLabel ? (
                  <span className="shrink-0 pt-1 text-[12px] font-medium leading-4 tabular-nums text-[#586174]">
                    {taskKeyLabel}
                  </span>
                ) : null}
              </div>

              <p className="line-clamp-2 select-none break-words text-left text-[14px] font-semibold leading-5 text-[#17202E]">
                {task.title}
              </p>

              {descriptionPreview ? (
                <p className="mt-1 line-clamp-1 select-none break-words text-[12px] leading-4 text-[#586174]">
                  {descriptionPreview}
                </p>
              ) : null}

              {task.labels?.length ? (
                <div className="mt-3 flex w-full select-none flex-wrap items-center gap-1.5">
                  {task.labels.slice(0, 2).map((label) => (
                    <LabelChip key={label.id} name={label.name} color={label.color} />
                  ))}
                  {task.labels.length > 2 ? (
                    <span className="text-[12px] font-medium tabular-nums text-[#586174]">
                      +{task.labels.length - 2}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {hasFooter ? (
                <div className="mt-3.5 flex w-full shrink-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    {attachmentsCount > 0 ? <MetaCount icon="attach_file" count={attachmentsCount} label={bt('column.attachments')} /> : null}
                    {subtasksCount > 0 ? <MetaCount icon="subdirectory_arrow_right" count={subtasksCount} label={bt('taskDetail.subtasks')} /> : null}
                    {task.dueAt ? <DueDate dueAt={task.dueAt} dueAtLabel={task.dueAtLabel} done={doneColumn} /> : null}
                  </div>
                  <StackedAssignees
                    ids={task.assigneeIds}
                    assigneeNamesById={assigneeNamesById}
                    assigneeAvatarsById={assigneeAvatarsById}
                  />
                </div>
              ) : null}
            </button>
          )
        })}

        {hasMore ? (
          <div ref={setupObserver} className="flex h-10 shrink-0 items-center justify-center">
            {isLoadingMore ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#2458D3]/60 border-t-transparent" aria-label={bt('column.loading')} />
            ) : null}
          </div>
        ) : null}

        {canManageTasks ? (
          <button
            type="button"
            onClick={() => onCreateTask(column.id)}
            className="inline-flex h-9 w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] px-2 text-[14px] font-medium text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#2458D3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2458D3]"
          >
            <MaterialSymbol name="add" size={18} color="currentColor" />
            {bt('column.addTask')}
          </button>
        ) : null}
      </div>

    </section>
  )
}
