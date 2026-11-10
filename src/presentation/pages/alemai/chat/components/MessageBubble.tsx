import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DataCards, DataSourceDetails } from './DataCards'
import { dataCardStatus, presentAssistantText } from '../dataPresentation'


import type { ChatMessage } from '../types'
import { Check, Copy, Pencil, RotateCcw, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CHAT_FOCUS, friendlyText } from '../chatUi'
import { ChatNotice } from './ChatNotice'
import type { ChatActionDecision } from '../api/types'

interface MessageBubbleProps {
  msg: ChatMessage
  assistantName?: string
  onEditSubmit?: (newText: string, messageId: number) => Promise<boolean> | boolean | void
  isTyping?: boolean
  onRetry?: (messageId: number) => Promise<boolean> | boolean | void
  onActionDecision?: (decision: ChatActionDecision) => Promise<boolean>
}

const shouldHideDisplayUrl = (value: string): boolean => {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false

  return normalized === 'https://alem-workspace.gov.kz/v1/chats' || normalized.startsWith('https://alem-workspace.gov.kz/v1/chats/')
}

export function MessageBubble({ msg, assistantName, onEditSubmit, isTyping, onRetry, onActionDecision }: MessageBubbleProps) {
  const { t } = useTranslation('ai')
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(msg.text)
  const isUser = msg.role === 'user'
  const sourceCount = msg.meta?.sources?.length ?? 0

  const handleCopy = async () => {
    const cards = msg.meta?.dataCards || []
    const text = isUser ? msg.text : [displayText, ...cards.map((card) => [card.title, dataCardStatus(card.status), card.due_at ? `Срок: ${card.due_at}` : '', ...(card.fields || []).map((field) => `${field.label}: ${field.value}`)].filter(Boolean).join('\n'))].join('\n\n')
    if (!navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const presentation = presentAssistantText(msg.text, msg.meta?.dataSources || [], msg.meta?.dataCards || [])
  const displayText = presentation.text
  const legacyFooter = presentation.legacyFooter

  const renderText = (text: string) => <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    p: ({ children }) => <p className="my-2.5 text-[15px] leading-[25px] first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1.5 pl-5 text-[15px] leading-[25px] marker:text-[#7B8494]">{children}</ul>,
    ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1.5 pl-5 text-[15px] leading-[25px] marker:text-[#7B8494]">{children}</ol>,
    strong: ({ children }) => <strong className="font-semibold text-[#17202E]">{children}</strong>,
    h1: ({ children }) => <h3 className="mb-2 mt-5 text-[16px] font-semibold text-[#17202E]">{children}</h3>,
    h2: ({ children }) => <h3 className="mb-2 mt-5 text-[16px] font-semibold text-[#17202E]">{children}</h3>,
    h3: ({ children }) => <h3 className="mb-2 mt-4 text-[15px] font-semibold text-[#17202E]">{children}</h3>,
    a: ({ href, children }) => shouldHideDisplayUrl(href || '') ? <>{children}</> : <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-[#2458D3] underline decoration-[#2458D3]/30 underline-offset-2 hover:decoration-[#2458D3]">{children}</a>,
    table: ({ children }) => <div className="my-3 overflow-x-auto rounded-xl border border-[#E6EAF1]"><table className="w-full border-collapse text-left text-[14px]">{children}</table></div>,
    th: ({ children }) => <th className="border-b border-[#E6EAF1] bg-[#FAFBFC] px-3 py-2 text-[13px] font-medium text-[#586174]">{children}</th>,
    td: ({ children }) => <td className="border-b border-[#EEF0F3] px-3 py-2 align-top text-[#465066]">{children}</td>,
    code: ({ children }) => <code className="rounded-md bg-[#F1F3F6] px-1.5 py-0.5 text-[13px] text-[#17202E]">{children}</code>,
  }}>{text}</ReactMarkdown>

  const action = `flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E] disabled:opacity-40 ${CHAT_FOCUS}`

  if (isUser) {
    return (
      <div className="group mb-6 flex w-full justify-end">
        {isEditing ? (
          <div className="flex w-full flex-col gap-3 rounded-[18px] border border-[#E2E5EA] bg-white p-3.5 shadow-[0_8px_24px_-14px_rgba(16,24,40,0.2)] sm:max-w-[80%]">
            <textarea value={editText} disabled={isTyping} onChange={(event) => setEditText(event.target.value)} autoFocus
              className="min-h-[80px] w-full resize-none bg-transparent text-[15px] leading-6 text-[#17202E] outline-none" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setIsEditing(false); setEditText(msg.text) }}
                className={`h-9 rounded-[10px] border border-[#E2E5EA] bg-white px-3.5 text-[13px] font-medium text-[#17202E] hover:bg-[#F8F9FB] ${CHAT_FOCUS}`}>{t('chat.cancel')}</button>
              <button type="button" disabled={isTyping || !editText.trim() || editText === msg.text}
                onClick={async () => {
                  if (editText.trim() && editText !== msg.text) {
                    const accepted = await onEditSubmit?.(editText.trim(), msg.id)
                    if (accepted === false) return
                  }
                  setIsEditing(false)
                }}
                className={`h-9 rounded-[10px] bg-[#2458D3] px-3.5 text-[13px] font-medium text-white hover:bg-[#1D47B0] disabled:cursor-not-allowed disabled:opacity-50 ${CHAT_FOCUS}`}>{t('chat.saveAndSend')}</button>
            </div>
          </div>
        ) : (
          <div className="flex max-w-[85%] items-start justify-end gap-1.5 sm:max-w-[80%]">
            {onEditSubmit && <button type="button" onClick={() => { setEditText(msg.text); setIsEditing(true) }} disabled={isTyping}
              aria-label={t('chat.edit')} title={t('chat.edit')}
              className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#7B8494] opacity-0 transition-opacity hover:bg-[#F1F3F6] hover:text-[#17202E] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0 ${CHAT_FOCUS}`}><Pencil size={15} /></button>}
            <div className="min-w-0">
              <div className="whitespace-pre-wrap break-words rounded-[18px] bg-[#F1F3F6] px-4 py-2.5 text-[15px] leading-6 text-[#17202E]">{msg.text}</div>
              <div className="mt-1 flex items-center justify-end gap-1 text-[#7B8494]">
                <button type="button" onClick={handleCopy} aria-label={copied ? t('chat.copied') : t('chat.copy')}
                  title={copied ? t('chat.copied') : t('chat.copy')} className={action}>
                  {copied ? <Check size={16} className="text-[#16734B]" /> : <Copy size={16} />}
                </button>
                {msg.time && <p className="pr-1 text-[11px] tabular-nums">{msg.time}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const failed = (presentation.needsRetry || msg.meta?.isError) && msg.meta?.retryable !== false
  return (
    <article className="mb-8" aria-label={assistantName || t('chat.settingsAssistant')}>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EDF2FF] text-[#2458D3]"><Sparkles size={15} fill="currentColor" strokeWidth={1.4} /></span>
        <span className="text-[14px] font-semibold text-[#17202E]">{assistantName || t('chat.settingsAssistant')}</span>
        {msg.time && <span className="text-[12px] tabular-nums text-[#7B8494]">{msg.time}</span>}
      </div>
      <div className="min-w-0 pl-[38px] text-[#17202E]">
        {failed
          ? <ChatNotice message={friendlyText(displayText, t('chat.actionFailed'))} action={onRetry && <button type="button" onClick={() => onRetry(msg.id)} disabled={isTyping}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-2.5 text-[13px] font-medium text-[#17202E] hover:bg-[#F1F3F6] disabled:opacity-50 ${CHAT_FOCUS}`}><RotateCcw size={14} />{t('chat.retry')}</button>} />
          : <div className="[word-wrap:break-word]">
            {renderText(displayText)}
            <DataCards cards={msg.meta?.dataCards || []} disabled={isTyping} onActionDecision={onActionDecision} />
            <DataSourceDetails sources={msg.meta?.dataSources || []} />
            {legacyFooter && !msg.meta?.dataSources?.length && <details className="mt-4 text-[13px] text-[#586174]"><summary className="cursor-pointer">Проверенные источники</summary><div className="mt-2">{renderText(legacyFooter)}</div></details>}
          </div>}
        {(sourceCount > 0 || msg.meta?.noLiveSources) && <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {sourceCount > 0 && msg.meta?.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-7 max-w-[260px] items-center rounded-lg border border-[#E6EAF1] bg-[#FAFBFC] px-2.5 text-[12px] text-[#465066] hover:border-[#C9D3E6] hover:text-[#17202E]"><span className="truncate">{source.title || source.url}</span></a>)}
          {msg.meta?.noLiveSources && <span className="inline-flex h-7 items-center rounded-lg bg-[#FFF6E5] px-2.5 text-[12px] font-medium text-[#946000]">{t('chat.noWebSources')}</span>}
        </div>}
        {!failed && <div className="-ml-1.5 mt-2 flex items-center gap-0.5 text-[#7B8494]">
          <button type="button" onClick={handleCopy} aria-label={copied ? t('chat.copied') : t('chat.copy')} title={copied ? t('chat.copied') : t('chat.copy')} className={action}>{copied ? <Check size={16} className="text-[#16734B]" /> : <Copy size={16} />}</button>
          <button type="button" aria-pressed={feedback === 'like'} onClick={() => setFeedback(feedback === 'like' ? null : 'like')} aria-label={t('chat.like')} title={t('chat.like')} className={`${action} ${feedback === 'like' ? 'text-[#2458D3]' : ''}`}><ThumbsUp size={16} fill={feedback === 'like' ? 'currentColor' : 'none'} /></button>
          <button type="button" aria-pressed={feedback === 'dislike'} onClick={() => setFeedback(feedback === 'dislike' ? null : 'dislike')} aria-label={t('chat.dislike')} title={t('chat.dislike')} className={`${action} ${feedback === 'dislike' ? 'text-[#C5301B]' : ''}`}><ThumbsDown size={16} fill={feedback === 'dislike' ? 'currentColor' : 'none'} /></button>
          {onRetry && <button type="button" onClick={() => onRetry(msg.id)} disabled={isTyping} aria-label={t('chat.regenerate')} title={t('chat.regenerate')} className={action}><RotateCcw size={15} /></button>}
        </div>}
      </div>
    </article>
  )
}
