import { ArrowUpRight, Clock3, FileText, SearchCheck } from 'lucide-react'
import type { AskDataCard, AskDataSource } from '../api/types'
import { dataCardStatus, dataSourceStatus, safeDataCardHref, safeExternalSourceHref } from '../dataPresentation'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatActionDecision } from '../api/types'
import { CHAT_FOCUS } from '../chatUi'

function ActionControls({ confirmation, disabled, onDecision }: {
  confirmation: NonNullable<AskDataCard['confirmation']>
  disabled?: boolean
  onDecision?: (decision: ChatActionDecision) => Promise<boolean>
}) {
  const { t } = useTranslation('ai')
  const [resolved, setResolved] = useState(false)
  const [sending, setSending] = useState(false)
  const expired = Date.parse(confirmation.expires_at) <= Date.now()
  if (resolved || expired) return <p className="px-4 pb-3 text-[13px] text-[#586174]" role="status">{t(resolved ? 'chat.agentActionProcessed' : 'chat.agentActionExpired')}</p>
  const decide = async (decision: ChatActionDecision['decision']) => {
    if (!onDecision || disabled || sending) return
    setSending(true)
    try { if (await onDecision({ token: confirmation.token, decision })) setResolved(true) }
    finally { setSending(false) }
  }
  return <div className="flex flex-wrap gap-2 px-4 pb-4">
    <button type="button" disabled={disabled || sending || !onDecision} onClick={() => void decide('confirm')}
      className={`min-h-9 rounded-[10px] bg-[#2458D3] px-3.5 text-[13px] font-medium text-white hover:bg-[#1D47B0] disabled:cursor-not-allowed disabled:opacity-50 ${CHAT_FOCUS}`}>{t('chat.agentActionConfirm')}</button>
    <button type="button" disabled={disabled || sending || !onDecision} onClick={() => void decide('cancel')}
      className={`min-h-9 rounded-[10px] border border-[#E2E5EA] px-3.5 text-[13px] font-medium text-[#17202E] hover:bg-[#F8F9FB] disabled:cursor-not-allowed disabled:opacity-50 ${CHAT_FOCUS}`}>{t('chat.cancel')}</button>
  </div>
}

const formatDate = (value: string, withTime = false): string => {
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Almaty', day: 'numeric', month: 'long',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : { year: 'numeric' }),
  }).format(date)
}

export function DataCards({ cards, disabled, onActionDecision }: { cards: AskDataCard[]; disabled?: boolean; onActionDecision?: (decision: ChatActionDecision) => Promise<boolean> }) {
  const { t } = useTranslation('ai')
  if (!cards.length) return null
  return <div className="mt-4 grid gap-2.5" aria-label="Данные из рабочих сервисов">
    {cards.map((card) => {
      const externalHref = safeExternalSourceHref(card.external_url)
      const href = !card.empty && !card.confirmation ? externalHref || safeDataCardHref(card.href) : undefined
      const actionLabel = t(externalHref ? 'chat.openSource' : 'chat.openItem')
      const status = dataCardStatus(card.status)
      const overdue = /overdue|просроч/i.test(card.status || '')
      return <article key={card.id} className={`relative overflow-hidden rounded-xl border border-[#E6EAF1] bg-white ${href ? 'transition-colors hover:border-[#A9BDEB] hover:bg-[#F8FAFF] focus-within:border-[#2458D3] focus-within:ring-2 focus-within:ring-[#2458D3]' : ''}`}>
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EDF2FF] text-[#2458D3]" aria-hidden="true">
            {card.empty ? <SearchCheck size={18} /> : <FileText size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[12px] text-[#586174]">{card.service}</p>
            <h3 className="break-words text-[14px] font-semibold leading-5 text-[#17202E]">
              {href ? <a href={href} target="_blank" rel="noopener noreferrer"
                aria-label={`${actionLabel}: ${card.title}`}
                className="outline-none after:absolute after:inset-0">{card.title}</a> : card.title}
            </h3>
            {card.empty ? <p className="mt-1.5 text-[13px] leading-5 text-[#586174]">По этому запросу записей не найдено.</p> : <>
              {status && <span className={`mt-2 inline-flex h-[22px] items-center rounded-md px-2 text-[12px] font-medium ${overdue ? 'bg-[#FDECEC] text-[#B32626]' : 'bg-[#F1F3F6] text-[#465066]'}`}>{status}</span>}
              {!!card.fields?.length && <dl className="mt-3 grid gap-1.5 text-[13px]">
                {card.fields.map((field, index) => <div key={index} className="grid grid-cols-[minmax(80px,0.4fr)_1fr] gap-3">
                  <dt className="text-[#586174]">{field.label}</dt>
                  <dd className="min-w-0 break-words text-[#17202E]">{field.value}</dd>
                </div>)}
              </dl>}
            </>}
          </div>
        </div>
        {card.confirmation && <ActionControls confirmation={card.confirmation} disabled={disabled} onDecision={onActionDecision} />}
        {!card.empty && !card.confirmation && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF0F3] bg-[#FAFBFC] px-4 py-2.5">
          {card.due_at && <p className={`flex items-center gap-1.5 text-[12px] ${overdue ? 'text-[#B32626]' : 'text-[#586174]'}`}><Clock3 size={14} aria-hidden="true" /><span>Срок: {formatDate(card.due_at)}</span></p>}
          {href ? <span aria-hidden="true" className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-[#2458D3]">{actionLabel}<ArrowUpRight size={16} /></span>
            : <p className="text-[12px] leading-5 text-[#586174]">{t('chat.itemLinkUnavailable')}</p>}
        </div>}
      </article>
    })}
  </div>
}

export function DataSourceDetails({ sources }: { sources: AskDataSource[] }) {
  const unique = sources.filter((source, index) => sources.findIndex((other) =>
    other.title === source.title && other.status === source.status && other.truncated === source.truncated,
  ) === index)
  if (!unique.length) return null
  return <details className="mt-4 rounded-xl border border-[#E6EAF1] text-[12px] text-[#586174]">
    <summary className="cursor-pointer px-3 py-2.5 font-medium hover:text-[#17202E]">Проверенные источники · {unique.length}</summary>
    <ul className="grid gap-2.5 border-t border-[#EEF0F3] px-3 py-3">
      {unique.map((source) => <li key={source.id}>
        <div className="flex flex-wrap justify-between gap-1.5"><span className="text-[#17202E]">{source.title}</span><span className={source.status === 'ok' ? 'text-[#16734B]' : 'text-[#946000]'}>{dataSourceStatus(source)}</span></div>
        {source.retrieved_at && <p className="mt-1 text-[11px]">{formatDate(source.retrieved_at, true)}</p>}
      </li>)}
    </ul>
  </details>
}
