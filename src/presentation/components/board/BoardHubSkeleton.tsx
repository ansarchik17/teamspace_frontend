import { bt } from './boardText'
const BLOCK = 'rounded bg-[#EEF1F5]'

function BoardCardSkeleton() {
  return (
    <div className="flex min-h-[224px] flex-col gap-4 rounded-[12px] border border-[#E2E5EA] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-[#EEF1F5]" />
        <div className="flex-1 space-y-2">
          <div className={`h-3.5 w-2/3 ${BLOCK}`} />
          <div className={`h-2.5 w-1/3 ${BLOCK}`} />
        </div>
      </div>
      <div className="space-y-2">
        <div className={`h-3 w-full ${BLOCK}`} />
        <div className={`h-3 w-4/5 ${BLOCK}`} />
      </div>
      <div className="mt-auto space-y-2">
        <div className="flex justify-between">
          <div className={`h-2.5 w-16 ${BLOCK}`} />
          <div className={`h-2.5 w-8 ${BLOCK}`} />
        </div>
        <div className="h-1.5 w-full rounded-full bg-[#EEF1F5]" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex -space-x-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 w-7 rounded-full border-2 border-white bg-[#EEF1F5]" />
          ))}
        </div>
        <div className={`h-3 w-20 ${BLOCK}`} />
      </div>
    </div>
  )
}

export default function BoardHubSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col animate-pulse" aria-busy="true" aria-label={bt('hub.loading')}>
      <div className="mb-4 flex gap-1 overflow-hidden">
        {[96, 112, 128, 150].map((width) => (
          <div key={width} className="h-10 rounded-lg bg-[#E9EDF2]" style={{ width }} />
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 pb-5">
        <div className="space-y-2">
          <div className={`h-7 w-32 ${BLOCK}`} />
          <div className={`h-4 w-64 max-w-full ${BLOCK}`} />
        </div>
        <div className="h-10 w-36 rounded-lg bg-[#EEF1F5]" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5EA] pb-3">
        <div className="flex gap-6">
          {[56, 44, 52].map((width) => (
            <div key={width} className={`h-4 ${BLOCK}`} style={{ width }} />
          ))}
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-[240px] max-w-[50vw] rounded-lg bg-[#EEF1F5]" />
          <div className="h-9 w-24 rounded-lg bg-[#EEF1F5]" />
        </div>
      </div>

      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <div className={`h-5 w-24 ${BLOCK}`} />
            <div className="h-5 w-6 rounded-full bg-[#EEF1F5]" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <BoardCardSkeleton key={i} />
            ))}
          </div>
        </div>
        <div className="hidden space-y-3 rounded-[12px] border border-[#E2E5EA] bg-white p-5 shadow-sm 2xl:block">
          <div className={`h-5 w-28 ${BLOCK}`} />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1">
              <div className="h-8 w-8 shrink-0 rounded-full bg-[#EEF1F5]" />
              <div className="flex-1 space-y-1.5">
                <div className={`h-3 w-4/5 ${BLOCK}`} />
                <div className={`h-2.5 w-1/2 ${BLOCK}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
