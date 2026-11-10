import { bt } from './boardText'
interface BoardHeaderProps {
  boardName: string
  totalTasks: number
  boardsCount: number
  isRefreshing: boolean
  onRefresh: () => void
}

export default function BoardHeader({
  boardName,
  totalTasks,
  boardsCount,
}: BoardHeaderProps) {
  return (
    <header className="w-full py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium leading-4 text-[#586174]">{bt('page.board')}</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-8 text-[#17202E]">{boardName || 'Kanban Board'}</h1>
          <p className="mt-1 text-[14px] leading-5 text-[#586174]">{bt('header.counts', { boards: boardsCount, tasks: totalTasks })}</p>
        </div>
      </div>
    </header>
  )
}
