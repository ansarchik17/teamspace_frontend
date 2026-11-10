function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-3">
        <div className="h-4 w-28 rounded bg-[#E5E7EB]" />
        <div className="h-10 w-[320px] max-w-full rounded bg-[#E5E7EB]" />
        <div className="h-10 w-[420px] max-w-full rounded bg-[#E5E7EB]" />
        <div className="flex flex-wrap gap-2 pt-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-11 w-36 rounded-full bg-[#E5E7EB]" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, columnIndex) => (
          <div key={columnIndex} className="space-y-5">
            {Array.from({ length: 2 }).map((__, cardIndex) => (
              <div key={cardIndex} className="rounded-[24px] border border-[#ECEEF3] bg-white p-5">
                <div className="mb-4 h-5 w-32 rounded bg-[#F3F4F6]" />
                <div className="space-y-3">
                  <div className="h-12 rounded-2xl bg-[#F9FAFB]" />
                  <div className="h-12 rounded-2xl bg-[#F9FAFB]" />
                  <div className="h-12 rounded-2xl bg-[#F9FAFB]" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-[#F3F4F6]" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-[#F3F4F6]" />
          <div className="h-3 w-1/2 rounded bg-[#F3F4F6]" />
        </div>
      </div>
      <div className="mb-3 flex gap-3">
        <div className="h-3 w-16 rounded bg-[#F3F4F6]" />
        <div className="h-3 w-10 rounded bg-[#F3F4F6]" />
      </div>
      <div className="h-6 w-20 rounded-full bg-[#F3F4F6]" />
    </div>
  )
}

export default function WorkspaceSkeletons() {
  return (
    <div className="space-y-10">
      <DashboardSkeleton />
      <div>
        <div className="mb-3 h-6 w-56 rounded bg-[#E5E7EB]" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
