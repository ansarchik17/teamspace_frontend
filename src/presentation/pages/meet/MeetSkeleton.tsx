const CARD = 'rounded-[20px] border border-[#EBEEF3] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

function Bone({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse bg-[#EEF1F5] motion-reduce:animate-none ${className.includes('rounded-') ? '' : 'rounded-lg'} ${className}`} />
}

export function MeetUpcomingSkeleton({ rows = 4 }: { rows?: number }) {
  return <ul className="px-3 py-2" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => <li key={index} className="flex items-center gap-4 border-b border-[#F0F2F5] px-3 py-3.5 last:border-b-0">
      <Bone className="h-2.5 w-2.5 shrink-0 rounded-full" />
      <Bone className="h-4 w-[104px] shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bone className="h-4 w-[55%]" />
        <Bone className="h-3 w-[75%]" />
      </div>
      <div className="hidden shrink-0 items-center lg:flex">
        <Bone className="h-8 w-8 rounded-full ring-2 ring-white" />
        <Bone className="-ml-2.5 h-8 w-8 rounded-full ring-2 ring-white" />
        <Bone className="-ml-2.5 h-8 w-8 rounded-full ring-2 ring-white" />
      </div>
      <Bone className="h-10 w-[148px] shrink-0 rounded-xl" />
      <Bone className="h-9 w-9 shrink-0" />
    </li>)}
  </ul>
}

export function MeetRecentSkeleton({ rows = 4 }: { rows?: number }) {
  return <ul className="grid gap-1 p-3" aria-hidden="true">
    {Array.from({ length: rows }, (_, index) => <li key={index} className="flex items-center gap-4 p-2.5">
      <Bone className="h-[68px] w-[112px] shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bone className="h-4 w-[70%]" />
        <Bone className="h-3 w-[45%]" />
      </div>
      <Bone className="h-9 w-9 shrink-0" />
    </li>)}
  </ul>
}

function SectionHeaderSkeleton() {
  return <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F3] px-6 py-4">
    <div className="flex items-center gap-3"><Bone className="h-8 w-8 rounded-full" /><Bone className="h-5 w-40" /></div>
    <Bone className="h-4 w-24" />
  </div>
}

export default function MeetPageSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} className="h-full min-h-0 overflow-y-auto bg-[#F7F8FA]">
    <div className="w-full px-4 py-6 md:px-6 md:py-7 lg:px-8">
      <div className="flex items-center gap-4">
        <Bone className="h-16 w-16 shrink-0 rounded-[18px]" />
        <div className="space-y-2.5"><Bone className="h-7 w-28" /><Bone className="h-4 w-[300px] max-w-[60vw]" /></div>
      </div>
      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className={`${CARD} flex min-h-[256px] items-center justify-between gap-6 px-7 py-8`}>
            <div className="w-full max-w-[420px] space-y-3">
              <Bone className="h-7 w-[85%]" />
              <Bone className="h-7 w-[60%]" />
              <Bone className="mt-4 h-4 w-[90%]" />
              <Bone className="h-4 w-[70%]" />
              <div className="flex gap-3 pt-4"><Bone className="h-12 w-44 rounded-xl" /><Bone className="h-12 w-40 rounded-xl" /></div>
            </div>
            <Bone className="hidden h-[170px] w-[230px] shrink-0 rounded-2xl md:block 2xl:w-[290px]" />
          </div>
          <div className={CARD}><SectionHeaderSkeleton /><MeetUpcomingSkeleton /></div>
        </div>
        <div className="grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-1">
          <div className={`${CARD} space-y-4 p-6`}>
            <div className="flex items-center gap-3"><Bone className="h-9 w-9 rounded-full" /><Bone className="h-5 w-52" /></div>
            <div className="flex gap-2.5"><Bone className="h-12 flex-1 rounded-xl" /><Bone className="h-12 w-12 rounded-xl" /></div>
            <Bone className="h-3.5 w-[80%]" />
          </div>
          <div className={CARD}><SectionHeaderSkeleton /><MeetRecentSkeleton /></div>
        </div>
      </div>
    </div>
  </div>
}
