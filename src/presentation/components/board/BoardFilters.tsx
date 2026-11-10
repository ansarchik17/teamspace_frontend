import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardOptionViewModel, BoardSprintViewModel, BoardUserViewModel } from '../../view-models/BoardViewModel'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppSelect from '../../../shared/ui/AppSelect'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import BoardDatePicker from './BoardDatePicker'
import { bt } from './boardText'

interface BoardFiltersProps {
  boards: BoardOptionViewModel[]
  users?: BoardUserViewModel[]
  selectedBoardId: string
  sprintOptions: BoardSprintViewModel[]
  selectedSprintId: string
  search: string
  filterUserId: string
  filterAuthorId: string
  filterStatus: string
  filterDate: string
  filterLabelId?: string
  labels?: Array<{ id: string, name: string }>
  filterProjectId?: string
  projects?: Array<{ id: string, name: string }>
  onFilterProjectChange?: (value: string) => void
  onBoardChange: (value: string) => void
  onSprintChange: (value: string) => void
  onSearchChange: (value: string) => void
  onFilterUserChange: (value: string) => void
  onFilterAuthorChange: (value: string) => void
  onFilterStatusChange: (value: string) => void
  onFilterDateChange: (value: string) => void
  onFilterLabelChange?: (value: string) => void
  onApplyFilters: () => void
  onResetFilters: () => void
  // injected from BoardPage for toolbar integration
  boardName?: string
  totalTasks?: number
  isRefreshing?: boolean
  onRefresh?: () => void
  appearance?: 'classic' | 'modern'
}

type FilterChipProps = {
  label: string
  active: boolean
  children: React.ReactNode
}

function FilterSection({ label, active, children }: FilterChipProps) {
  return (
    <div
      className={`relative flex items-center rounded-lg border px-0.5 transition-all ${
        active
          ? 'border-[#2458D3] bg-[#EEF2FF]'
          : 'border-[#DDE3EE] bg-white hover:border-[#B8C8DD]'
      }`}
      aria-label={label}
    >
      {children}
      {active && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-2 w-2 rounded-full bg-[#2458D3]" />
      )}
    </div>
  )
}

const STATUS_OPTIONS = [
  { value: '', get label() { return bt('filters.allStatuses') } },
  { value: 'TODO', get label() { return bt('status.TODO') } },
  { value: 'IN_PROGRESS', get label() { return bt('status.IN_PROGRESS') } },
  { value: 'TEST', get label() { return bt('hub.status.review') } },
  { value: 'DONE', get label() { return bt('status.DONE') } },
]

