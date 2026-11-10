export function Meter({ used, total, danger }: { used: string; total: string | null | undefined; danger?: boolean }) {
  const totalBn = total ? BigInt(total) : 0n
  const share = totalBn > 0n ? Math.min(100, Number((BigInt(used) * 10000n) / totalBn) / 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF1F5]">
      <div className={`h-full rounded-full ${danger || share >= 100 ? 'bg-[#C03437]' : share >= 85 ? 'bg-[#E3A008]' : 'bg-[#2458D3]'}`} style={{ width: `${share > 0 ? Math.max(share, 1.5) : 0}%` }} />
    </div>
  )
}
