import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ArrowLeft, ArrowUp, CircleAlert, Clock3, FileText, MessageCircle, MessageSquareText, Paperclip, RefreshCw, Search, SquareArrowOutUpRight, TriangleAlert, UserRound } from 'lucide-react'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import type { WhatsAppConversation, WhatsAppMessage, WhatsAppStatus, WhatsAppTemplate } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import WhatsAppAttachmentForm from './WhatsAppAttachmentForm'
import WhatsAppTemplateAttachment from './WhatsAppTemplateAttachment'
import type { TemplateAttachment } from './WhatsAppTemplateAttachment'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import { EmptyState, ErrorNotice, Field } from './growyUi'
import { dateLabel, inputClass, useGrowyContext } from './growyShared'
import CrmSelect from './CrmSelect'

const conversationName = (item: WhatsAppConversation) => item.contact?.name || item.lead?.full_name || item.profile_name || item.wa_id
const mergeMessages = (before: WhatsAppMessage[], after: WhatsAppMessage[]) => [...new Map([...before, ...after].map((item) => [item.id, item])).values()].sort((left, right) => left.id - right.id)
const safeMediaUrl = (url?: string) => url && /^https?:\/\//i.test(url) ? url : null
const CHAT_ICON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#586174] transition-colors hover:bg-[#EEF0F3] hover:text-[#17202E] disabled:opacity-40'
const AVATAR_COLORS = ['#2F55EB', '#0E8F80', '#C76A06', '#6545D6', '#465066']
const dayKey = (value: string) => new Date(value).toDateString()
const clock = (value: string) => new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
type Translate = TFunction<'shell'>
const dayLabel = (value: string, t: Translate) => {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return t('crm.whatsapp.today')
  if (date.toDateString() === yesterday.toDateString()) return t('crm.whatsapp.yesterday')
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
const listTime = (value: string | null, t: Translate) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return ''
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return clock(value)
  const label = dayLabel(value, t)
  return label === t('crm.whatsapp.yesterday') ? label : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function ChatAvatar({ name, seed, size = 40 }: { name: string; seed: number; size?: number }) {
  const initials = /^[+\d<#]/.test(name.trim()) ? '' : name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
  return <span className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: Math.round(size * 0.34), backgroundColor: initials ? AVATAR_COLORS[Math.abs(seed) % AVATAR_COLORS.length] : '#C9CFD8' }}>
    {initials || <UserRound size={Math.round(size * 0.5)} />}
  </span>
}

