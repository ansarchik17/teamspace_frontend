import MaterialSymbol from '../../../shared/ui/MaterialSymbol'

interface WorkspaceEpsAppCardProps {
  unreadTotal?: number
  onOpen: () => void
}

export default function WorkspaceEpsAppCard({ unreadTotal = 0, onOpen }: WorkspaceEpsAppCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-full min-h-[168px] w-full flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-[#C8D6EA] hover:shadow-[0_8px_22px_rgba(15,31,58,0.07)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E8ECF4] bg-[#EEF2FF] p-1.5">
            <MaterialSymbol name="mail" size={24} color="#2458D3" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate whitespace-nowrap text-[15px] font-semibold leading-tight text-[#13233E]">
              EPS
            </h3>
          </div>
        </div>
        {unreadTotal > 0 ? (
          <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#2458D3] px-2 text-[11px] font-bold text-white">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-[12px] font-medium text-[#9CA3AF]">Корпоративная почта</p>

      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[12px] font-semibold text-[#2458D3] opacity-0 transition group-hover:opacity-100">
        Открыть
        <MaterialSymbol name="arrow_forward" size={14} color="currentColor" />
      </span>
    </button>
  )
}
