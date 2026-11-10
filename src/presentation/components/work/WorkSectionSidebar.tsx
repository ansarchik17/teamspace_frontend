import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChartNoAxesColumn, ChevronDown, ClipboardList, LayoutGrid, Plus, Sparkles, SquareKanban, type LucideIcon } from 'lucide-react'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { WORK_TABS, readPinnedBoards, workTabFromSearch, workTabPath, PINNED_BOARDS_CHANGED, type PinnedBoard, type WorkTab } from './workTabs'

const ICONS: Record<WorkTab, LucideIcon> = {
  boards: LayoutGrid,
  assignments: ClipboardList,
  ai: Sparkles,
  stats: ChartNoAxesColumn,
}

const PIN_COLORS = ['#2458D3', '#7C3AED', '#0E8F80']

export default function WorkSectionSidebar() {
  const { search } = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation('shell')
  const { t: bt } = useTranslation('board')
  const { t: at } = useTranslation('assignments')
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [pinned, setPinned] = useState<PinnedBoard[]>(readPinnedBoards)
  const params = new URLSearchParams(search)
  const openBoardId = params.get('boardId')
  const active = openBoardId ? null : workTabFromSearch(search)
  const labels: Record<WorkTab, string> = {
    boards: bt('page.boards'),
    assignments: at('title'),
    ai: bt('page.hub.ai'),
    stats: bt('page.hub.stats'),
  }

  useEffect(() => {
    const refresh = () => setPinned(readPinnedBoards())
    window.addEventListener(PINNED_BOARDS_CHANGED, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(PINNED_BOARDS_CHANGED, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const create = (path: string) => {
    setAnchor(null)
    navigate(path, { state: { workNav: true } })
  }

  return (
    <aside className="workspace-people-panel" data-no-tooltip aria-label={t('navigation.board')}>
      <div className="workspace-people-panel__body">
        <h2 className="workspace-people-panel__title">{t('navigation.board')}</h2>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={Boolean(anchor)}
          onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
          className="ts-button ts-button--primary ts-button--compact workspace-people-panel__add"
        >
          <Plus size={16} />
          <span>{t('work.create')}</span>
          <ChevronDown size={16} />
        </button>
        <FloatingMenu anchor={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} align="start" className="w-[248px]">
          {([
            ['board', SquareKanban, '/board?create=board'],
            ['assignment', ClipboardList, '/eps'],
          ] as const).map(([key, Icon, path]) => (
            <button key={key} type="button" role="menuitem" className={`${floatingMenuItemClass} !py-2`} onClick={() => create(path)}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]"><Icon size={16} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-[#17202E]">{t(`work.createItems.${key}`)}</span>
                <span className="block text-[12px] text-[#586174]">{t(`work.createItems.${key}Hint`)}</span>
              </span>
            </button>
          ))}
        </FloatingMenu>
        <nav className="workspace-people-panel__nav" aria-label={bt('page.hubSections')}>
          {WORK_TABS.map((tab) => {
            const Icon = ICONS[tab]
            return (
              <Link
                key={tab}
                to={workTabPath(tab)}
                state={{ workNav: true }}
                aria-current={tab === active ? 'page' : undefined}
                className={`workspace-people-panel__item${tab === active ? ' is-active' : ''}`}
              >
                <Icon size={20} strokeWidth={1.75} />
                <span>{labels[tab]}</span>
              </Link>
            )
          })}
        </nav>
        {pinned.length > 0 ? (
          <>
            <div className="mt-5 px-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.06em] text-[#586174]">{t('work.pinned')}</div>
            <nav className="workspace-people-panel__nav !mt-2 !gap-0.5" aria-label={t('work.pinned')}>
              {pinned.map((board, index) => (
                <Link
                  key={board.id}
                  to={`/board?boardId=${encodeURIComponent(board.id)}`}
                  state={{ workNav: true }}
                  aria-current={openBoardId === board.id ? 'page' : undefined}
                  className={`workspace-people-panel__item !min-h-8 !text-[13px]${openBoardId === board.id ? ' is-active' : ''}`}
                >
                  <span aria-hidden className="!flex-none !p-0 h-2.5 w-2.5 rounded-[3px] mx-[5px]" style={{ background: PIN_COLORS[index % PIN_COLORS.length] }} />
                  <span className="truncate">{board.name}</span>
                </Link>
              ))}
            </nav>
          </>
        ) : null}
      </div>
    </aside>
  )
}
