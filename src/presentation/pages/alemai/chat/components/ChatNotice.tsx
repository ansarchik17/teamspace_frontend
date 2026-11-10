import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, X } from 'lucide-react'
import { CHAT_FOCUS } from '../chatUi'

export function ChatNotice({ message, detail, action, onClose, className = '' }: {
  message: ReactNode
  detail?: ReactNode
  action?: ReactNode
  onClose?: () => void
  className?: string
}) {
  const { t } = useTranslation('ai')
  return <div role="alert" className={`flex items-start gap-2.5 rounded-xl border border-[#E6EAF1] bg-[#F8F9FB] px-3.5 py-3 text-[13px] leading-5 ${className}`}>
    <AlertCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-[#D9480F]" />
    <div className="min-w-0 flex-1">
      <div className="text-[#17202E]">{message}</div>
      {detail && <div className="mt-0.5 text-[12px] text-[#586174]">{detail}</div>}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
    {onClose && <button type="button" onClick={onClose} aria-label={t('chat.close')} className={`-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#7B8494] transition-colors hover:bg-[#EEF1F5] hover:text-[#17202E] ${CHAT_FOCUS}`}><X size={14} /></button>}
  </div>
}
