import type { ReactNode } from 'react'
import AppButton from '../../../shared/ui/AppButton'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-[#374C6B]">{label}{children}</label>
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{message}</span>{retry && <AppButton variant="secondary" onClick={retry}>Повторить</AppButton>}</div>
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="grid min-h-48 place-content-center gap-2 p-8 text-center"><h3 className="font-semibold text-[#0A1628]">{title}</h3><p className="max-w-md text-sm text-[#8497B4]">{description}</p></div>
}
