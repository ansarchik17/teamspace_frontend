import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { bt } from './boardText'

interface BoardsEmptyStateProps {
  onCreateBoard?: () => void
  title?: string
  description?: string
}

const FEATURES = [
  { icon: 'view_kanban', get title() { return bt('empty.f1Title') }, get text() { return bt('empty.f1Text') } },
  { icon: 'group', get title() { return bt('empty.f2Title') }, get text() { return bt('empty.f2Text') } },
  { icon: 'insights', get title() { return bt('empty.f3Title') }, get text() { return bt('empty.f3Text') } },
] as const

const PREVIEW_COLUMNS = [
  { tone: 'bg-[#E8EEFC]', cards: 3 },
  { tone: 'bg-[#FFF3D6]', cards: 2 },
  { tone: 'bg-[#DFF5E8]', cards: 1 },
] as const

export default function BoardsEmptyState({
  onCreateBoard,
  title = bt('empty.title'),
  description = bt('empty.description'),
}: BoardsEmptyStateProps) {
  return (
    <section className="flex flex-1 items-start justify-center py-6 sm:items-center sm:py-10">
      <div className="w-full max-w-[640px] rounded-2xl border border-[#E2E5EA] bg-white p-6 text-center shadow-sm sm:p-10">
        <div aria-hidden="true" className="mx-auto mb-6 flex w-full max-w-[280px] items-start justify-center gap-2.5">
          {PREVIEW_COLUMNS.map((column, columnIndex) => (
            <div key={columnIndex} className="flex flex-1 flex-col gap-1.5 rounded-xl bg-[#F6F7F9] p-2">
              <div className={`h-2 w-3/5 rounded-full ${column.tone}`} />
              {Array.from({ length: column.cards }).map((_, cardIndex) => (
                <div key={cardIndex} className="rounded-lg border border-[#E2E5EA] bg-white p-1.5">
                  <div className="h-1.5 w-full rounded-full bg-[#EEF1F5]" />
                  <div className="mt-1 h-1.5 w-2/3 rounded-full bg-[#EEF1F5]" />
                </div>
              ))}
            </div>
          ))}
        </div>

        <h2 className="text-[20px] font-semibold leading-7 text-[#17202E]">{title}</h2>
        <p className="mx-auto mt-2 max-w-[460px] text-[14px] leading-5 text-[#586174]">{description}</p>

        {onCreateBoard ? (
          <button type="button" onClick={onCreateBoard} className={`${AXIS_UI.primaryButton} mt-6 inline-flex items-center gap-2`}>
            <MaterialSymbol name="add" size={20} color="currentColor" />
            {bt('hub.createBoard')}
          </button>
        ) : null}

        <ul className="mt-8 grid gap-3 border-t border-[#EEF1F5] pt-6 text-left sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.icon} className="flex items-start gap-3 sm:flex-col sm:gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EDF2FF] text-[#2458D3]">
                <MaterialSymbol name={feature.icon} size={18} color="currentColor" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-5 text-[#17202E]">{feature.title}</span>
                <span className="block text-[12px] leading-4 text-[#586174]">{feature.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