export default function BoardFilters({
  boards,
  users = [],
  selectedBoardId,
  sprintOptions,
  selectedSprintId,
  search,
  filterUserId,
  filterAuthorId,
  filterStatus,
  filterDate,
  filterLabelId = '',
  labels = [],
  filterProjectId = '',
  projects = [],
  onFilterProjectChange,
  onBoardChange,
  onSprintChange,
  onSearchChange,
  onFilterUserChange,
  onFilterAuthorChange,
  onFilterStatusChange,
  onFilterDateChange,
  onFilterLabelChange,
  onApplyFilters,
  onResetFilters,
  boardName = bt('page.board'),
  totalTasks = 0,
  appearance = 'classic',
}: BoardFiltersProps) {
  const isModern = appearance === 'modern'
  const pillBtn = AXIS_UI.secondaryButton
  const pillBtnActive = AXIS_UI.secondaryButtonActive
  const [desktopFilterOpen, setDesktopFilterOpen] = useState(false)
  const desktopFilterRef = useRef<HTMLDivElement | null>(null)

  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (selectedSprintId) count++
    if (filterUserId) count++
    if (filterAuthorId) count++
    if (filterStatus) count++
    if (filterDate) count++
    if (filterLabelId) count++
    if (filterProjectId) count++
    if (search.trim()) count++
    return count
  }, [selectedSprintId, filterUserId, filterAuthorId, filterStatus, filterDate, search, filterLabelId, filterProjectId])

  const compactFiltersCount = useMemo(() => {
    let count = 0
    if (filterUserId) count++
    if (filterAuthorId) count++
    if (filterStatus) count++
    if (filterDate) count++
    if (filterLabelId) count++
    if (filterProjectId) count++
    return count
  }, [filterDate, filterStatus, filterUserId, filterAuthorId, filterLabelId, filterProjectId])

  useEffect(() => {
    if (!desktopFilterOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (!desktopFilterRef.current) return
      if (!desktopFilterRef.current.contains(event.target as Node)) {
        setDesktopFilterOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDesktopFilterOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [desktopFilterOpen])

  return (
    <>
      {/* ── Desktop toolbar ─────────────────────────────────────────── */}
      <div className={`flex items-center ${isModern ? 'w-full flex-wrap justify-start gap-2' : 'min-w-0 flex-1 gap-2'}`}>

        {/* Board name breadcrumb */}
        <div className={`hidden shrink-0 items-center gap-2 sm:flex ${isModern ? '!hidden' : ''}`}>
          <div className="flex h-7 items-center gap-1.5 rounded-lg bg-[#F0F4FA] px-2.5">
            <MaterialSymbol name="view_kanban" size={14} color="#2458D3" />
            <span className="max-w-[140px] truncate text-xs font-semibold text-[#0A1628]">{boardName}</span>
            <span className="text-[10px] text-[#8497B4]">· {totalTasks}</span>
          </div>
        </div>

        <div className={`hidden h-4 w-px bg-[#DDE3EE] sm:block ${isModern ? '!hidden' : ''}`} />

        {/* Board selector */}
        <div className={`hidden lg:block ${isModern ? '!hidden' : ''}`}>
          <FilterSection label={bt('filters.boardSelect')} active={false}>
            <AppSelect
              value={selectedBoardId}
              options={boards.map((b) => ({ value: b.id, label: b.name }))}
              onChange={onBoardChange}
              ariaLabel={bt('filters.boardSelect')}
              searchable
              searchPlaceholder={bt('filters.boardSearch')}
              buttonClassName="!h-8 !rounded-lg !border-0 !bg-transparent !px-2 !text-xs !font-medium !text-[#374C6B] hover:!text-[#2458D3] min-w-[170px] max-w-[260px]"
              menuClassName="!w-[320px] max-w-[80vw]"
            />
          </FilterSection>
        </div>

        {/* Sprint chip */}
        <div className={`${isModern ? 'order-3 hidden md:block' : 'hidden lg:block'}`}>
          {isModern ? (
            <AppSelect
              value={selectedSprintId}
              options={[{ value: '', label: bt('filters.allSprints') }, ...sprintOptions.map((s) => ({ value: s.id, label: s.name }))]}
              onChange={onSprintChange}
              ariaLabel={bt('createTask.sprint')}
              showButtonAvatar={false}
              showOptionAvatar={false}
              className="min-w-[150px]"
              buttonClassName="!h-9 !min-w-0 !rounded-[6px] !border !border-[#E2E5EA] !bg-white !px-3 !text-[14px] !font-medium !text-[#17202E] !shadow-[0_1px_2px_rgba(23,32,46,0.04)] hover:!border-[#C4C9D2] hover:!bg-[#F6F7F9]"
              menuClassName="!w-[240px] min-w-[240px] max-w-[320px]"
            />
          ) : false ? (
            <div className={selectedSprintId ? pillBtnActive : pillBtn}>
              <span className="font-normal text-[#9CA3AF]">{bt('filters.sortLabel')}</span>
              <AppSelect
                value={selectedSprintId}
                options={[{ value: '', label: bt('createTask.sprint') }, ...sprintOptions.map((s) => ({ value: s.id, label: s.name }))]}
                onChange={onSprintChange}
                ariaLabel={bt('createTask.sprint')}
                className="min-w-[120px]"
                buttonClassName="!h-8 !min-w-0 !rounded-full !border-0 !bg-transparent !px-1 !text-[13px] !font-normal !text-[#374151] hover:!text-[#111827]"
                menuClassName="!w-[240px] min-w-[240px] max-w-[320px]"
              />
            </div>
          ) : (
            <FilterSection label={bt('createTask.sprintSelect')} active={Boolean(selectedSprintId)}>
              <AppSelect
                value={selectedSprintId}
                options={[{ value: '', label: bt('filters.allSprints') }, ...sprintOptions.map((s) => ({ value: s.id, label: s.name }))]}
                onChange={onSprintChange}
                ariaLabel={bt('createTask.sprint')}
                buttonClassName="!h-8 !rounded-lg !border-0 !bg-transparent !px-2 !text-xs !font-medium !text-[#374C6B] hover:!text-[#2458D3] min-w-[90px]"
              />
            </FilterSection>
          )}
        </div>

        {/* Jira-like filter dropdown */}
        <div className={`relative ${isModern ? 'order-2' : 'hidden lg:block'}`} ref={desktopFilterRef}>
          <button
            type="button"
            onClick={() => setDesktopFilterOpen((prev) => !prev)}
            className={
              isModern
                ? compactFiltersCount > 0
                  ? pillBtnActive
                  : pillBtn
                : `relative inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition ${
                    compactFiltersCount > 0
                      ? 'border-[#2458D3] bg-[#EEF2FF] text-[#2458D3]'
                      : 'border-[#DDE3EE] bg-white text-[#374C6B] hover:border-[#2458D3] hover:text-[#2458D3]'
                  }`
            }
          >
            <MaterialSymbol name="filter_list" size={16} color="currentColor" />
            {bt('filters.filter')}
            {compactFiltersCount > 0 ? (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2458D3] px-1.5 text-[12px] font-medium tabular-nums text-white">
                {compactFiltersCount}
              </span>
            ) : null}
          </button>

          {desktopFilterOpen ? (
            <div className="absolute right-0 top-[calc(100%+8px)] z-[420] w-[360px] max-w-[calc(100vw-32px)] rounded-[8px] border border-[#E2E5EA] bg-white p-4 shadow-[0_8px_24px_rgba(23,32,46,0.12)]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[14px] font-semibold text-[#17202E]">{bt('filters.filter')}</p>
                {compactFiltersCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      onResetFilters()
                      setDesktopFilterOpen(false)
                    }}
                    className="text-[14px] font-medium text-[#2458D3] hover:text-[#1D49B3]"
                  >
                    {bt('filters.clear')}
                  </button>
                ) : null}
              </div>

              <div className="space-y-3">
                {isModern ? (
                  <label className="flex flex-col gap-1 md:hidden">
                    <span className="text-[12px] font-medium text-[#586174]">{bt('createTask.sprint')}</span>
                    <AppSelect
                      value={selectedSprintId}
                      options={[{ value: '', label: bt('filters.allSprints') }, ...sprintOptions.map((s) => ({ value: s.id, label: s.name }))]}
                      onChange={onSprintChange}
                      ariaLabel={bt('createTask.sprint')}
                      showButtonAvatar={false}
                      showOptionAvatar={false}
                    />
                  </label>
                ) : null}
                {onFilterProjectChange ? (
                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-medium text-[#586174]">{bt('createTask.project')}</span>
                    <AppSelect
                      value={filterProjectId}
                      options={[
                        { value: '', label: bt('filters.allProjects') },
                        ...projects.map((project) => ({ value: project.id, label: project.name })),
                        { value: '__none__', label: bt('createTask.noProject') },
                      ]}
                      onChange={onFilterProjectChange}
                      ariaLabel={bt('createTask.project')}
                      searchable={projects.length > 6}
                      searchPlaceholder={bt('filters.projectSearch')}
                      showButtonAvatar={false}
                      showOptionAvatar={false}
                    />
                  </label>
                ) : null}

                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#586174]">{bt('history.fields.assignee_id')}</span>
                  <AppSelect
                    value={filterUserId}
                    options={[{ value: '', label: bt('hub.statusAll') }, ...users.map((u) => ({ value: String(u.id), label: u.fullName }))]}
                    onChange={onFilterUserChange}
                    ariaLabel={bt('history.fields.assignee_id')}
                    searchable
                    searchPlaceholder={bt('filters.assigneeSearch')}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#586174]">{bt('filters.reporter')}</span>
                  <AppSelect
                    value={filterAuthorId}
                    options={[{ value: '', label: bt('hub.statusAll') }, ...users.map((u) => ({ value: String(u.id), label: u.fullName }))]}
                    onChange={onFilterAuthorChange}
                    ariaLabel={bt('filters.reporter')}
                    searchable
                    searchPlaceholder={bt('filters.reporterSearch')}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#586174]">{bt('history.fields.label_id')}</span>
                  <AppSelect
                    value={filterLabelId}
                    options={[{ value: '', label: bt('filters.allLabels') }, ...labels.map((l) => ({ value: l.id, label: l.name }))]}
                    onChange={(v) => onFilterLabelChange?.(v)}
                    ariaLabel={bt('history.fields.label_id')}
                    searchable
                    searchPlaceholder={bt('filters.labelSearch')}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#586174]">{bt('list.status')}</span>
                  <AppSelect
                    value={filterStatus}
                    options={STATUS_OPTIONS}
                    onChange={onFilterStatusChange}
                    ariaLabel={bt('list.status')}
                    showButtonAvatar={false}
                    showOptionAvatar={false}
                  />
                </label>

                <div className="flex flex-col gap-1">
                  <span className="text-[12px] font-medium text-[#586174]">{bt('filters.date')}</span>
                  <BoardDatePicker value={filterDate} onChange={onFilterDateChange} ariaLabel={bt('filters.date')} />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onApplyFilters()
                    setDesktopFilterOpen(false)
                  }}
                  className={`${AXIS_UI.primaryButton} !h-9 !px-4`}
                >
                  <MaterialSymbol name="filter_alt" size={16} color="currentColor" />
                  {bt('filters.apply')}
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopFilterOpen(false)}
                  className={AXIS_UI.secondaryButton}
                >
                  {bt('close')}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Search — always visible */}
        <div
          className={
            isModern
              ? `order-1 ${AXIS_UI.inputShell} min-w-0 flex-1 sm:w-[280px] sm:flex-none`
              : 'flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-[#DDE3EE] bg-white px-2.5 transition focus-within:border-[#2458D3] focus-within:shadow-[0_0_0_2px_rgba(47,75,226),0.12)]'
          }
        >
          <MaterialSymbol name="search" size={16} color="#586174" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isModern ? bt('taskDetail.searchTasks') : bt('filters.searchTasksEllipsis')}
            aria-label={bt('taskDetail.searchTasks')}
            className={isModern ? AXIS_UI.input : 'h-full w-full min-w-0 border-none bg-transparent text-xs font-normal text-[#374151] outline-none placeholder:text-[#9CA3AF]'}
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="shrink-0 rounded-[4px] p-0.5 text-[#586174] transition-colors hover:text-[#17202E]"
              aria-label={bt('hub.clearSearch')}
            >
              <MaterialSymbol name="close" size={16} color="currentColor" />
            </button>
          ) : null}
        </div>

        {/* Apply & clear */}
        <div className={`hidden shrink-0 items-center gap-1.5 lg:flex ${isModern ? '!hidden' : ''}`}>
          <button
            type="button"
            onClick={onApplyFilters}
            className="ts-button ts-button--primary ts-button--compact inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[#2458D3] px-3 text-xs font-semibold text-white transition hover:bg-[#1D49B3] active:scale-95"
          >
            <MaterialSymbol name="filter_alt" size={13} color="#fff" />
            {bt('filters.apply')}
          </button>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={onResetFilters}
              className="relative z-[1] inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#DDE3EE] bg-white px-2.5 text-xs font-semibold text-[#374C6B] transition hover:bg-[#F5F7FA]"
            >
              <MaterialSymbol name="filter_alt_off" size={13} color="#E53935" />
              <span>{bt('filters.resetShort')}</span>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#E53935] text-[10px] font-bold text-white">
                {activeFiltersCount}
              </span>
            </button>
          )}
        </div>

      </div>
    </>
  )
}
