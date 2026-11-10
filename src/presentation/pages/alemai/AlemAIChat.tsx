import { type ChangeEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'


import { createAuthController } from '../../auth/createAuthController'

import {
  askQuestion,
  createChatConversation,
  createChatSection,
  deleteChatConversation,
  deleteChatSection,
  listChatSections,
  updateChatConversation,
  updateChatSection,
  getChatConversation,
  listAIDocuments,
  listChatConversations,
  uploadAIDocument,
  waitForAIDocument,
} from './chat/api/client'
import SettingsModal from './chat/components/SettingsModal'
import { ChatSidebar, type AiView, type ChatAction } from './chat/components/ChatSidebar'
import { DangerDialog, LimitsDialog, MoveChatDialog, RenameChatDialog, SectionDialog } from './chat/components/ChatDialogs'
import { SectionsView } from './chat/components/SectionsView'
import { ArchiveView } from './chat/components/ArchiveView'
import { ChatNotice } from './chat/components/ChatNotice'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { Archive, ArrowUp, BookOpen, ChevronDown, FileText, FolderInput, Globe, MoreHorizontal, PanelLeft, Paperclip, Pencil, Pin, PinOff, Sparkles, Table2, Trash2, X } from 'lucide-react'
import { CHAT_FOCUS, ICON_BTN, errorText, sectionTone } from './chat/chatUi'
import { useTranslation } from 'react-i18next'
import { classifyAICallError } from '../../../domain/entities/AICallError'
import { formatDateTime } from '../../../shared/i18n/format'
import { dispatchAILimitsInvalidated, notifyAIOperationCompleted } from '../../../shared/ai/aiLimitsEvents'
import type { AlemAiChatSection, AlemAiChatSectionInput, AlemAiDocument, AlemAiProfile } from '../../../infrastructure/repositories/HttpAlemAiRepository'

import type {
  AskApiResponse,
  AskHistoryMessage,
  ChatConversationSummary,
  ChatActionDecision,
} from './chat/api/types'
import { INITIAL_MESSAGES } from './chat/data'
import type { ChatMessage } from './chat/types'
import { getCurrentRuTime } from './chat/utils'
import { MessageBubble } from './chat/components/MessageBubble'
import { TypingDots } from './chat/components/TypingDots'
import { MeetingAiPanel } from './meeting-ai/components/MeetingAiPanel'
import { SmartAgentPanel } from './smart-agent/components/SmartAgentPanel'
import { TzAiPanel } from './tzai/components/TzAiPanel'
import './styles/alemai.css'

const SELECTED_TOOL_STORAGE_KEY = 'alemai:selected-tool'
const SELECTED_CONVERSATION_STORAGE_KEY = 'alemai:chat:selected-conversation'
const SEARCH_MODE_STORAGE_KEY = 'alemai:chat:search-mode'
const CHAT_HISTORY_ENABLED = true

type SelectedTool = 'chat' | 'meeting-ai' | 'tzai' | 'smart-agent'
type SearchMode = 'auto' | 'kb' | 'web'

interface ComposerAttachment {
  file: File
  name: string
  previewUrl?: string
}

const isSelectedTool = (value: string | null): value is SelectedTool =>
  value === 'chat' || value === 'meeting-ai' || value === 'tzai' || value === 'smart-agent'

const isSearchMode = (value: string | null): value is SearchMode =>
  value === 'auto' || value === 'kb' || value === 'web'

const hasNoLiveSources = (response: AskApiResponse): boolean => {
  const haystack = [
    response.answer,
    response.rationale,
    response.confidence?.reason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes('no live sources') || haystack.includes('веб-поиск не вернул документов')
}

const shouldHideDisplayUrl = (value: string): boolean => {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false

  return normalized === 'https://alem-workspace.gov.kz/v1/chats' || normalized.startsWith('https://alem-workspace.gov.kz/v1/chats/')
}

const sanitizeDisplayText = (value: string): string =>
  value
    .split('\n')
    .filter((line) => !shouldHideDisplayUrl(line.trim()))
    .join('\n')

const adaptQuestionForSearchMode = (question: string, mode: SearchMode): string => {
  const trimmed = question.trim()
  if (!trimmed) return trimmed

  if (mode === 'kb') {
    return `[Режим: база знаний]\nИспользуй внутреннюю базу знаний и не опирайся на веб-поиск, если это не абсолютно необходимо.\n\nВопрос: ${trimmed}`
  }

  if (mode === 'web') {
    return `[Режим: веб-поиск]\nСделай упор на актуальные внешние источники и веб-поиск. Если живые источники не найдены, явно скажи об этом.\n\nВопрос: ${trimmed}`
  }

  return trimmed
}

const formatAssistantText = (response: AskApiResponse, requestedMode: SearchMode): string => {
  const appendDocumentSources = (value: string): string => {
    const sources = response.document_sources || []
    if (sources.length === 0) return sanitizeDisplayText(value)
    const lines = sources.slice(0, 8).map((source) => {
      const chunk = source.locator?.chunk
      return `- ${source.name}${chunk ? ` (фрагмент ${chunk})` : ''}`
    })
    return sanitizeDisplayText(`${value}\n\nИсточники в документах:\n${lines.join('\n')}`)
  }

  if (hasNoLiveSources(response)) {
    if (requestedMode === 'web') {
      return [
        'Веб-поиск не вернул актуальных источников по этому запросу.',
        '',
        'Попробуйте:',
        '- уточнить запрос или добавить контекст',
        '- указать должность, организацию или период',
        '- повторить запрос позже',
      ].join('\n')
    }

    return [
      'Не удалось получить актуальные источники по этому запросу.',
      '',
      'Попробуйте переформулировать вопрос или уточнить детали.',
    ].join('\n')
  }

  if (!response.sources?.length) {
    return appendDocumentSources(response.answer)
  }

  if (/источники\s*:/i.test(response.answer)) {
    return sanitizeDisplayText(response.answer)
  }

  const topSources = response.sources.filter((source) => !shouldHideDisplayUrl(source.url)).slice(0, 3)
  if (topSources.length === 0) {
    return appendDocumentSources(response.answer)
  }
  const sourcesText = topSources.map((source) => `- ${source.url}`).join('\n')

  return appendDocumentSources(`${response.answer}\n\nИсточники:\n${sourcesText}`)
}

const toChatMessages = (history: AskHistoryMessage[]): ChatMessage[] =>
  history.map((item, index) => ({
    id: Date.now() + index,
    role: item.role,
    text: item.content,
    meta: { dataCards: item.data_cards, dataSources: item.data_sources },
    time: item.created_at ? new Date(item.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : undefined,
  }))

const normalizeChatName = (value?: string | null): string => {
  const text = (value || '').trim()
  if (text) return text
  return 'Новый чат'
}

const buildNewConversationName = (input: string): string => {
  const normalized = input.trim().replace(/\s+/g, ' ')
  if (!normalized) return 'Новый чат'
  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized
}

const PLACEHOLDER_NAMES = new Set(['', 'новый чат', 'жаңа чат', 'new chat'])
const isPlaceholderName = (value?: string | null) => PLACEHOLDER_NAMES.has((value || '').trim().toLowerCase())
const isEmptyDraft = (chat: ChatConversationSummary) => isPlaceholderName(chat.name) && !chat.last_message_at && !chat.preview && !chat.last_message

const getConversationSortValue = (value: ChatConversationSummary): number =>
  Math.max(Date.parse(value.updated_at || '') || 0, Date.parse(value.last_message_at || '') || 0) || Date.now()

const sortConversations = (items: ChatConversationSummary[]): ChatConversationSummary[] =>
  [...items].sort((a, b) => getConversationSortValue(b) - getConversationSortValue(a))

const upsertConversation = (
  items: ChatConversationSummary[],
  nextConversation: ChatConversationSummary,
): ChatConversationSummary[] => {
  const existing = items.find((item) => item.conv_id === nextConversation.conv_id)
  const withoutTarget = items.filter((item) => item.conv_id !== nextConversation.conv_id)
  return sortConversations([{ ...existing, ...nextConversation }, ...withoutTarget])
}

type DialogState =
  | { type: 'rename' | 'delete' | 'move'; chat: ChatConversationSummary }
  | { type: 'section'; section: AlemAiChatSection | null; moveChat?: ChatConversationSummary }
  | { type: 'deleteSection'; section: AlemAiChatSection }
  | { type: 'deleteMany'; ids: string[] }
  | { type: 'limits' }

interface AlemAIChatProps {
  authToken: string
  initialPrompt?: string
}

export default function AlemAIChat({ authToken, initialPrompt = '' }: AlemAIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState(initialPrompt)
  const [isTyping, setIsTyping] = useState(false)
  const [selectedConversationId, setSelectedConversationId] = useState<string>(() =>
    CHAT_HISTORY_ENABLED ? window.localStorage.getItem(SELECTED_CONVERSATION_STORAGE_KEY) || '' : '',
  )
  const [conversationHistory, setConversationHistory] = useState<AskHistoryMessage[]>([])
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([])
  const [isConversationsLoading, setIsConversationsLoading] = useState(false)
  const [conversationListToken, setConversationListToken] = useState('')
  const [isConversationLoading, setIsConversationLoading] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftSectionId, setDraftSectionId] = useState<string | null>(null)
  const skipHydrateRef = useRef('')
  const [conversationsError, setConversationsError] = useState('')
  const [conversationDetailError, setConversationDetailError] = useState('')
  const [documentStatuses, setDocumentStatuses] = useState<AlemAiDocument[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [compactLayout, setCompactLayout] = useState(false)
  const [selectedTool, setSelectedTool] = useState<SelectedTool>(() => {
    if (initialPrompt) return 'chat'
    const stored = window.localStorage.getItem(SELECTED_TOOL_STORAGE_KEY)
    return isSelectedTool(stored) ? stored : 'chat'
  })
  const [searchMode, setSearchMode] = useState<SearchMode>(() => {
    const stored = window.localStorage.getItem(SEARCH_MODE_STORAGE_KEY)
    return isSearchMode(stored) ? stored : 'auto'
  })

  // Quick Action Buttons States
  const [isReasoningActive] = useState(false)
  const [isCreateImageActive] = useState(false)
  const [isDeepResearchActive] = useState(false)

  const { t } = useTranslation('ai')
  const isSendingRef = useRef<boolean>(false)
  const conversationEpoch = useRef(0)
  const [composerError, setComposerError] = useState<{
    message: string
    retryAt?: string | null
    retryKind?: string
    reason?: string
  } | null>(null)

  // Profile Information
  const { authController } = useMemo(() => createAuthController(), [])
  const [userProfile, setUserProfile] = useState<{ name: string; email: string; avatarUrl: string }>({
    name: 'Пользователь',
    email: '',
    avatarUrl: '',
  })

  // Settings & Theme Customization States
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [view, setView] = useState<AiView>('chat')
  const [sections, setSections] = useState<AlemAiChatSection[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [sectionsError, setSectionsError] = useState('')
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [headerMenu, setHeaderMenu] = useState<HTMLElement | null>(null)
  const [sourceMenu, setSourceMenu] = useState<HTMLElement | null>(null)
  const [customAssistantName, setCustomAssistantName] = useState('Ассистент')
  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null)

  const handleProfileUpdated = useCallback((prof: AlemAiProfile) => {
    if (prof.assistant_name) {
      setCustomAssistantName(prof.assistant_name)
    }
  }, [])

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const selectedConversationIdRef = useRef(selectedConversationId)

  const clearAttachment = useCallback(() => {
    setAttachment((prev) => {
      if (prev?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl)
      }
      return null
    })
  }, [])

  useEffect(() => () => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl)
    }
  }, [attachment])

  const token = authToken.trim()
  const currentChatTokenRef = useRef(token)
  currentChatTokenRef.current = token

  useEffect(() => {
    let isCancelled = false
    const loadProfile = async () => {
      try {
        const authModel = await authController.bootstrap()
        if (!isCancelled) {
          setUserProfile({
            name: authModel.name || 'Пользователь',
            email: authModel.email || '',
            avatarUrl: authModel.avatarUrl || '',
          })
        }
      } catch {
        // ignore
      }
    }
    void loadProfile()
    return () => {
      isCancelled = true
    }
  }, [authController])

  useEffect(() => {
    const applyLayout = () => {
      const compact = window.innerWidth < 1024
      setCompactLayout(compact)
      setSidebarOpen(!compact)
    }

    applyLayout()
    window.addEventListener('resize', applyLayout)
    return () => window.removeEventListener('resize', applyLayout)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  useEffect(() => {
    window.localStorage.setItem(SELECTED_TOOL_STORAGE_KEY, selectedTool)
  }, [selectedTool])

  useEffect(() => {
    window.localStorage.setItem(SEARCH_MODE_STORAGE_KEY, searchMode)
  }, [searchMode])

  useEffect(() => {
    if (!CHAT_HISTORY_ENABLED) {
      window.localStorage.removeItem(SELECTED_CONVERSATION_STORAGE_KEY)
      return
    }

    if (selectedConversationId) {
      window.localStorage.setItem(SELECTED_CONVERSATION_STORAGE_KEY, selectedConversationId)
      return
    }
    window.localStorage.removeItem(SELECTED_CONVERSATION_STORAGE_KEY)
  }, [selectedConversationId])

  const isSelectedConversationPending = Boolean(selectedConversationId) && conversationListToken !== token

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    if (!CHAT_HISTORY_ENABLED) {
      setConversations([])
      return
    }

    let isAlive = true

    const loadConversations = async () => {
      if (!token) {
        setConversations([])
        return
      }

      ++conversationEpoch.current
      setIsConversationLoading(false)
      setConversationListToken('')
      setIsConversationsLoading(true)
      setConversationsError('')
      try {
        const loaded = await listChatConversations(token)
        if (!isAlive) return

        const sorted = sortConversations(loaded)
        setConversations(sorted)

        const firstVisible = sorted.find((chat) => !chat.archived && !isEmptyDraft(chat))
        const storedId = selectedConversationIdRef.current
        // A stored ID may belong to a different signed-in account. Only the
        // server's owner-scoped list may authorize restoring that selection.
        if (!storedId || !sorted.some((chat) => chat.conv_id === storedId)) {
          ++conversationEpoch.current
          setIsConversationLoading(false)
          setSelectedConversationId(firstVisible?.conv_id || '')
          setConversationDetailError('')
          setComposerError(null)
        }
        setConversationListToken(token)
      } catch (error) {
        if (!isAlive) return
        setConversationsError(error instanceof Error ? error.message : 'Не удалось загрузить историю чатов')
      } finally {
        if (isAlive) {
          setIsConversationsLoading(false)
        }
      }
    }

    void loadConversations()

    return () => {
      isAlive = false
    }
  }, [token])

  const hydrateConversation = useCallback(
    async (convId: string) => {
      if (!token || !convId) return

      const hydrationEpoch = conversationEpoch.current
      setIsConversationLoading(true)
      setConversationDetailError('')
      setConversationHistory([])
      setMessages([])
      setDocumentStatuses([])

      try {
        const [detail, documents] = await Promise.all([
          getChatConversation(token, convId),
          listAIDocuments(token, convId),
        ])
        if (hydrationEpoch !== conversationEpoch.current || token !== currentChatTokenRef.current) return
        const history = Array.isArray(detail.messages) ? detail.messages : []
        setConversationHistory(history)
        setMessages(toChatMessages(history))
        setDocumentStatuses(documents)
        setConversations((prev) => {
          const existing = prev.find((item) => item.conv_id === detail.conv_id)
          return upsertConversation(prev, {
            conv_id: detail.conv_id,
            name: existing?.name || normalizeChatName(detail.name),
            updated_at: detail.updated_at || existing?.updated_at || null,
            preview: history[history.length - 1]?.content || null,
          })
        })
      } catch (error) {
        if (hydrationEpoch !== conversationEpoch.current || token !== currentChatTokenRef.current) return
        setConversationDetailError(error instanceof Error ? error.message : 'Не удалось загрузить выбранный диалог')
      } finally {
        if (hydrationEpoch === conversationEpoch.current && token === currentChatTokenRef.current) setIsConversationLoading(false)
      }
    },
    [token],
  )

  const handleSelectConversation = useCallback(
    (convId: string) => {
      if (!convId) return
      ++conversationEpoch.current
      setIsConversationLoading(false)
      setSelectedTool('chat')
      setSelectedConversationId(convId)
      setDraftTitle('')
      setComposerError(null)
      if (compactLayout) {
        setSidebarOpen(false)
      }
    },
    [compactLayout],
  )

  useEffect(() => {
    if (!CHAT_HISTORY_ENABLED) {
      return
    }

    if (!selectedConversationId || !token) {
      if (!selectedConversationId) {
        setConversationHistory([])
        setMessages(INITIAL_MESSAGES)
      }
      return
    }

    if (isSelectedConversationPending) return

    if (skipHydrateRef.current === selectedConversationId) {
      skipHydrateRef.current = ''
      return
    }
    void hydrateConversation(selectedConversationId)
  }, [selectedConversationId, token, hydrateConversation, isSelectedConversationPending])

  useEffect(() => {
    if (!token || !selectedConversationId || !documentStatuses.some((item) => item.status === 'uploaded' || item.status === 'processing')) {
      return
    }
    let active = true
    const timer = window.setInterval(() => {
      void listAIDocuments(token, selectedConversationId).then((documents) => {
        if (active) setDocumentStatuses(documents)
      }).catch(() => undefined)
    }, 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [token, selectedConversationId, documentStatuses])

  const autoResize = () => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`
  }

  const resetComposer = () => {
    setInput('')
    clearAttachment()
    setIsTyping(false)
    setComposerError(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const startFreshConversation = () => {
    setDraftSectionId(null)
    ++conversationEpoch.current
    setIsConversationLoading(false)
    setSelectedTool('chat')
    setSelectedConversationId('')
    setDraftTitle('')
    setConversationHistory([])
    setMessages(INITIAL_MESSAGES)
    setDocumentStatuses([])
    setComposerError(null)
    setConversationsError('')
    resetComposer()
    if (compactLayout) setSidebarOpen(false)
    window.setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const sendMessage = async (actionDecision?: ChatActionDecision) => {
    if (isSendingRef.current || isTyping || isConversationLoading || isSelectedConversationPending) {
      return false
    }

    const trimmedInput = actionDecision ? t(actionDecision.decision === 'confirm' ? 'chat.agentActionConfirm' : 'chat.agentActionCancel') : input.trim()
    if (!trimmedInput && !attachment) {
      return false
    }

    const requestEpoch = conversationEpoch.current
    isSendingRef.current = true
    setIsTyping(true)
    setComposerError(null)

    const savedInput = input
    const savedAttachment = actionDecision ? null : attachment
    const savedMessages = messages
    const sendAttemptStartId = Date.now()

    const fallbackQuestion = savedAttachment
      ? savedAttachment.previewUrl
        ? 'Опиши изображение'
        : 'Проанализируй вложение'
      : ''
    let requestText = trimmedInput || fallbackQuestion
    let displayText = trimmedInput

    if (!actionDecision) {
      setInput('')
      setAttachment(null)
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    if (savedAttachment) {
      const attachmentLabel = savedAttachment.previewUrl
        ? `[Изображение: ${savedAttachment.name}]`
        : `[Файл: ${savedAttachment.name}]`
      displayText = [attachmentLabel, trimmedInput].filter(Boolean).join('\n')
    }

    if (isReasoningActive) {
      requestText = `[Рассуждение] ${requestText}`
      displayText = `[Рассуждение] ${displayText || fallbackQuestion}`
    } else if (isCreateImageActive) {
      requestText = `[Создать изображение] ${requestText}`
      displayText = `[Создать изображение] ${displayText || fallbackQuestion}`
    } else if (isDeepResearchActive) {
      requestText = `[Глубокий поиск] ${requestText}`
      displayText = `[Глубокий поиск] ${displayText || fallbackQuestion}`
    }

    if (!displayText) {
      displayText = requestText
    }

    setMessages((prev) => [...prev, { id: sendAttemptStartId, role: 'user', text: displayText, time: getCurrentRuTime() }])

    try {
      if (!token) {
        throw new Error(t('errors.sessionRequired'))
      }

      let requestConversationId = selectedConversationId || ''
      let requestFile = savedAttachment?.file ?? null
      const topic = buildNewConversationName(trimmedInput || savedAttachment?.name || fallbackQuestion)
      if (!requestConversationId) setDraftTitle(topic)
      if (!requestConversationId && !(savedAttachment && !savedAttachment.previewUrl)) {
        const created = await createChatConversation(token, topic, draftSectionId)
        if (requestEpoch !== conversationEpoch.current) return false
        requestConversationId = created.conv_id
        setConversations((prev) => upsertConversation(prev, { ...created, name: isPlaceholderName(created.name) ? topic : created.name, updated_at: new Date().toISOString() }))
      } else if (requestConversationId) {
        const current = conversations.find((item) => item.conv_id === requestConversationId)
        if (current && isPlaceholderName(current.name)) {
          setConversations((prev) => prev.map((item) => item.conv_id === requestConversationId ? { ...item, name: topic } : item))
          void updateChatConversation(requestConversationId, { title: topic }).catch(() => undefined)
        }
      }
      if (savedAttachment && !savedAttachment.previewUrl) {
        if (!requestConversationId) {
          const created = await createChatConversation(token, topic, draftSectionId)
          if (requestEpoch !== conversationEpoch.current) return false
          requestConversationId = created.conv_id
          skipHydrateRef.current = requestConversationId
          setSelectedConversationId(requestConversationId)
          setConversations((prev) => upsertConversation(prev, { ...created, updated_at: created.updated_at || new Date().toISOString() }))
        }
        const uploaded = await uploadAIDocument(token, requestConversationId, savedAttachment.file)
        if (requestEpoch !== conversationEpoch.current) return false
        setDocumentStatuses((prev) => [uploaded, ...prev.filter((item) => item.id !== uploaded.id)])
        setMessages((prev) => [...prev, {
          id: Date.now() + 1,
          role: 'assistant',
          time: getCurrentRuTime(),
          text: `Документ «${savedAttachment.name}» загружен и обрабатывается. Я отвечу после завершения проверки.`,
        }])
        const readyDocument = await waitForAIDocument(token, requestConversationId, uploaded.id)
        if (requestEpoch !== conversationEpoch.current) return false
        setDocumentStatuses((prev) => [readyDocument, ...prev.filter((item) => item.id !== readyDocument.id)])
        setMessages((prev) => [...prev, {
          id: Date.now() + 2,
          role: 'assistant',
          time: getCurrentRuTime(),
          text: `Документ «${savedAttachment.name}» готов. Ищу ответ по его содержимому…`,
        }])
        requestFile = null
      }

      const response = await askQuestion({
        question: adaptQuestionForSearchMode(requestText, searchMode),
        token,
        convId: requestConversationId || null,
        conversationHistory,
        file: requestFile,
        actionDecision,
      })

      if (savedAttachment?.previewUrl) {
        URL.revokeObjectURL(savedAttachment.previewUrl)
      }

      if (requestEpoch !== conversationEpoch.current) return false
      const payload = response.fullResponse
      const nextConvId = response.convId || requestConversationId
      const nextHistory = response.conversationHistory

      if (nextConvId) {
        if (nextConvId !== selectedConversationIdRef.current) skipHydrateRef.current = nextConvId
        setSelectedConversationId(nextConvId)
      }
      setConversationHistory(nextHistory)

      if (nextConvId) {
        setConversations((prev) => {
          const known = prev.find((item) => item.conv_id === nextConvId)?.name
          return upsertConversation(prev, {
            conv_id: nextConvId,
            name: isPlaceholderName(known) ? topic : normalizeChatName(known),
            updated_at: new Date().toISOString(),
            preview: payload.answer,
            last_message: payload.answer,
          })
        })
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          time: getCurrentRuTime(),
          text: formatAssistantText(payload, searchMode),
          meta: {
            route: payload.route,
            dataCards: payload.data_cards,
            dataSources: payload.data_sources,
            learned: payload.learned,
            rationale: payload.rationale,
            confidenceScore: payload.confidence?.score,
            confidenceLabel: payload.confidence?.label,
            noLiveSources: hasNoLiveSources(payload),
            sources: payload.sources?.filter((source) => !shouldHideDisplayUrl(source.url)).map((source) => ({
              title: source.title,
              url: source.url,
            })),
          },
        },
      ])
      notifyAIOperationCompleted()
      return true
    } catch (error) {
      if (requestEpoch !== conversationEpoch.current) return false
      const classified = classifyAICallError(error, t)
      if (classified.kind === 'pre_call_rejection' || classified.kind === 'client_error') {
        // Restore input and attachment
        setInput(savedInput)
        if (savedAttachment) {
          setAttachment({
            file: savedAttachment.file,
            name: savedAttachment.name,
            previewUrl: savedAttachment.previewUrl ? URL.createObjectURL(savedAttachment.file) : undefined,
          })
        }
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
        // Roll back unaccepted messages
        setMessages(savedMessages)
        // Show composer error banner with specific safe reason and retry time
        setComposerError({
          message: classified.userMessage,
          retryAt: classified.retryAt,
          retryKind: classified.retryKind,
          reason: classified.reason,
        })
        dispatchAILimitsInvalidated()
      } else if (classified.kind === 'unknown_outcome') {
        if (savedAttachment?.previewUrl) {
          URL.revokeObjectURL(savedAttachment.previewUrl)
        }
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            time: getCurrentRuTime(),
            text: classified.userMessage,
            meta: { isError: true, retryable: false },
          },
        ])
      } else {
        if (savedAttachment?.previewUrl) {
          URL.revokeObjectURL(savedAttachment.previewUrl)
        }
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            time: getCurrentRuTime(),
            text: classified.userMessage,
            meta: { isError: true, retryable: !savedAttachment },
          },
        ])
      }
      return false
    } finally {
      isSendingRef.current = false
      setIsTyping(false)
    }
  }

  const handleEditSubmit = async (newText: string, messageId: number) => {
    if (isSendingRef.current || isTyping || isConversationLoading || isSelectedConversationPending) return false

    const editedIndex = messages.findIndex((m) => m.id === messageId)
    if (editedIndex === -1) return false

    const requestEpoch = conversationEpoch.current
    isSendingRef.current = true
    setIsTyping(true)
    setComposerError(null)

    const originalMessages = messages
    const originalUserMessage = messages[editedIndex]
    const updatedUserMessage = {
      ...originalUserMessage,
      text: newText,
      time: getCurrentRuTime(),
    }
    const newMessages = [...messages.slice(0, editedIndex), updatedUserMessage]

    setMessages(newMessages)

    const historyToSend = messages.slice(0, editedIndex).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.text,
    }))

    let requestText = newText
    if (isReasoningActive) {
      requestText = `[Рассуждение] ${requestText}`
    } else if (isCreateImageActive) {
      requestText = `[Создать изображение] ${requestText}`
    } else if (isDeepResearchActive) {
      requestText = `[Глубокий поиск] ${requestText}`
    }

    try {
      if (!token) {
        throw new Error(t('errors.sessionRequired'))
      }

      const response = await askQuestion({
        question: adaptQuestionForSearchMode(requestText, searchMode),
        token,
        convId: selectedConversationId || null,
        conversationHistory: historyToSend,
        file: null,
      })

      if (requestEpoch !== conversationEpoch.current) return false
      const payload = response.fullResponse
      const nextConvId = response.convId || selectedConversationId
      const nextHistory = response.conversationHistory

      if (nextConvId) {
        setSelectedConversationId(nextConvId)
      }
      setConversationHistory(nextHistory)

      if (nextConvId) {
        const conversationName = buildNewConversationName(newText)
        setConversations((prev) =>
          upsertConversation(prev, {
            conv_id: nextConvId,
            name: normalizeChatName(prev.find((item) => item.conv_id === nextConvId)?.name || conversationName),
            updated_at: new Date().toISOString(),
            preview: payload.answer,
            last_message: payload.answer,
          }),
        )
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          time: getCurrentRuTime(),
          text: formatAssistantText(payload, searchMode),
          meta: {
            route: payload.route,
            dataCards: payload.data_cards,
            dataSources: payload.data_sources,
            learned: payload.learned,
            rationale: payload.rationale,
            confidenceScore: payload.confidence?.score,
            confidenceLabel: payload.confidence?.label,
            noLiveSources: hasNoLiveSources(payload),
            sources: payload.sources?.filter((source) => !shouldHideDisplayUrl(source.url)).map((source) => ({
              title: source.title,
              url: source.url,
            })),
          },
        },
      ])
      notifyAIOperationCompleted()
    } catch (error) {
      if (requestEpoch !== conversationEpoch.current) return false
      const classified = classifyAICallError(error, t)
      if (classified.kind === 'pre_call_rejection' || classified.kind === 'client_error') {
        // Revert user message back to original text before failed edit
        setMessages(originalMessages)
        setComposerError({
          message: classified.userMessage,
          retryAt: classified.retryAt,
          retryKind: classified.retryKind,
          reason: classified.reason,
        })
        dispatchAILimitsInvalidated()
        return false
      } else if (classified.kind === 'unknown_outcome') {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            time: getCurrentRuTime(),
            text: classified.userMessage,
            meta: { isError: true, retryable: false },
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            time: getCurrentRuTime(),
            text: classified.userMessage,
            meta: { isError: true, retryable: true },
          },
        ])
      }
    } finally {
      isSendingRef.current = false
      setIsTyping(false)
    }
    return true
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (isSendingRef.current || isTyping) return
      void sendMessage()
    }
  }

  const handleAttachmentClick = () => {
    if (!isSendingRef.current) fileInputRef.current?.click()
  }
  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || isSendingRef.current) return
    const normalizedName = file.name.trim() || 'file'
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
    setAttachment((prev) => {
      if (prev?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl)
      }
      return {
        file,
        name: normalizedName,
        previewUrl,
      }
    })
  }
  useEffect(() => {
    if (!token) return
    let alive = true
    setSectionsLoading(true)
    setSectionsError('')
    listChatSections()
      .then((loaded) => { if (alive) setSections(loaded) })
      .catch((error) => { if (alive) setSectionsError(errorText(error, t('chat.actionFailed'))) })
      .finally(() => { if (alive) setSectionsLoading(false) })
    return () => { alive = false }
  }, [token, t])

  const activeConversations = useMemo(() => conversations.filter((chat) => !chat.archived && !isEmptyDraft(chat)), [conversations])
  const archivedConversations = useMemo(() => conversations.filter((chat) => chat.archived), [conversations])
  const selectedChat = conversations.find((chat) => chat.conv_id === selectedConversationId) ?? null
  const selectedSection = selectedChat?.section_id ? sections.find((section) => section.id === selectedChat.section_id) ?? null : null

  const closeDialog = () => {
    if (dialogBusy) return
    setDialog(null)
    setDialogError('')
  }
  const runDialog = async (task: () => Promise<void>) => {
    setDialogBusy(true)
    setDialogError('')
    try {
      await task()
      setDialog(null)
    } catch (error) {
      setDialogError(errorText(error, t('chat.actionFailed')))
    } finally {
      setDialogBusy(false)
    }
  }
  const patchLocal = (convId: string, patch: Partial<ChatConversationSummary>) =>
    setConversations((prev) => prev.map((chat) => chat.conv_id === convId ? { ...chat, ...patch } : chat))
  const leaveChat = (convId: string) => {
    if (selectedConversationIdRef.current !== convId) return
    ++conversationEpoch.current
    setIsConversationLoading(false)
    setSelectedConversationId('')
    setConversationHistory([])
    setMessages(INITIAL_MESSAGES)
    setDocumentStatuses([])
  }
  const archiveChat = async (chat: ChatConversationSummary, archived: boolean) => {
    await updateChatConversation(chat.conv_id, { archived })
    patchLocal(chat.conv_id, { archived, archived_at: archived ? new Date().toISOString() : null })
    if (archived) leaveChat(chat.conv_id)
  }
  const handleChatAction = (chat: ChatConversationSummary, action: ChatAction) => {
    setDialogError('')
    if (action === 'rename' || action === 'delete' || action === 'move') {
      setDialog({ type: action, chat })
      return
    }
    void (async () => {
      try {
        if (action === 'pin') {
          await updateChatConversation(chat.conv_id, { pinned: !chat.pinned })
          patchLocal(chat.conv_id, { pinned: !chat.pinned })
        } else {
          await archiveChat(chat, true)
        }
      } catch (error) {
        setConversationsError(errorText(error, t('chat.actionFailed')))
        setComposerError({ message: errorText(error, t('chat.actionFailed')) })
      }
    })()
  }
  const openChat = (convId: string) => {
    setView('chat')
    handleSelectConversation(convId)
  }
  const startNewChat = (sectionId?: string) => {
    setView('chat')
    startFreshConversation()
    setDraftSectionId(sectionId ?? null)
  }
  const saveSection = (input: AlemAiChatSectionInput, section: AlemAiChatSection | null, moveChat?: ChatConversationSummary) => runDialog(async () => {
    const saved = section ? await updateChatSection(section.id, input) : await createChatSection(input)
    setSections((prev) => section ? prev.map((item) => item.id === saved.id ? { ...item, ...saved } : item) : [...prev, saved])
    if (moveChat) {
      await updateChatConversation(moveChat.conv_id, { section_id: saved.id })
      patchLocal(moveChat.conv_id, { section_id: saved.id })
    }
  })
  const firstName = (userProfile.name || '').split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('chat.greetingMorning', { name: firstName }) : hour < 18 ? t('chat.greetingDay', { name: firstName }) : t('chat.greetingEvening', { name: firstName })
  const suggestions = [
    { icon: FileText, label: t('chat.suggestSummary'), prompt: t('chat.suggestSummaryPrompt') },
    { icon: BookOpen, label: t('chat.suggestKb'), prompt: t('chat.suggestKbPrompt') },
    { icon: Pencil, label: t('chat.suggestLetter'), prompt: t('chat.suggestLetterPrompt') },
    { icon: Table2, label: t('chat.suggestTable'), prompt: t('chat.suggestTablePrompt') },
  ]
  const sourceLabels: Record<SearchMode, string> = { auto: t('chat.sourceAuto'), kb: t('chat.sourceKb'), web: t('chat.sourceWeb') }
  const isEmpty = messages.length === 0
  const showChat = selectedTool === 'chat'
  const title = view !== 'chat' ? '' : (selectedChat && !isPlaceholderName(selectedChat.name) ? selectedChat.name : '') || (showChat ? draftTitle || (isEmpty ? t('chat.newChat') : customAssistantName) : selectedTool === 'smart-agent' ? 'TeamAi.Assistant' : selectedTool === 'tzai' ? 'TeamAi.Tasks' : t('chat.untitled'))

  const applyPrompt = (prompt: string) => {
    setInput(prompt)
    window.setTimeout(() => {
      const area = textareaRef.current
      if (!area) return
      area.focus()
      area.setSelectionRange(prompt.length, prompt.length)
      autoResize()
    }, 0)
  }

  const renderComposer = (centered: boolean) => <div className={`mx-auto w-full ${centered ? 'max-w-[720px]' : 'max-w-[760px]'}`}>
    <div className={`rounded-[20px] border border-[#E2E5EA] bg-white transition-[border-color,box-shadow] duration-200 focus-within:border-[#C9D3E6] ${centered ? 'p-3.5 pb-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.14)]' : 'p-2.5 shadow-[0_8px_24px_-14px_rgba(16,24,40,0.18)]'}`}>
      {composerError && <ChatNotice className="mb-2" onClose={() => setComposerError(null)} message={composerError.message}
        detail={composerError.retryAt && composerError.retryKind === 'estimated' ? t('limits.retryEstimated', { time: formatDateTime(composerError.retryAt) })
          : composerError.retryKind === 'requires_action' && composerError.reason !== 'RESERVATION_TOO_LARGE' ? t('limits.retryRequiresAction')
            : composerError.retryKind === 'unknown' ? t('limits.retryUnknown') : undefined} />}
      {attachment && <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#E6EAF1] bg-[#FAFBFC] p-2 pr-2.5">
        {attachment.previewUrl
          ? <img src={attachment.previewUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
          : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#EDF2FF] text-[#2458D3]"><FileText size={19} strokeWidth={1.8} /></span>}
        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-[#17202E]">{attachment.name}</span><span className="block text-[12px] text-[#586174]">{attachment.previewUrl ? t('chat.attachedImage') : t('chat.attachedFile')}</span></span>
        <button type="button" onClick={clearAttachment} disabled={isTyping} aria-label={t('chat.removeAttachment')} className={ICON_BTN}><X size={16} /></button>
      </div>}
      <div className={`flex gap-2 ${centered ? 'flex-col' : 'items-end'}`}>
        {!centered && <button type="button" onClick={handleAttachmentClick} disabled={isTyping} aria-label={t('chat.attach')} title={t('chat.attach')} className={ICON_BTN}><Paperclip size={17} strokeWidth={1.8} /></button>}
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('chat.placeholder')}</span>
          <textarea ref={textareaRef} disabled={isTyping} rows={centered ? 2 : 1} value={input}
            onChange={(event) => { setInput(event.target.value); if (composerError) setComposerError(null); autoResize() }}
            onKeyDown={handleKeyDown} placeholder={centered ? t('chat.placeholderEmpty') : t('chat.placeholder')}
            className="max-h-40 min-h-9 w-full resize-none bg-transparent px-1 py-1.5 text-[15px] leading-6 text-[#17202E] outline-none placeholder:text-[#7B8494] [scrollbar-width:thin]" />
        </label>
        <div className="flex items-center gap-1.5">
          {centered && <>
            <button type="button" onClick={handleAttachmentClick} disabled={isTyping} aria-label={t('chat.attach')} title={t('chat.attach')} className={`flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E2E5EA] text-[#465066] transition-colors hover:bg-[#F8F9FB] ${CHAT_FOCUS}`}><Paperclip size={17} strokeWidth={1.8} /></button>
            <button type="button" onClick={(event) => setSourceMenu(event.currentTarget)} aria-haspopup="menu" aria-expanded={Boolean(sourceMenu)} className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#E2E5EA] px-2.5 text-[13px] text-[#465066] transition-colors hover:bg-[#F8F9FB] ${CHAT_FOCUS}`}><Globe size={15} strokeWidth={1.8} />{t('chat.source', { value: sourceLabels[searchMode] })}<ChevronDown size={14} /></button>
            <span className="flex-1" />
          </>}
          <button type="button" onClick={() => { void sendMessage() }} disabled={isTyping || isSendingRef.current || isConversationLoading || isSelectedConversationPending || (!input.trim() && !attachment)} aria-label={t('chat.send')} title={t('chat.send')}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#2458D3] text-white transition-colors hover:bg-[#1D47B0] disabled:cursor-not-allowed disabled:bg-[#C9D3E6] ${CHAT_FOCUS}`}><ArrowUp size={18} strokeWidth={2.2} /></button>
        </div>
      </div>
    </div>
  </div>

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white font-[Inter,sans-serif] text-[#17202E]">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttachmentChange} disabled={isTyping} />
      <ChatSidebar collapsed={!sidebarOpen} compact={compactLayout} onClose={() => setSidebarOpen(false)}
        view={view} onViewChange={(next) => { setView(next); setOpenSectionId(null); if (compactLayout) setSidebarOpen(false) }}
        conversations={activeConversations} archivedCount={archivedConversations.length} sectionsCount={sections.length}
        selectedConversationId={selectedConversationId} onSelectConversation={openChat} onCreateConversation={() => startNewChat()}
isConversationsLoading={isConversationsLoading} conversationsError={conversationsError}
        onChatAction={handleChatAction} onOpenLimits={() => setDialog({ type: 'limits' })} onOpenSettings={() => setShowSettingsModal(true)} />

      <main className="relative flex h-full min-w-0 flex-1 flex-col">
        <header className={`flex h-14 shrink-0 items-center gap-2 px-3 sm:px-4 ${view === 'chat' && !isEmpty ? 'border-b border-[#EEF0F3]' : ''}`}>
          <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label={t('chat.toggleSidebar')} title={t('chat.toggleSidebar')} className={ICON_BTN}><PanelLeft size={18} strokeWidth={1.8} /></button>
          {view === 'chat' && !isEmpty && <>
            <h1 className="min-w-0 truncate px-1 text-[15px] font-medium text-[#17202E]">{title}</h1>
            {selectedSection && <span className="hidden h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium sm:inline-flex" style={{ background: sectionTone(selectedSection.color).soft, color: '#465066' }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: selectedSection.color }} />{selectedSection.name}</span>}
          </>}
          <span className="flex-1" />
          {view === 'chat' && selectedChat && <button type="button" onClick={(event) => setHeaderMenu(event.currentTarget)} aria-label={t('chat.actions')} aria-haspopup="menu" aria-expanded={Boolean(headerMenu)} className={ICON_BTN}><MoreHorizontal size={18} /></button>}
        </header>

        {view === 'sections' && <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 sm:px-8">
          <SectionsView onNewChat={startNewChat} sections={sections} chats={activeConversations} loading={sectionsLoading} error={sectionsError}
            openSectionId={openSectionId} onOpenSection={setOpenSectionId} onOpenChat={openChat}
            onCreate={() => { setDialogError(''); setDialog({ type: 'section', section: null }) }}
            onEdit={(section) => { setDialogError(''); setDialog({ type: 'section', section }) }}
            onDelete={(section) => { setDialogError(''); setDialog({ type: 'deleteSection', section }) }} />
        </div>}

        {view === 'archive' && <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 sm:px-8">
          <ArchiveView chats={archivedConversations} sections={sections} loading={isConversationsLoading} busy={dialogBusy}
            onRestore={(ids) => {
              setDialogBusy(true)
              void Promise.all(ids.map((id) => updateChatConversation(id, { archived: false }).then(() => patchLocal(id, { archived: false, archived_at: null }))))
                .catch((error) => setConversationsError(errorText(error, t('chat.actionFailed'))))
                .finally(() => setDialogBusy(false))
            }}
            onDelete={(ids) => { setDialogError(''); setDialog({ type: 'deleteMany', ids }) }} />
          {conversationsError && <ChatNotice className="mx-auto mt-4 max-w-[880px]" message={conversationsError} onClose={() => setConversationsError('')} />}
        </div>}

        {view === 'chat' && <>
          <div className="relative min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
            <div className={`mx-auto w-full ${showChat && isEmpty ? 'flex min-h-full max-w-[720px] flex-col justify-center pb-16' : 'max-w-[760px] pb-6 pt-7'}`}>
              {!showChat && <div className="panel-enter">
                {selectedTool === 'meeting-ai' && <MeetingAiPanel token={authToken} />}
                {selectedTool === 'tzai' && <TzAiPanel token={authToken} />}
                {selectedTool === 'smart-agent' && <SmartAgentPanel token={authToken} />}
              </div>}

              {showChat && isConversationLoading && <div className="space-y-6 pt-2" role="status" aria-label={t('chat.navChats')}>
                <div className="ml-auto h-10 w-[46%] animate-pulse rounded-[18px] bg-[#F1F3F6] motion-reduce:animate-none" />
                <div className="flex gap-3.5"><span className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-[#EDF2FF]" /><div className="flex-1 space-y-2.5">{[88, 74, 81, 52].map((width) => <span key={width} className="block h-3.5 animate-pulse rounded bg-[#F1F3F6] motion-reduce:animate-none" style={{ width: `${width}%` }} />)}</div></div>
              </div>}

              {showChat && conversationDetailError && <ChatNotice className="mb-4" message={conversationDetailError} onClose={() => setConversationDetailError('')} />}

              {showChat && documentStatuses.length > 0 && <div className="mb-5 flex flex-wrap gap-2" aria-label={t('chat.attachedFile')}>
                {documentStatuses.map((document) => <span key={document.id} className="inline-flex items-center gap-2.5 rounded-xl border border-[#E6EAF1] bg-white py-1.5 pl-1.5 pr-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EDF2FF] text-[#2458D3]"><FileText size={16} strokeWidth={1.8} /></span>
                  <span className="min-w-0"><span className="block max-w-[260px] truncate text-[13px] font-medium text-[#17202E]">{document.name}</span>
                    <span className={`block text-[12px] ${document.status === 'failed' ? 'text-[#C5301B]' : document.status === 'ready' ? 'text-[#16734B]' : 'text-[#586174]'}`}>{document.status === 'ready' ? 'Готов для вопросов' : document.status === 'failed' ? (document.error_message || 'Ошибка обработки') : document.status === 'processing' ? 'Обрабатывается…' : 'Загружен, ожидает обработки'}</span></span>
                </span>)}
              </div>}

              {showChat && isEmpty && !isConversationLoading && <div className="msg-enter flex flex-col items-center gap-7 text-center">
                <div className="flex flex-col items-center gap-3.5">
                  <h2 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">{greeting}</h2>
                  <p className="text-[15px] text-[#586174]">{t('chat.emptyText')}</p>
                </div>
                <div className="w-full text-left">{renderComposer(true)}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((item) => {
                    const SuggestionIcon = item.icon
                    return <button key={item.label} type="button" onClick={() => applyPrompt(item.prompt)} className={`inline-flex h-9 items-center gap-2 rounded-full border border-[#E6EAF1] bg-white px-3.5 text-[13px] text-[#465066] transition-colors hover:border-[#D3D9E3] hover:bg-[#F8F9FB] hover:text-[#17202E] ${CHAT_FOCUS}`}><SuggestionIcon size={15} strokeWidth={1.8} />{item.label}</button>
                  })}
                </div>
              </div>}

              {showChat && !isConversationLoading && messages.map((msg) => <div key={msg.id} className="msg-enter">
                <MessageBubble msg={msg} assistantName={customAssistantName} onEditSubmit={handleEditSubmit} isTyping={isTyping}
                  onActionDecision={async (decision) => (await sendMessage(decision)) !== false}
                  onRetry={(messageId) => {
                    const index = messages.findIndex((message) => message.id === messageId)
                    const question = messages.slice(0, index).findLast((message) => message.role === 'user')
                    if (question && !isTyping) void handleEditSubmit(question.text, question.id)
                  }} />
              </div>)}
              {showChat && isTyping && <div className="msg-enter mb-6 flex gap-3.5" role="status" aria-label={t('chat.thinking')}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#EDF2FF] text-[#2458D3]"><Sparkles size={15} fill="currentColor" strokeWidth={1.4} /></span>
                <div className="flex min-h-7 items-center"><TypingDots /></div>
              </div>}
              {showChat && <div ref={bottomRef} />}
            </div>
          </div>
          {showChat && !isEmpty && <div className="shrink-0 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 sm:px-6">
            {renderComposer(false)}
            <p className="mt-2 text-center text-[12px] text-[#7B8494]">{t('chat.disclaimer')}</p>
          </div>}
          {showChat && isEmpty && <p className="shrink-0 px-6 pb-3 text-center text-[12px] text-[#7B8494]">{t('chat.disclaimer')}</p>}
        </>}
      </main>

      <FloatingMenu anchor={sourceMenu} open={Boolean(sourceMenu)} onClose={() => setSourceMenu(null)} align="start" className="min-w-[200px]">
        {(['auto', 'kb', 'web'] as SearchMode[]).map((mode) => <button key={mode} type="button" role="menuitemradio" aria-checked={searchMode === mode} className={floatingMenuItemClass}
          onClick={() => { setSearchMode(mode); setSourceMenu(null) }}>
          {mode === 'auto' ? <Sparkles size={16} className="text-[#586174]" /> : mode === 'kb' ? <BookOpen size={16} className="text-[#586174]" /> : <Globe size={16} className="text-[#586174]" />}
          <span className="flex-1">{sourceLabels[mode]}</span>{searchMode === mode && <span className="h-1.5 w-1.5 rounded-full bg-[#2458D3]" />}
        </button>)}
      </FloatingMenu>

      <FloatingMenu anchor={headerMenu} open={Boolean(headerMenu)} onClose={() => setHeaderMenu(null)} className="min-w-[220px]">
        {selectedChat && <>
          <button type="button" className={floatingMenuItemClass} onClick={() => { setHeaderMenu(null); handleChatAction(selectedChat, 'rename') }}><Pencil size={16} className="text-[#586174]" />{t('chat.rename')}</button>
          <button type="button" className={floatingMenuItemClass} onClick={() => { setHeaderMenu(null); handleChatAction(selectedChat, 'pin') }}>{selectedChat.pinned ? <PinOff size={16} className="text-[#586174]" /> : <Pin size={16} className="text-[#586174]" />}{selectedChat.pinned ? t('chat.unpin') : t('chat.pin')}</button>
          <button type="button" className={floatingMenuItemClass} onClick={() => { setHeaderMenu(null); handleChatAction(selectedChat, 'move') }}><FolderInput size={16} className="text-[#586174]" />{t('chat.move')}</button>
          <button type="button" className={floatingMenuItemClass} onClick={() => { setHeaderMenu(null); handleChatAction(selectedChat, 'archive') }}><Archive size={16} className="text-[#586174]" />{t('chat.archive')}</button>
          <div className="mx-2 my-1 h-px bg-[#EEF0F3]" />
          <button type="button" className={`${floatingMenuItemClass} !text-[#C5301B]`} onClick={() => { setHeaderMenu(null); handleChatAction(selectedChat, 'delete') }}><Trash2 size={16} />{t('chat.delete')}</button>
        </>}
      </FloatingMenu>

      {dialog?.type === 'rename' && <RenameChatDialog name={dialog.chat.name} busy={dialogBusy} error={dialogError} onClose={closeDialog}
        onSave={(name) => void runDialog(async () => { await updateChatConversation(dialog.chat.conv_id, { title: name }); patchLocal(dialog.chat.conv_id, { name }) })} />}
      {dialog?.type === 'delete' && <DangerDialog title={t('chat.deleteTitle')} text={t('chat.deleteText', { name: dialog.chat.name })} hint={t('chat.deleteHint')} confirmText={t('chat.delete')}
        busy={dialogBusy} error={dialogError} onClose={closeDialog}
        onArchive={() => void runDialog(() => archiveChat(dialog.chat, true))}
        onConfirm={() => void runDialog(async () => { await deleteChatConversation(dialog.chat.conv_id); setConversations((prev) => prev.filter((chat) => chat.conv_id !== dialog.chat.conv_id)); leaveChat(dialog.chat.conv_id) })} />}
      {dialog?.type === 'deleteMany' && <DangerDialog title={t('chat.deleteManyTitle')} text={t('chat.deleteManyText', { count: dialog.ids.length })} confirmText={t('chat.deleteForever')}
        busy={dialogBusy} error={dialogError} onClose={closeDialog}
        onConfirm={() => void runDialog(async () => {
          for (const id of dialog.ids) {
            await deleteChatConversation(id)
            setConversations((prev) => prev.filter((chat) => chat.conv_id !== id))
          }
        })} />}
      {dialog?.type === 'move' && <MoveChatDialog chatName={dialog.chat.name} currentSectionId={dialog.chat.section_id ?? null} sections={sections} busy={dialogBusy} error={dialogError} onClose={closeDialog}
        onCreateSection={() => { setDialogError(''); setDialog({ type: 'section', section: null, moveChat: dialog.chat }) }}
        onMove={(sectionId) => void runDialog(async () => { await updateChatConversation(dialog.chat.conv_id, { section_id: sectionId }); patchLocal(dialog.chat.conv_id, { section_id: sectionId }) })} />}
      {dialog?.type === 'section' && <SectionDialog section={dialog.section} busy={dialogBusy} error={dialogError} onClose={closeDialog}
        onSave={(input) => void saveSection(input, dialog.section, dialog.moveChat)} />}
      {dialog?.type === 'deleteSection' && <DangerDialog title={t('chat.deleteSectionTitle')} text={t('chat.deleteSectionText', { name: dialog.section.name })} confirmText={t('chat.deleteSection')}
        busy={dialogBusy} error={dialogError} onClose={closeDialog}
        onConfirm={() => void runDialog(async () => {
          await deleteChatSection(dialog.section.id)
          setSections((prev) => prev.filter((section) => section.id !== dialog.section.id))
          setConversations((prev) => prev.map((chat) => chat.section_id === dialog.section.id ? { ...chat, section_id: null } : chat))
          if (openSectionId === dialog.section.id) setOpenSectionId(null)
        })} />}
      {dialog?.type === 'limits' && <LimitsDialog onClose={() => setDialog(null)} />}

      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} token={token} onProfileUpdated={handleProfileUpdated} />
    </div>
  )
}