function Ticks({ status, label }: { status: string; label?: string }) {
  if (status === 'queued') return <Clock3 size={12} className="shrink-0 text-[#8A93A5]" aria-label={label} />
  if (status === 'failed') return <CircleAlert size={13} className="shrink-0 text-[#C03437]" aria-label={label} />
  const double = status === 'delivered' || status === 'read'
  return <svg width={double ? 16 : 12} height="12" viewBox={double ? '0 0 20 12' : '0 0 14 12'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={`shrink-0 ${status === 'read' ? 'text-[#1C7ED6]' : 'text-[#7A8394]'}`} role="img" aria-label={label}>
    <path d={double ? 'M1 6.5 4.5 10 12 2M8 9.5l.5.5L16 2' : 'M1.5 6.5 5 10l7.5-8'} />
  </svg>
}

export default function WhatsAppPage() {
  const { repository, context, error: contextError, loading: contextLoading, retry } = useGrowyContext()
  const [params, setParams] = useSearchParams()
  const conversationId = Number(params.get('conversation')) || null
  const [search, setSearch] = useState('')
  const [messageSearch, setMessageSearch] = useState('')
  const [searchMessages, setSearchMessages] = useState<WhatsAppMessage[]>([])
  const [searchBeforeId, setSearchBeforeId] = useState<number | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { t } = useTranslation('shell')
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const [syncOffset, setSyncOffset] = useState(0)
  const syncLocked = useRef(false)
  const searchKey = useRef(messageSearch.trim())
  searchKey.current = messageSearch.trim()
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([])
  const [conversation, setConversation] = useState<WhatsAppConversation | null>(null)
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [integration, setIntegration] = useState<WhatsAppStatus | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [chatError, setChatError] = useState('')
  const [revision, setRevision] = useState(0)
  const [beforeId, setBeforeId] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [olderLoading, setOlderLoading] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [variables, setVariables] = useState<Record<number, string>>({})
  const [headerVariables, setHeaderVariables] = useState('')
  const [buttonVariables, setButtonVariables] = useState('')
  const [templateAttachment, setTemplateAttachment] = useState<TemplateAttachment | null>(null)
  const [templateUploadBusy, setTemplateUploadBusy] = useState(false)
  const [templateUploadPending, setTemplateUploadPending] = useState(false)
  const [templateError, setTemplateError] = useState('')
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const selectedId = useRef(conversationId)
  selectedId.current = conversationId
  const sendingRef = useRef(false)
  const enabled = Boolean(context?.modules.whatsapp)
  const selectedTemplate = templates.find((template) => String(template.id) === templateId)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let timer: number | undefined
    let first = true
    setListLoading(true); setListError(''); setConversations([]); setIntegration(null)
    const load = async () => {
      if (!controller.signal.aborted && (first || !document.hidden)) {
        try {
          const [status, list] = await Promise.all([repository.whatsappStatus(controller.signal), repository.conversations(search, controller.signal)])
          if (!controller.signal.aborted) { setIntegration(status); setConversations(list); setListError('') }
        } catch (error) { if (!controller.signal.aborted) setListError(growyErrorMessage(error)) }
        finally { if (!controller.signal.aborted) setListLoading(false) }
      }
      first = false
      if (!controller.signal.aborted) timer = window.setTimeout(() => void load(), 15000)
    }
    timer = window.setTimeout(() => void load(), 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, enabled, search, revision])
  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    let first = true
    let lastRead = 0
    setConversation(null); setMessages([]); setBeforeId(null); setText(''); setChatError(''); setTemplateOpen(false); setAttachmentOpen(false); setMessageSearch(''); setSearchOpen(false); setSyncNotice(''); setSyncOffset(0)
    if (!enabled || !conversationId) { setMessagesLoading(false); return () => controller.abort() }
    setMessagesLoading(true)
    const load = async () => {
      if (!controller.signal.aborted && !sendingRef.current && (first || !document.hidden)) {
        try {
          const [detail, page] = await Promise.all([repository.conversation(conversationId, controller.signal), repository.messages(conversationId, undefined, controller.signal)])
          if (controller.signal.aborted) return
          setConversation(detail); setMessages((current) => mergeMessages(current, page.results)); setChatError('')
          if (first) {
            setBeforeId(page.has_more ? page.next_before_id : null)
            setMessagesLoading(false)
            requestAnimationFrame(() => messagesEnd.current?.scrollIntoView({ behavior: 'instant', block: 'end' }))
            first = false
          }
          const inboundId = Math.max(0, ...page.results.filter((item) => item.direction === 'inbound').map((item) => item.id))
          if (inboundId > lastRead && !document.hidden) {
            try { await repository.markRead(conversationId); lastRead = inboundId }
            catch { /* History remains usable when marking provider messages read is unavailable. */ }
          }
        } catch (error) { if (!controller.signal.aborted) setChatError(growyErrorMessage(error)) }
        finally { if (!controller.signal.aborted) setMessagesLoading(false) }
      }
      if (!controller.signal.aborted) timer = window.setTimeout(() => void load(), 10000)
    }
    void load()
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, enabled, conversationId, revision])
  useEffect(() => {
    if (!templateOpen) return
    const controller = new AbortController()
    setTemplatesLoading(true); setTemplateError(''); setTemplateId(''); setVariables({}); setHeaderVariables(''); setButtonVariables(''); setTemplateAttachment(null); setTemplateUploadPending(false)
    repository.templates(controller.signal).then((items) => { if (!controller.signal.aborted) setTemplates(items.filter((item) => item.status.toUpperCase() === 'APPROVED')) }).catch((error: unknown) => { if (!controller.signal.aborted) setTemplateError(growyErrorMessage(error)) }).finally(() => { if (!controller.signal.aborted) setTemplatesLoading(false) })
    return () => controller.abort()
  }, [repository, templateOpen])
  useEffect(() => {
    const controller = new AbortController()
    if (!conversationId || !messageSearch.trim()) return () => controller.abort()
    const id = conversationId
    const timer = window.setTimeout(() => {
      setSearchLoading(true); setSearchError(''); setSearchMessages([]); setSearchBeforeId(null)
      repository.searchMessages(id, messageSearch.trim(), undefined, controller.signal).then((page) => {
        if (!controller.signal.aborted) { setSearchMessages(page.results); setSearchBeforeId(page.has_more ? page.next_before_id : null) }
      }).catch((error) => { if (!controller.signal.aborted) setSearchError(growyErrorMessage(error)) })
        .finally(() => { if (!controller.signal.aborted) setSearchLoading(false) })
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, conversationId, messageSearch])
  const syncHistory = async () => {
    if (!conversationId || syncLocked.current) return
    const id = conversationId
    syncLocked.current = true; setSyncing(true); setSyncNotice(''); setChatError('')
    try {
      const result = await repository.request<{ synced: number; cached?: boolean; has_next: boolean }>(`whatsapp/conversations/${id}/sync/`, { method: 'POST', body: JSON.stringify({ limit: 1000, offset: syncOffset }) })
      const page = await repository.messages(id)
      if (selectedId.current !== id) return
      setMessages((current) => mergeMessages(current, page.results)); setBeforeId(page.has_more ? page.next_before_id : null)
      if (!result.cached) setSyncOffset(result.has_next ? syncOffset + 1000 : 0)
      setSyncNotice(result.cached ? t('crm.whatsapp.syncCached') : `${t('crm.whatsapp.syncAdded', { count: result.synced })}${result.has_next ? t('crm.whatsapp.syncMore') : ''}`)
    } catch (error) { if (selectedId.current === id) setChatError(growyErrorMessage(error)) }
    finally { syncLocked.current = false; setSyncing(false) }
  }
  const acceptMessage = (id: number, message: WhatsAppMessage) => {
    if (selectedId.current !== id) return
    setMessages((current) => mergeMessages(current, [message]))
    setConversations((current) => current.map((item) => item.id === id ? { ...item, last_message: message, last_message_at: message.created_at } : item))
    requestAnimationFrame(() => messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
  }
  const loadOlder = async () => {
    const cursor = messageSearch.trim() ? searchBeforeId : beforeId
    if (!conversationId || !cursor || olderLoading) return
    const id = conversationId
    const query = messageSearch.trim()
    setOlderLoading(true)
    try {
      const page = query ? await repository.searchMessages(id, query, cursor) : await repository.messages(id, cursor)
      if (selectedId.current !== id || searchKey.current !== query) return
      if (query) { setSearchMessages((current) => [...new Map([...current, ...page.results].map((item) => [item.id, item])).values()].sort((left, right) => right.id - left.id)); setSearchBeforeId(page.has_more ? page.next_before_id : null) }
      else { setMessages((current) => mergeMessages(page.results, current)); setBeforeId(page.has_more ? page.next_before_id : null) }
    } catch (error) { if (selectedId.current === id) setChatError(growyErrorMessage(error)) }
    finally { setOlderLoading(false) }
  }
  const send = async (event: FormEvent, template = false) => {
    event.preventDefault()
    if (!conversationId || sendingRef.current || templateUploadBusy || (template && templateUploadPending) || (!template && !text.trim()) || (template && !selectedTemplate)) return
    const id = conversationId
    sendingRef.current = true; setSending(true); setChatError(''); setTemplateError('')
    try {
      const message = template && selectedTemplate
        ? await repository.sendTemplate(id, selectedTemplate, (selectedTemplate.variable_indexes || []).map((index) => variables[index]?.trim() || ''), headerVariables.split('\n').map((value) => value.trim()).filter(Boolean), buttonVariables.split('\n').map((value) => value.trim()).filter(Boolean), templateAttachment)
        : await repository.sendMessage(id, text.trim())
      if (selectedId.current !== id) return
      setMessages((current) => mergeMessages(current, [message])); setText(''); setTemplateOpen(false)
      setConversations((current) => current.map((item) => item.id === id ? { ...item, last_message: message, last_message_at: message.created_at } : item))
      requestAnimationFrame(() => messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
    } catch (error) {
      if (selectedId.current === id) { if (template) setTemplateError(growyErrorMessage(error)); else setChatError(growyErrorMessage(error)) }
    } finally { sendingRef.current = false; setSending(false) }
  }
  const searchActive = Boolean(messageSearch.trim())
  const visibleMessages = searchActive ? searchMessages : messages
  const canTemplate = Boolean(integration?.connected && integration.provider === 'edna')
  const canWrite = Boolean(conversation?.is_open && integration?.connected)
  const crmLink = context?.modules.crm && conversation ? (conversation.lead ? `/crm?tab=leads&id=${conversation.lead.id}` : conversation.contact ? `/crm?tab=contacts&id=${conversation.contact.id}` : null) : null
  const lead = conversation?.lead as (WhatsAppConversation['lead'] & { phone?: string; source?: string; stage?: { name: string; color?: string } | null }) | null | undefined
  const contact = conversation?.contact as (WhatsAppConversation['contact'] & { phone?: string }) | null | undefined
  const submitText = (event: FormEvent) => void send(event)

  return <section className={`flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-[#F6F7F9] px-4 pb-4 pt-6 text-[#17202E] md:px-6 xl:px-8 ${AXIS_UI.fontFamily}`}>
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 pb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em]">{t('crm.whatsapp.title')}</h1>
          {integration && <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ${integration.connected ? 'bg-[#E6F5EE] text-[#0F7A55]' : 'bg-[#FDF2E1] text-[#A85A00]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${integration.connected ? 'bg-[#0F7A55]' : 'bg-[#A85A00]'}`} />
            {integration.connected ? t('crm.whatsapp.connected') : t('crm.whatsapp.notConnected')}
          </span>}
        </div>
        <p className="mt-0.5 text-[14px] text-[#586174]">{t('crm.whatsapp.subtitle')}{context?.tenant.name ? ` · ${context.tenant.name}` : ''}</p>
      </div>
      <div className="flex items-center gap-2">
        <Link className={AXIS_UI.secondaryButton} to="/crm/messenger/whatsapp/manage"><MessageSquareText size={16} />{t('crm.whatsapp.templates')}</Link>
      </div>
    </header>

    {contextLoading && <p role="status" className="py-10 text-center text-sm text-[#586174]">{t('crm.whatsapp.connecting')}</p>}
    {contextError && <ErrorNotice message={contextError} retry={retry} />}
    {context && !enabled && <EmptyState title={t('crm.whatsapp.disabledTitle')} description={t('crm.whatsapp.disabledText')} />}
    {enabled && <>
      {integration && !integration.connected && <div className="mb-3 flex shrink-0 items-start gap-2 rounded-xl border border-[#F3D9B5] bg-[#FDF2E1] px-3.5 py-2.5 text-[13px] text-[#8A4B00]">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" />{t('crm.whatsapp.notConnectedBanner')}
      </div>}
      {listError && <div className="mb-3 shrink-0"><ErrorNotice message={listError} retry={() => setRevision((value) => value + 1)} /></div>}

      <div className={`grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white md:max-xl:grid-cols-[300px_minmax(0,1fr)] ${conversationId ? 'xl:max-[1599px]:grid-cols-[320px_minmax(0,1fr)] min-[1600px]:grid-cols-[320px_minmax(0,1fr)_288px]' : 'xl:grid-cols-[320px_minmax(0,1fr)]'}`}>
        <aside className={`min-h-0 flex-col border-r border-[#E6EAF1] ${conversationId ? 'hidden md:flex' : 'flex'}`}>
          <div className="shrink-0 p-3.5">
            <label className={`${AXIS_UI.inputShell} w-full`}>
              <Search size={16} className="shrink-0 text-[#586174]" />
              <input className={AXIS_UI.input} type="search" aria-label={t('crm.whatsapp.searchLabel')} placeholder={t('crm.whatsapp.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin]">
            {listLoading ? Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-3 px-4 py-2.5" aria-hidden>
              <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#EEF0F3]" />
              <span className="flex-1 space-y-2"><span className="block h-3.5 w-2/3 animate-pulse rounded bg-[#EEF0F3]" /><span className="block h-3 w-1/2 animate-pulse rounded bg-[#F3F4F6]" /></span>
            </div>)
              : conversations.length === 0 ? <EmptyState title={t('crm.whatsapp.emptyListTitle')} description={t('crm.whatsapp.emptyListText')} />
              : conversations.map((item, index) => {
                const name = conversationName(item)
                const active = conversationId === item.id
                return <button key={item.id} type="button" onClick={() => setParams({ conversation: String(item.id) })} aria-current={active ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 border-l-[3px] px-3.5 py-2.5 text-left transition-colors ${active ? 'border-[#1E8E4E] bg-[#EEF8F1]' : 'border-transparent hover:bg-[#F6F7F9]'}`}>
                  <span className="relative shrink-0">
                    <ChatAvatar name={name} seed={item.id + index} />
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-[#1E8E4E] text-white"><MessageCircle size={9} strokeWidth={3} /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#17202E]">{name}</span>
                      <span className="shrink-0 text-[12px] text-[#8A93A5]">{listTime(item.last_message_at, t)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[13px] text-[#586174]">
                      {item.last_message?.direction === 'outbound' && <Ticks status={item.last_message.status} />}
                      <span className="min-w-0 truncate">{item.last_message?.text || (`+${item.wa_id}` !== name ? `+${item.wa_id}` : t('crm.whatsapp.noMessagesShort'))}</span>
                    </span>
                  </span>
                </button>
              })}
          </div>
        </aside>

        <main className={`min-h-0 min-w-0 flex-col ${!conversationId ? 'hidden md:flex' : 'flex'}`}>
          {!conversationId ? <div className="flex flex-1 items-center justify-center bg-[#F3F5F2] bg-[radial-gradient(rgba(14,21,37,0.06)_1px,transparent_1px)] [background-size:14px_14px]">
            <div className="max-w-[320px] rounded-2xl bg-white px-6 py-5 text-center shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
              <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#E6F5EE] text-[#1E8E4E]"><MessageCircle size={22} /></span>
              <p className="text-[15px] font-semibold">{t('crm.whatsapp.selectTitle')}</p>
              <p className="mt-1 text-[13px] text-[#586174]">{t('crm.whatsapp.selectText')}</p>
            </div>
          </div> : <>
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#E6EAF1] px-4 md:px-5">
              <button type="button" className={`${CHAT_ICON} md:hidden`} aria-label={t('crm.whatsapp.back')} onClick={() => setParams({})}><ArrowLeft size={18} /></button>
              <ChatAvatar name={conversation ? conversationName(conversation) : '#'} seed={conversationId} size={36} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[15px] font-semibold">{conversation ? conversationName(conversation) : t('crm.whatsapp.conversation')}</h2>
                <p className="truncate text-[12px] text-[#586174]">{conversation ? (`+${conversation.wa_id}` !== conversationName(conversation) ? `+${conversation.wa_id}` : t('crm.whatsapp.title')) : ''}</p>
              </div>
              {lead?.stage && <span className="hidden h-6 shrink-0 items-center gap-1.5 rounded-md bg-[#F1F3F6] px-2 text-[12px] font-medium text-[#3C3C43] sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: lead.stage.color || '#7B8494' }} />{lead.stage.name}
              </span>}
              {integration?.provider === 'edna' && <button type="button" className={CHAT_ICON} disabled={syncing || sending} title={syncOffset ? t('crm.whatsapp.syncOlder') : t('crm.whatsapp.sync')} aria-label={syncOffset ? t('crm.whatsapp.syncOlder') : t('crm.whatsapp.sync')} onClick={() => void syncHistory()}>
                <RefreshCw size={17} className={syncing ? 'animate-spin' : ''} />
              </button>}
              <button type="button" className={`${CHAT_ICON} ${searchOpen ? '!bg-[#EDF2FF] !text-[#2458D3]' : ''}`} aria-pressed={searchOpen} title={t('crm.whatsapp.findInChat')} aria-label={t('crm.whatsapp.findInChat')}
                onClick={() => { if (searchOpen) { setMessageSearch(''); setSearchMessages([]); setSearchBeforeId(null); setSearchError('') } setSearchOpen(!searchOpen) }}>
                <Search size={17} />
              </button>
              {crmLink && <Link className={`${CHAT_ICON} min-[1600px]:hidden`} to={crmLink} title={conversation?.lead ? t('crm.whatsapp.openLead') : t('crm.whatsapp.openContact')} aria-label={conversation?.lead ? t('crm.whatsapp.openLead') : t('crm.whatsapp.openContact')}><SquareArrowOutUpRight size={17} /></Link>}
            </header>
            {searchOpen && <div className="flex shrink-0 items-center gap-2 border-b border-[#E6EAF1] px-4 py-2 md:px-5">
              <label className={`${AXIS_UI.inputShell} min-w-0 flex-1`}>
                <Search size={16} className="shrink-0 text-[#586174]" />
                <input autoFocus className={AXIS_UI.input} type="search" aria-label={t('crm.whatsapp.findInChat')} placeholder={t('crm.whatsapp.findPlaceholder')} maxLength={200} value={messageSearch}
                  onChange={(e) => { setMessageSearch(e.target.value); setSearchMessages([]); setSearchBeforeId(null); setSearchError(''); setSearchLoading(Boolean(e.target.value.trim())) }} />
              </label>
            </div>}
            {syncNotice && <p role="status" className="shrink-0 border-b border-[#E6EAF1] px-5 py-2 text-[12px] text-[#586174]">{syncNotice}</p>}
            {searchActive && searchError && <div className="shrink-0 px-4 pt-3"><ErrorNotice message={searchError} /></div>}

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#F3F5F2] bg-[radial-gradient(rgba(14,21,37,0.06)_1px,transparent_1px)] px-4 py-4 [background-size:14px_14px] [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin] md:px-6" aria-live="polite" aria-busy={messagesLoading || searchLoading}>
              {(messagesLoading || (searchActive && searchLoading)) ? <div className="space-y-3" aria-hidden>
                {[56, 72, 40, 64].map((width, index) => <div key={index} className={`flex ${index % 2 ? 'justify-end' : 'justify-start'}`}><span className="block h-12 animate-pulse rounded-xl bg-white/80" style={{ width: `${width}%` }} /></div>)}
              </div> : <>
                {(searchActive ? searchBeforeId : beforeId) && <div className="mb-4 flex justify-center">
                  <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-medium text-[#3C3C43] shadow-[0_1px_2px_rgba(16,24,40,0.08)] hover:bg-[#F6F7F9] disabled:opacity-60" disabled={olderLoading} onClick={() => void loadOlder()}>
                    {olderLoading && <RefreshCw size={13} className="animate-spin" />}{t('crm.whatsapp.loadOlder')}
                  </button>
                </div>}
                {visibleMessages.length === 0 && !chatError && <div className="flex h-full items-center justify-center">
                  <div className="rounded-2xl bg-white px-6 py-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
                    <p className="text-[14px] font-semibold">{searchActive ? t('crm.whatsapp.notFoundTitle') : t('crm.whatsapp.noMessagesTitle')}</p>
                    <p className="mt-1 text-[13px] text-[#586174]">{searchActive ? t('crm.whatsapp.notFoundText') : t('crm.whatsapp.noMessagesText')}</p>
                  </div>
                </div>}
                {visibleMessages.map((message, index) => {
                  const url = safeMediaUrl(message.attachment?.url)
                  const out = message.direction === 'outbound'
                  const day = dayKey(message.created_at)
                  const showDay = !searchActive && (index === 0 || dayKey(visibleMessages[index - 1].created_at) !== day)
                  return <div key={message.id}>
                    {showDay && <div className="my-3 flex justify-center"><span className="rounded-full bg-white px-2.5 py-0.5 text-[12px] text-[#586174] shadow-[0_1px_1px_rgba(16,24,40,0.06)]">{dayLabel(message.created_at, t)}</span></div>}
                    <div className={`mb-1.5 flex ${out ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] px-3 py-2 shadow-[0_1px_1px_rgba(14,21,37,0.08)] sm:max-w-[68%] ${out ? 'rounded-[12px_4px_12px_12px] bg-[#E3F5E9]' : 'rounded-[4px_12px_12px_12px] bg-white'}`}>
                        {url && (message.message_type === 'image'
                          ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} loading="lazy" alt={(message.attachment?.name || message.attachment?.filename) || t('crm.whatsapp.imageAlt')} className="mb-1 max-h-64 rounded-lg" /></a>
                          : message.message_type === 'audio' ? <audio controls src={url} className="mb-1 max-w-full" />
                          : message.message_type === 'video' ? <video controls src={url} className="mb-1 max-h-64 max-w-full rounded-lg" />
                          : <a className="mb-1 flex items-center gap-2.5 rounded-lg bg-white/70 p-2 text-[13px] font-medium text-[#17202E] hover:bg-white" href={url} target="_blank" rel="noopener noreferrer">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#EDF2FF] text-[#2458D3]"><FileText size={16} /></span>
                            <span className="min-w-0 truncate">{(message.attachment?.name || message.attachment?.filename) || t('crm.whatsapp.openAttachment')}</span>
                          </a>)}
                        {message.text && <p className="whitespace-pre-wrap break-words text-[14px] leading-5 text-[#17202E]">{message.text}</p>}
                        {!message.text && !url && <p className="text-[13px] text-[#586174]">{t('crm.whatsapp.messageType', { type: message.message_type })}</p>}
                        <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-[#586174]">
                          <time dateTime={message.created_at}>{searchActive ? dateLabel(message.created_at) : clock(message.created_at)}</time>
                          {out && <Ticks status={message.status} label={t(`crm.whatsapp.status.${(['queued', 'sent', 'delivered', 'read', 'failed', 'received'].includes(message.status) ? message.status : 'sent') as 'sent'}`)} />}
                        </div>
                        {message.status === 'failed' && <p className="mt-1 text-[12px] text-[#C03437]">{message.error?.display_message || message.error?.message || t('crm.whatsapp.failed')}</p>}
                      </div>
                    </div>
                  </div>
                })}
                <div ref={messagesEnd} />
              </>}
            </div>

            <div className="shrink-0 space-y-2.5 border-t border-[#E6EAF1] px-4 pb-4 pt-3">
              {chatError && <ErrorNotice message={chatError} />}
              {conversation && !conversation.is_open && <div className="flex items-start gap-2 rounded-lg bg-[#FDF2E1] px-3 py-2 text-[13px] text-[#8A4B00]">
                <Clock3 size={16} className="mt-0.5 shrink-0" />{canTemplate ? t('crm.whatsapp.windowClosed') : t('crm.whatsapp.windowClosedNoTemplates')}
              </div>}
              <form onSubmit={submitText} className="flex items-end gap-1.5 rounded-xl border border-[#D0D5DD] bg-white p-1.5 transition focus-within:border-[#2458D3] focus-within:shadow-[0_0_0_3px_rgba(36,88,211,0.12)]">
                {canTemplate && <button type="button" className={CHAT_ICON} title={t('crm.whatsapp.attach')} aria-label={t('crm.whatsapp.attach')} disabled={sending || !conversation?.is_open} onClick={() => setAttachmentOpen(true)}><Paperclip size={18} /></button>}
                <textarea rows={1} className="max-h-36 min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[14px] leading-5 text-[#17202E] outline-none placeholder:text-[#8A93A5] disabled:cursor-not-allowed"
                  aria-label={t('crm.whatsapp.messageLabel')} placeholder={t('crm.whatsapp.messagePlaceholder')} value={text} maxLength={4096} disabled={sending || !canWrite}
                  onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px` }}
                  onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submitText(event) }} />
                {canTemplate && <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#E2E5EA] bg-white px-2.5 text-[13px] font-medium text-[#3C3C43] hover:bg-[#F6F7F9] disabled:opacity-50" disabled={sending} onClick={() => setTemplateOpen(true)}>
                  <MessageSquareText size={15} />{t('crm.whatsapp.template')}
                </button>}
                <button type="submit" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2458D3] text-white transition hover:bg-[#1D4AB8] disabled:bg-[#C7D2EA]" aria-label={t('crm.whatsapp.send')} disabled={sending || !text.trim() || !canWrite}>
                  {sending ? <RefreshCw size={15} className="animate-spin" /> : <ArrowUp size={17} />}
                </button>
              </form>
            </div>
          </>}
        </main>

        {conversationId && <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-[#E6EAF1] min-[1600px]:flex" aria-label={t('crm.whatsapp.client')}>
          <div className="flex flex-col items-center gap-1.5 border-b border-[#E6EAF1] px-5 py-5 text-center">
            <ChatAvatar name={conversation ? conversationName(conversation) : '#'} seed={conversationId} size={56} />
            <p className="mt-1 break-words text-[16px] font-semibold">{conversation ? conversationName(conversation) : ''}</p>
            <p className="text-[13px] text-[#586174]">{conversation?.lead ? t('crm.whatsapp.lead', { id: conversation.lead.id }) : conversation?.contact ? t('crm.whatsapp.contact', { id: conversation.contact.id }) : t('crm.whatsapp.noCrm')}</p>
            {crmLink && <Link to={crmLink} className={`${AXIS_UI.secondaryButton} mt-2`}>{conversation?.lead ? t('crm.whatsapp.openLead') : t('crm.whatsapp.openContact')}</Link>}
          </div>
          <dl className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 gap-y-3 px-5 py-4 text-[13px]">
            <dt className="text-[#586174]">{t('crm.whatsapp.phone')}</dt><dd className="min-w-0 truncate tabular-nums">{lead?.phone || contact?.phone || (conversation ? `+${conversation.wa_id}` : '—')}</dd>
            {lead?.stage && <><dt className="text-[#586174]">{t('crm.whatsapp.stage')}</dt><dd className="flex min-w-0 items-center gap-1.5"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: lead.stage.color || '#7B8494' }} /><span className="truncate">{lead.stage.name}</span></dd></>}
            {lead?.source && <><dt className="text-[#586174]">{t('crm.whatsapp.source')}</dt><dd className="min-w-0 truncate capitalize">{lead.source}</dd></>}
            <dt className="text-[#586174]">{t('crm.whatsapp.window')}</dt><dd className={conversation?.is_open ? 'text-[#0F7A55]' : 'text-[#A85A00]'}>{conversation?.is_open ? t('crm.whatsapp.windowOpen') : t('crm.whatsapp.windowShut')}</dd>
          </dl>
        </aside>}
      </div>
    </>}
    {attachmentOpen && conversationId && <WhatsAppAttachmentForm repository={repository} conversationId={conversationId} onClose={() => setAttachmentOpen(false)} onSent={(message) => acceptMessage(conversationId, message)} onBusy={(value) => { sendingRef.current = value; setSending(value) }} />}
    {templateOpen && <AppModal title={t('crm.whatsapp.templateTitle')} onClose={() => { if (!sending && !templateUploadBusy) setTemplateOpen(false) }}><form className="grid gap-4" onSubmit={(event) => void send(event, true)}>{templatesLoading ? <p role="status">{t('crm.whatsapp.templateLoading')}</p> : <><Field label={t('crm.whatsapp.templateField')}><CrmSelect required disabled={sending || templateUploadBusy} value={templateId} placeholder={t('crm.whatsapp.templateChoose')} onChange={(next) => { setTemplateId(next); setVariables({}); setHeaderVariables(''); setButtonVariables(''); setTemplateAttachment(null); setTemplateUploadPending(false) }} options={templates.map((template) => ({ value: String(template.id), label: template.name, description: template.content?.text }))} /></Field>{templates.length === 0 && !templateError && <p className="text-sm text-[#586174]">{t('crm.whatsapp.templateEmpty')}</p>}{selectedTemplate?.content?.text && <p className="whitespace-pre-wrap rounded-xl bg-[#F6F7F9] p-3 text-sm">{selectedTemplate.content.text}</p>}{selectedTemplate?.variable_indexes?.map((index) => <Field key={index} label={t('crm.whatsapp.templateValue', { index })}><input required disabled={sending} className={inputClass} value={variables[index] || ''} onChange={(e) => setVariables((current) => ({ ...current, [index]: e.target.value }))} /></Field>)}{selectedTemplate && <><Field label={t('crm.whatsapp.templateHeader')}><textarea disabled={sending} className={inputClass} rows={2} value={headerVariables} onChange={(event) => setHeaderVariables(event.target.value)} /></Field><Field label={t('crm.whatsapp.templateButtons')}><textarea disabled={sending} className={inputClass} rows={2} value={buttonVariables} onChange={(event) => setButtonVariables(event.target.value)} /></Field><WhatsAppTemplateAttachment key={templateId} repository={repository} value={templateAttachment} disabled={sending} onChange={setTemplateAttachment} onBusy={setTemplateUploadBusy} onPending={setTemplateUploadPending} /><p className="text-xs text-[#586174]">{t('crm.whatsapp.templateHint')}</p></>}</>}{templateError && <ErrorNotice message={templateError} />}<AppButton type="submit" isLoading={sending} disabled={!selectedTemplate || templatesLoading || sending || templateUploadBusy || templateUploadPending}>{t('crm.whatsapp.templateSend')}</AppButton></form></AppModal>}
  </section>
}
