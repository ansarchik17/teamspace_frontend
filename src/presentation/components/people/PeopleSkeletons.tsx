const BLOCK = 'rounded bg-[#EEF1F5]'

function TableRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[#EEF0F3]">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-6 py-4">
          <span className="h-8 w-8 shrink-0 rounded-full bg-[#EEF1F5]" />
          <span className={`h-3 w-1/4 ${BLOCK}`} />
          <span className={`h-3 flex-1 ${BLOCK}`} />
          <span className="h-6 w-20 rounded-[6px] bg-[#EEF1F5]" />
        </div>
      ))}
    </div>
  )
}

export function CompanyAdministrationSkeleton({ label }: { label: string }) {
  return (
    <div className="animate-pulse space-y-5" role="status" aria-busy="true" aria-label={label}>
      <div className="flex items-center gap-3">
        <span className={`h-7 w-40 ${BLOCK}`} />
        <span className="h-6 w-20 rounded-[6px] bg-[#EEF1F5]" />
      </div>
      <div className="flex gap-6 border-b border-[#E6EAF1] pb-3">
        {[56, 88, 72, 64, 112, 60].map((width, index) => <span key={index} className={`h-3.5 ${BLOCK}`} style={{ width }} />)}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center gap-4 rounded-2xl border border-[#E6EAF1] bg-white p-5">
            <span className="h-11 w-11 shrink-0 rounded-[12px] bg-[#EEF1F5]" />
            <div className="flex-1 space-y-2">
              <span className={`block h-3 w-1/2 ${BLOCK}`} />
              <span className={`block h-5 w-1/3 ${BLOCK}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white">
        <div className="px-6 py-5"><span className={`block h-5 w-48 ${BLOCK}`} /></div>
        <div className="h-11 border-y border-[#EEF0F3] bg-[#FAFBFC]" />
        <TableRows />
      </div>
    </div>
  )
}

export function AccessWorkspaceSkeleton({ label }: { label: string }) {
  return (
    <div className="mt-5 animate-pulse" role="status" aria-busy="true" aria-label={label}>
      <div className="flex items-center justify-between gap-3">
        <span className={`h-4 w-44 ${BLOCK}`} />
        <span className="h-9 w-40 rounded-[var(--ts-radius-control)] bg-[#EEF1F5]" />
      </div>
      <div className="mt-3 grid min-h-[420px] overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white md:grid-cols-[224px_minmax(0,1fr)]">
        <div className="hidden space-y-3 border-r border-[#E6EAF1] bg-[#FAFBFC] p-3 md:block">
          <span className={`block h-4 w-24 ${BLOCK}`} />
          <span className="block h-9 rounded-[var(--ts-radius-control)] bg-[#EEF1F5]" />
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-2 rounded-[8px] px-3 py-3">
              <span className={`block h-3.5 w-3/4 ${BLOCK}`} />
              <span className={`block h-3 w-1/3 ${BLOCK}`} />
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          <div className="space-y-2 px-4 py-4">
            <span className={`block h-5 w-48 ${BLOCK}`} />
            <span className={`block h-3 w-24 ${BLOCK}`} />
          </div>
          <div className="flex gap-6 border-b border-[#E6EAF1] px-4 pb-3">
            {[72, 88, 56].map((width, index) => <span key={index} className={`h-3.5 ${BLOCK}`} style={{ width }} />)}
          </div>
          <div className="space-y-4 p-4">
            <span className="block h-9 rounded-[var(--ts-radius-control)] bg-[#EEF1F5]" />
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="h-4 w-4 shrink-0 rounded-[4px] bg-[#EEF1F5]" />
                <span className={`h-3 ${BLOCK}`} style={{ width: `${40 + ((index * 17) % 45)}%` }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function AdminSectionSkeleton({ label }: { label: string }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white" role="status" aria-busy="true" aria-label={label}>
      <div className="flex items-center justify-between gap-4 px-6 py-5">
        <span className={`h-5 w-48 ${BLOCK}`} />
        <span className="h-9 w-32 rounded-[var(--ts-radius-control)] bg-[#EEF1F5]" />
      </div>
      <div className="h-11 border-y border-[#EEF0F3] bg-[#FAFBFC]" />
      <TableRows />
    </div>
  )
}
