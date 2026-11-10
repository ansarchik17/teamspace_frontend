import { normalizeDataCards, normalizeDataSources } from '../../presentation/pages/alemai/chat/dataPresentation'
import type { AskHistoryMessage } from '../../presentation/pages/alemai/chat/api/types'
import { HttpError } from '../http/HttpError'
import { authorizedFetch } from '../http/authorizedFetch'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import type { AskApiResponse, AskRequest, ChatToolInfo } from '../../presentation/pages/alemai/chat/api/types'
import type { SmartAgentChatRequest, SmartAgentChatResponse, SmartAgentTaskItem, SmartAgentConversationSummary, SmartAgentConversationDetail, SmartAgentFeedbackRequest, SmartAgentFeedbackResponse } from '../../presentation/pages/alemai/smart-agent/types'
import type { TzAiAnalyzeResponse, TzAiCreateTasksResponse, TzAiTaskItem, TzAiToolInfo } from '../../presentation/pages/alemai/tzai/types'
import type {
  MeetingAiAnalyzeJob,
  MeetingAiAnalyzeJobCreated,
  MeetingAiLanguage,
  MeetingAiMeetingAnalyzeResponse,
  MeetingAiSpeechToTextReportResponse,
  MeetingAiTextAnalysisResult,
  MeetingAiTranscriptionResponse,
} from '../../presentation/pages/alemai/meeting-ai/types'
import type {
  KanbanAssigneeAdviceResponse,
  KanbanBoardStatsResponse,
  NotesAiProofreadResponse,
  NotesAiSummarizeResponse,
  TzAiTaskAssistResponse,
} from '../../domain/entities/AiTools'

const RETRYABLE_STATUSES = new Set([502, 503, 504])
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryableTransportError = (error: unknown): boolean => {
  if (error instanceof HttpError) {
    return RETRYABLE_STATUSES.has(error.status)
  }

  if (error instanceof TypeError) {
    return true
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('timeout') || message.includes('network')
  }

  return false
}

export interface AlemAiCurrentUser {
  id: number
  email: string
  username: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  role: string | null
  is_active: boolean
}

export interface AlemAiProfile {
  assistant_name: string
  response_style: string
  persona_preset: string
  chat_accent_color: string
  chat_background_type: string
  chat_background_value: string
}

export interface AlemAiReminder {
  id: string
  text: string
  due_at: string
  status?: string
}

export interface SmartAgentStreamHandlers {
  onStarted?: (requestId: string) => void
  onDelta?: (text: string) => void
}

interface AskQuestionResult {
  answer: string
  convId: string
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  fullResponse: AskApiResponse
}

interface AskQuestionWithAttachmentParams {
  question: string
  chatId?: string | null
  file?: File | null
  image?: File | null
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

interface ChatConversationSummaryDto {
  conv_id?: string
  id?: string
  name?: string
  title?: string
  updated_at?: string | null
  last_message_at?: string | null
  preview?: string | null
  last_message?: string | null
  pinned?: boolean | null
  archived?: boolean | null
  archived_at?: string | null
  section_id?: string | null
}

export interface AlemAiChatPatch {
  title?: string
  pinned?: boolean
  archived?: boolean
  section_id?: string | null
}

export interface AlemAiChatSection {
  id: string
  name: string
  description: string
  color: string
  chat_count: number | null
  updated_at: string | null
}

export interface AlemAiChatSectionInput {
  name: string
  description?: string
  color?: string
}

const KANBAN_TASK_PATHS = (taskId: string): string[] => [
  `/api/v1/kanban/tasks/${encodeURIComponent(taskId)}`,
  `/auth/api/v1/kanban/tasks/${encodeURIComponent(taskId)}`,
]
// The AI page uses the same authenticated, persistent chat API for plain
// messages and uploads. Keeping uploads on a separate legacy route caused the
// file to be detached from the conversation history.
const CHATS_PATH = '/api/v1/ai/chats'
const chatMessagesPath = (chatId: string) => `${CHATS_PATH}/${encodeURIComponent(chatId)}/messages`

const normalizeConversationSummary = (input: ChatConversationSummaryDto) => ({
  conv_id: input.conv_id || input.id || '',
  name: input.name || input.title || 'Новый чат',
  updated_at: input.updated_at ?? null,
  last_message_at: input.last_message_at ?? null,
  preview: input.preview ?? null,
  last_message: input.last_message ?? null,
  pinned: Boolean(input.pinned),
  archived: Boolean(input.archived),
  archived_at: input.archived_at ?? null,
  section_id: input.section_id ?? null,
})

const SECTIONS_PATH = '/api/v1/ai/sections'
const chatPath = (chatId: string) => `${CHATS_PATH}/${encodeURIComponent(chatId)}`
const sectionPath = (sectionId: string) => `${SECTIONS_PATH}/${encodeURIComponent(sectionId)}`

const normalizeSection = (input: Record<string, unknown>): AlemAiChatSection => ({
  id: String(input.id ?? ''),
  name: String(input.name ?? input.title ?? ''),
  description: typeof input.description === 'string' ? input.description : '',
  color: typeof input.color === 'string' && input.color ? input.color : '#2458D3',
  chat_count: typeof input.chat_count === 'number' ? input.chat_count : null,
  updated_at: typeof input.updated_at === 'string' ? input.updated_at : null,
})

const extractCompletionAnswer = (data: Record<string, unknown> | null | undefined): string => {
  if (!data) return ''
  if (typeof data.answer === 'string') return data.answer
  const choices = Array.isArray(data.choices) ? data.choices : []
  const message = choices[0] && typeof choices[0] === 'object'
    ? (choices[0] as { message?: { content?: unknown } }).message
    : undefined
  return typeof message?.content === 'string' ? message.content : ''
}

export interface AlemAiDocument {
  id: string
  conversation_id: string
  name: string
  detected_type: string
  bytes: number
  status: 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed' | 'deleted'
  error_code?: string | null
  error_message?: string | null
  text_chars: number
  created_at: string
  updated_at: string
}

const toAskApiResponse = (
  data: Partial<AskApiResponse> & Record<string, unknown>,
  chatId: string,
  baseHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  question: string,
): AskApiResponse => {
  const answer = typeof data.answer === 'string' ? data.answer : ''
  const rawConfidence =
    data.confidence && typeof data.confidence === 'object'
      ? (data.confidence as unknown as {
          score?: unknown
          label?: unknown
          reason?: unknown
          heuristic?: unknown
        })
      : null
  const route =
    typeof data.route === 'string' && data.route.trim()
      ? data.route
      : data.search_backend === 'searxng'
        ? 'web'
        : 'ask_adaptive'
  const sources = Array.isArray(data.sources) ? data.sources : []
  const kbHits = Array.isArray(data.kb_hits) ? data.kb_hits : []
  const documentSources = Array.isArray(data.document_sources) ? data.document_sources : []
  const conversationHistory = [
    ...baseHistory,
    { role: 'user' as const, content: question },
    { role: 'assistant' as const, content: answer, data_cards: normalizeDataCards(data.data_cards), data_sources: normalizeDataSources(data.data_sources) },
  ]

  return {
    answer,
    route,
    learned: Boolean(data.learned),
    rationale: typeof data.rationale === 'string' ? data.rationale : '',
    confidence: rawConfidence
      ? {
          score: Number(rawConfidence.score ?? 0) || 0,
          label: String(rawConfidence.label ?? ''),
          reason: String(rawConfidence.reason ?? ''),
          heuristic: Boolean(rawConfidence.heuristic),
        }
      : {
          score: 0,
          label: '',
          reason: '',
          heuristic: true,
        },
    sources,
    data_sources: normalizeDataSources(data.data_sources),
    data_cards: normalizeDataCards(data.data_cards),
    document_sources: documentSources.filter((source): source is {
      document_id: string
      name: string
      chunk_id: string
      locator?: Record<string, unknown>
      rank: number
    } => {
      if (!source || typeof source !== 'object') return false
      const item = source as unknown as Record<string, unknown>
      return typeof item.document_id === 'string' && typeof item.name === 'string' && typeof item.chunk_id === 'string'
    }).map((source) => ({
      document_id: source.document_id,
      name: source.name,
      chunk_id: source.chunk_id,
      locator: source.locator,
      rank: Number(source.rank || 0),
    })),
    kb_hits: kbHits,
    conversation_history: conversationHistory,
    conv_id: chatId,
    session_id: typeof data.session_id === 'string' ? data.session_id : chatId,
  }
}

export class HttpAlemAiRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async getCurrentUser(): Promise<AlemAiCurrentUser> {
    return this.requestJson<AlemAiCurrentUser>(['/api/v1/auth/me', '/auth/api/v1/auth/me'])
  }

  async fetchTools(): Promise<ChatToolInfo[]> {
    const payload = await this.requestJson<unknown>(['/api/tools'])
    if (!Array.isArray(payload)) return []

    return payload.filter((item): item is ChatToolInfo => {
      if (!item || typeof item !== 'object') return false
      const row = item as Record<string, unknown>
      return typeof row.id === 'string' && typeof row.label === 'string'
    })
  }

  async askQuestion(payload: AskRequest): Promise<AskQuestionResult> {
    const chatId = payload.conv_id?.trim() || (await this.createChatConversation('Новый чат')).conv_id
    const question = payload.question.trim()
    const baseHistory = Array.isArray(payload.conversation_history) ? payload.conversation_history : []
    const form = new FormData()
    form.append('content', question)
    if (payload.actionDecision) {
      form.append('confirmation_token', payload.actionDecision.token)
      form.append('action_decision', payload.actionDecision.decision)
    }
    const data = await this.requestJson<Record<string, unknown>>([chatMessagesPath(chatId)], {
      method: 'POST',
      body: form,
    })
    const answer = extractCompletionAnswer(data)
    const fullResponse = toAskApiResponse({ ...data, answer, route: Array.isArray(data.data_sources) && data.data_sources.length ? 'personal_context' : 'model' }, chatId, baseHistory, question)

    return {
      answer: fullResponse.answer,
      convId: chatId,
      conversationHistory: fullResponse.conversation_history,
      fullResponse,
    }
  }

  async askQuestionWithAttachment(params: AskQuestionWithAttachmentParams): Promise<AskQuestionResult> {
    const form = new FormData()
    form.append('content', params.question)

    const chatId = params.chatId?.trim() || (await this.createChatConversation('Новый чат')).conv_id
    form.append('chat_id', chatId)

    if (params.file) {
      form.append('file', params.file)
    }

    if (params.image) {
      form.append('file', params.image)
    }

    const data = await this.requestJson<Record<string, unknown>>([chatMessagesPath(chatId)], {
      method: 'POST',
      body: form,
    })

    const baseHistory = Array.isArray(params.conversationHistory) ? params.conversationHistory : []
    const answer = extractCompletionAnswer(data)
    const fullResponse = toAskApiResponse({ ...data, answer, route: Array.isArray(data.data_sources) && data.data_sources.length ? 'personal_context' : 'document' }, chatId, baseHistory, params.question)

    return {
      answer: fullResponse.answer,
      convId: chatId,
      conversationHistory: fullResponse.conversation_history,
      fullResponse,
    }
  }

  async listChatConversations(): Promise<Array<ReturnType<typeof normalizeConversationSummary>>> {
    const data = await this.requestJson<unknown>([`${CHATS_PATH}?include_archived=true`])
    const items = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { chats?: unknown[] }).chats)
        ? (data as { chats: unknown[] }).chats
        : []
    return items
      .map((item) => normalizeConversationSummary((item as ChatConversationSummaryDto) || {}))
      .filter((item) => !!item.conv_id)
  }

  async createChatConversation(name: string, sectionId?: string | null): Promise<{
    conv_id: string
    name: string
    updated_at: string | null
    last_message_at: string | null
    preview: string | null
    last_message: string | null
  }> {
    const data = await this.requestJson<{ id?: string; conv_id?: string; title?: string; name?: string }>([CHATS_PATH], {
      method: 'POST',
      body: JSON.stringify({ title: name || 'Новый чат', ...(sectionId ? { section_id: sectionId } : {}) }),
    })

    return normalizeConversationSummary({
      id: data?.id || data?.conv_id,
      title: data?.title || data?.name || name || 'Новый чат',
      section_id: sectionId ?? null,
    })
  }

  async updateChatConversation(convId: string, patch: AlemAiChatPatch) {
    const data = await this.requestJson<ChatConversationSummaryDto>([chatPath(convId)], {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return data ? normalizeConversationSummary({ ...data, id: data.id || data.conv_id || convId }) : null
  }

  async deleteChatConversation(convId: string): Promise<void> {
    await this.requestJson<unknown>([chatPath(convId)], { method: 'DELETE' })
  }

  async listChatSections(): Promise<AlemAiChatSection[]> {
    const data = await this.requestJson<unknown>([SECTIONS_PATH])
    const items = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { sections?: unknown[] }).sections)
        ? (data as { sections: unknown[] }).sections
        : []
    return items
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(normalizeSection)
      .filter((item) => item.id && item.name)
  }

  async createChatSection(input: AlemAiChatSectionInput): Promise<AlemAiChatSection> {
    const data = await this.requestJson<Record<string, unknown>>([SECTIONS_PATH], { method: 'POST', body: JSON.stringify(input) })
    return normalizeSection(data || {})
  }

  async updateChatSection(sectionId: string, input: Partial<AlemAiChatSectionInput>): Promise<AlemAiChatSection> {
    const data = await this.requestJson<Record<string, unknown>>([sectionPath(sectionId)], { method: 'PATCH', body: JSON.stringify(input) })
    return normalizeSection({ id: sectionId, ...(data || {}) })
  }

  async deleteChatSection(sectionId: string): Promise<void> {
    await this.requestJson<unknown>([sectionPath(sectionId)], { method: 'DELETE' })
  }

  async getChatConversation(convId: string): Promise<{
    conv_id: string
    name: string
    updated_at: string | null
    messages: AskHistoryMessage[]
  }> {
    const data = await this.requestJson<unknown>([chatMessagesPath(convId)])
    const messagesSource = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { messages?: unknown[] }).messages)
        ? (data as { messages: unknown[] }).messages
        : []

    const messages = messagesSource
      .map((item) => ({
        role: ((item as { role?: string })?.role === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: (item as { content?: string })?.content || '',
        created_at: (item as { created_at?: string })?.created_at,
        data_cards: normalizeDataCards((item as AskHistoryMessage)?.data_cards),
        data_sources: normalizeDataSources((item as AskHistoryMessage)?.data_sources),
      }))
      .filter((item) => !!item.content)

    return {
      conv_id: convId,
      name: 'Новый чат',
      updated_at: null,
      messages,
    }
  }

  async uploadAIDocument(chatId: string, file: File): Promise<AlemAiDocument> {
    const form = new FormData()
    form.append('file', file)
    return this.requestJson<AlemAiDocument>([`/api/v1/ai/chats/${encodeURIComponent(chatId)}/documents`], {
      method: 'POST',
      body: form,
    })
  }

  async getAIDocument(chatId: string, documentId: string): Promise<AlemAiDocument> {
    return this.requestJson<AlemAiDocument>([
      `/api/v1/ai/chats/${encodeURIComponent(chatId)}/documents/${encodeURIComponent(documentId)}`,
    ])
  }

  async listAIDocuments(chatId: string): Promise<AlemAiDocument[]> {
    const value = await this.requestJson<unknown>([
      `/api/v1/ai/chats/${encodeURIComponent(chatId)}/documents`,
    ])
    return Array.isArray(value) ? value as AlemAiDocument[] : []
  }

  async deleteAIDocument(chatId: string, documentId: string): Promise<void> {
    await this.requestJson<unknown>([
      `/api/v1/ai/chats/${encodeURIComponent(chatId)}/documents/${encodeURIComponent(documentId)}`,
    ], { method: 'DELETE' })
  }

  async smartAgentChat(payload: SmartAgentChatRequest): Promise<SmartAgentChatResponse> {
    return this.requestJson<SmartAgentChatResponse>(['/api/tools/smart-agent/chat'], {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async smartAgentChatStream(
    payload: SmartAgentChatRequest,
    handlers: SmartAgentStreamHandlers = {},
    signal?: AbortSignal,
  ): Promise<SmartAgentChatResponse | null> {
    const response = await this.request(['/api/tools/smart-agent/chat/stream'], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal,
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new HttpError(
        data?.error?.message || data?.detail || data?.error || `Smart Agent stream failed with status ${response.status}`,
        response.status,
        data?.error?.code,
      )
    }

    if (!response.body) {
      throw new Error('Поток ответа Smart Agent недоступен.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentEvent = 'message'

    const consumeEvent = (rawEvent: string): SmartAgentChatResponse | null | undefined => {
      const lines = rawEvent.split(/\r?\n/)
      let eventName = currentEvent
      let data = ''
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      currentEvent = 'message'
      if (!data) return undefined
      const payloadData = JSON.parse(data) as Record<string, unknown>
      if (eventName === 'started') {
        const requestId = typeof payloadData.request_id === 'string' ? payloadData.request_id : ''
        if (requestId) handlers.onStarted?.(requestId)
        return undefined
      }
      if (eventName === 'delta') {
        if (typeof payloadData.text === 'string') handlers.onDelta?.(payloadData.text)
        return undefined
      }
      if (eventName === 'cancelled') return null
      if (eventName === 'error') throw new Error(String(payloadData.detail || 'Не удалось выполнить потоковую генерацию.'))
      if (eventName === 'completed' && payloadData.response && typeof payloadData.response === 'object') {
        return payloadData.response as SmartAgentChatResponse
      }
      return undefined
    }

    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      // SSE may arrive with either LF or CRLF line endings. Normalize before
      // looking for event boundaries; otherwise CRLF responses stay buffered
      // forever because "\r\n\r\n" does not contain "\n\n".
      buffer = buffer.replace(/\r\n/g, '\n')
      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex >= 0) {
        const parsed = consumeEvent(buffer.slice(0, separatorIndex))
        buffer = buffer.slice(separatorIndex + 2)
        if (parsed !== undefined) {
          await reader.cancel()
          return parsed
        }
        separatorIndex = buffer.indexOf('\n\n')
      }
      if (done) {
        // Consume a final event even when a proxy closes the connection without
        // appending the usual blank line after the last SSE frame.
        if (buffer.trim()) {
          const parsed = consumeEvent(buffer)
          if (parsed !== undefined) return parsed
        }
        break
      }
    }
    return null
  }

  async cancelSmartAgentChatStream(requestId: string): Promise<{ cancelled: boolean }> {
    return this.requestJson<{ cancelled: boolean }>([
      `/api/tools/smart-agent/chat/stream/${encodeURIComponent(requestId)}/cancel`,
    ], { method: 'POST' })
  }

  async getSmartAgentTask(taskId: string): Promise<SmartAgentTaskItem> {
    return this.requestJson<SmartAgentTaskItem>(KANBAN_TASK_PATHS(taskId))
  }

  async listSmartAgentConversations(): Promise<SmartAgentConversationSummary[]> {
    return this.requestJson<SmartAgentConversationSummary[]>(['/api/tools/smart-agent/conversations'])
  }

  async getSmartAgentConversation(convId: string): Promise<SmartAgentConversationDetail> {
    return this.requestJson<SmartAgentConversationDetail>([`/api/tools/smart-agent/conversations/${encodeURIComponent(convId)}`])
  }

  async renameSmartAgentConversation(convId: string, name: string): Promise<SmartAgentConversationDetail> {
    return this.requestJson<SmartAgentConversationDetail>([`/api/tools/smart-agent/conversations/${encodeURIComponent(convId)}`], {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  }

  async deleteSmartAgentConversation(convId: string): Promise<{ deleted: boolean }> {
    return this.requestJson<{ deleted: boolean }>([`/api/tools/smart-agent/conversations/${encodeURIComponent(convId)}`], {
      method: 'DELETE',
    })
  }

  async sendSmartAgentFeedback(payload: SmartAgentFeedbackRequest): Promise<SmartAgentFeedbackResponse> {
    return this.requestJson<SmartAgentFeedbackResponse>(['/api/tools/smart-agent/feedback'], {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async fetchTzTools(): Promise<TzAiToolInfo[]> {
    return this.requestJson<TzAiToolInfo[]>(['/api/tools'])
  }

  async fetchTzModels(): Promise<unknown> {
    return this.requestJson<unknown>(['/api/tools/tzai/models'])
  }

  async fetchTzBoards(): Promise<unknown> {
    return this.requestJson<unknown>(['/api/tools/tzai/boards'])
  }

  async fetchTzBoardDetails(boardId: string): Promise<unknown> {
    return this.requestJson<unknown>([`/api/tools/tzai/boards/${encodeURIComponent(boardId)}`])
  }

  async analyzeTzText(text: string, model?: string): Promise<TzAiAnalyzeResponse> {
    return this.requestJson<TzAiAnalyzeResponse>(['/api/tools/tzai/analyze-text'], {
      method: 'POST',
      body: JSON.stringify({ text, ...(model ? { model } : {}) }),
    })
  }

  async analyzeTzMultipart(params: { text?: string; file?: File; model?: string }): Promise<TzAiAnalyzeResponse> {
    const form = new FormData()

    if (params.text?.trim()) form.append('text', params.text.trim())
    if (params.file) form.append('file', params.file)
    if (params.model?.trim()) form.append('model', params.model.trim())

    return this.requestJson<TzAiAnalyzeResponse>(['/api/tools/tzai/analyze'], {
      method: 'POST',
      body: form,
    })
  }

  async analyzeTzViaLocalApi(file: File, model: string = 'openai/gpt-oss-120b'): Promise<TzAiAnalyzeResponse> {
    const form = new FormData()
    form.append('file', file)
    form.append('model', model)

    const url = '/api/tools/tzai/analyze'

    return this.requestJson<TzAiAnalyzeResponse>([url], {
      method: 'POST',
      body: form,
    })
  }

  async createTzTasks(tasks: TzAiTaskItem[]): Promise<TzAiCreateTasksResponse> {
    const url = '/api/tools/tzai/create-tasks'

    return this.requestJson<TzAiCreateTasksResponse>([url], {
      method: 'POST',
      body: JSON.stringify({ tasks }),
    })
  }

  async proofreadNote(params: { content?: string; content_doc?: any; model?: string }): Promise<NotesAiProofreadResponse> {
    return this.requestJson<NotesAiProofreadResponse>(['/api/tools/notes-ai/proofread'], {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async summarizeNote(params: { content?: string; content_doc?: any }): Promise<NotesAiSummarizeResponse> {
    return this.requestJson<NotesAiSummarizeResponse>(['/api/tools/notes-ai/summarize'], {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async getTaskAssist(params: {
    text: string
    title?: string
    board_id?: string
    current_priority?: 'low' | 'medium' | 'high' | 'critical'
    current_sprint_id?: string
    current_assignee_id?: number
    current_due_at?: string
    model?: string
    file_ids?: string[]
  }): Promise<TzAiTaskAssistResponse> {
    return this.requestJson<TzAiTaskAssistResponse>(['/api/tools/tzai/task-assist'], {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  async getBoardStats(boardId: string): Promise<KanbanBoardStatsResponse> {
    return this.requestJson<KanbanBoardStatsResponse>([`/api/tools/kanban/boards/${encodeURIComponent(boardId)}/stats`])
  }

  async getKanbanAssigneeAdvice(
    boardId: string,
    payload: {
      title: string
      description: string
      user_id: number
      team_role: string
    },
  ): Promise<KanbanAssigneeAdviceResponse> {
    return this.requestJson<KanbanAssigneeAdviceResponse>(
      [`/api/tools/kanban/boards/${encodeURIComponent(boardId)}/assignee-advice`],
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  }

  async speechToText(file: File, options: { model?: string; reportLanguage?: MeetingAiLanguage }): Promise<MeetingAiTranscriptionResponse> {
    return this.postMeetingForm('/api/tools/meeting-ai/speech-to-text', file, options)
  }

  async speechToTextReport(
    file: File,
    options: { model?: string; reportLanguage?: MeetingAiLanguage },
  ): Promise<MeetingAiSpeechToTextReportResponse> {
    return this.postMeetingForm('/api/tools/meeting-ai/speech-to-text/report', file, options)
  }

  async meetingAnalyze(
    file: File,
    options: { model?: string; reportLanguage?: MeetingAiLanguage },
  ): Promise<MeetingAiMeetingAnalyzeResponse> {
    return this.postMeetingForm('/api/tools/meeting-ai/meeting/analyze', file, options)
  }

  async startMeetingAnalyzeAsync(
    file: File,
    options: { model?: string; reportLanguage?: MeetingAiLanguage },
  ): Promise<MeetingAiAnalyzeJobCreated> {
    return this.postMeetingForm<MeetingAiAnalyzeJobCreated>(
      '/api/tools/meeting-ai/meeting/analyze/async',
      file,
      options,
    )
  }

  async listMeetingAnalyzeJobs(): Promise<MeetingAiAnalyzeJob[]> {
    const payload = await this.requestJson<unknown>(['/api/tools/meeting-ai/meeting/analyze'])
    return this.parseMeetingAnalyzeJobs(payload)
  }

  async getMeetingAnalyzeJob(jobId: string): Promise<MeetingAiAnalyzeJob> {
    const payload = await this.requestJson<unknown>([
      `/api/tools/meeting-ai/meeting/analyze/${encodeURIComponent(jobId)}`,
    ])
    return this.normalizeMeetingAnalyzeJob(payload)
  }

  private parseMeetingAnalyzeJobs(payload: unknown): MeetingAiAnalyzeJob[] {
    if (Array.isArray(payload)) {
      return payload.map((item) => this.normalizeMeetingAnalyzeJob(item))
    }
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>
      const list = obj.data ?? obj.jobs ?? obj.items
      if (Array.isArray(list)) {
        return list.map((item) => this.normalizeMeetingAnalyzeJob(item))
      }
    }
    return []
  }

  private normalizeMeetingAnalyzeJob(payload: unknown): MeetingAiAnalyzeJob {
    if (!payload || typeof payload !== 'object') {
      throw new HttpError('Некорректный ответ Meeting AI', 500)
    }
    const obj = payload as Record<string, unknown>
    const nested = obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : obj
    const jobId = String(nested.job_id ?? nested.jobId ?? '')
    if (!jobId) {
      throw new HttpError('Некорректный ответ Meeting AI', 500)
    }
    return {
      job_id: jobId,
      status: (nested.status as MeetingAiAnalyzeJob['status']) ?? 'queued',
      created_at: typeof nested.created_at === 'string' ? nested.created_at : undefined,
      updated_at: typeof nested.updated_at === 'string' ? nested.updated_at : undefined,
      filename: typeof nested.filename === 'string' ? nested.filename : undefined,
      result:
        nested.result && typeof nested.result === 'object'
          ? (nested.result as MeetingAiAnalyzeJob['result'])
          : null,
      error: typeof nested.error === 'string' ? nested.error : null,
    }
  }

  async analyzeText(text: string, reportLanguage: MeetingAiLanguage): Promise<MeetingAiTextAnalysisResult> {
    return this.requestJson<MeetingAiTextAnalysisResult>(['/api/tools/meeting-ai/text-analysis'], {
      method: 'POST',
      body: JSON.stringify({ text, report_language: reportLanguage }),
    })
  }

  async getProfile(): Promise<AlemAiProfile> {
    return this.requestJson<AlemAiProfile>(['/api/v1/profile'])
  }

  async updateProfile(profile: AlemAiProfile): Promise<AlemAiProfile> {
    return this.requestJson<AlemAiProfile>(['/api/v1/profile'], {
      method: 'PUT',
      body: JSON.stringify(profile),
    })
  }

  async listReminders(): Promise<AlemAiReminder[]> {
    const data = await this.requestJson<{ reminders?: AlemAiReminder[] }>(['/api/v1/reminders?status=pending'])
    return Array.isArray(data?.reminders) ? data.reminders : []
  }

  async createReminder(text: string, dueAt: string): Promise<AlemAiReminder> {
    return this.requestJson<AlemAiReminder>(['/api/v1/reminders'], {
      method: 'POST',
      body: JSON.stringify({ text, due_at: dueAt }),
    })
  }

  async markReminderDone(reminderId: string): Promise<void> {
    await this.requestJson<unknown>([`/api/v1/reminders/${encodeURIComponent(reminderId)}`], {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    })
  }

  async deleteReminder(reminderId: string): Promise<void> {
    await this.request([`/api/v1/reminders/${encodeURIComponent(reminderId)}`], {
      method: 'DELETE',
    })
  }

  async pollDueReminders(): Promise<AlemAiReminder[]> {
    const data = await this.requestJson<{ reminders?: AlemAiReminder[] }>(['/api/v1/reminders/due'])
    return Array.isArray(data?.reminders) ? data.reminders : []
  }

  private async postMeetingForm<T>(
    path: string,
    file: File,
    options: { model?: string; reportLanguage?: MeetingAiLanguage },
  ): Promise<T> {
    const form = new FormData()
    form.append('file', file)
    if (options.model?.trim()) form.append('model', options.model.trim())
    if (options.reportLanguage) form.append('report_language', options.reportLanguage)

    return this.requestJson<T>([path], { method: 'POST', body: form })
  }

  private async requestJson<T>(paths: string[], init: RequestInit = {}): Promise<T> {
    const response = await this.request(paths, init)

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return null as T
    }

    return (await response.json()) as T
  }

  private async request(paths: string[], init: RequestInit = {}): Promise<Response> {
    let lastError: unknown = null

    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index]
      const isMeetingAiPath = path.includes('/api/tools/meeting-ai/')
      // An upload may already have started a paid analysis before a connection
      // drops. Without provider idempotency, retry only read-only job requests.
      const maxAttempts = isMeetingAiPath && (init.method ?? 'GET') === 'GET' ? 2 : 1

      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            return await authorizedFetch(this.sessionStore, path, init)
          } catch (error) {
            lastError = error
            const shouldRetry = attempt < maxAttempts && isRetryableTransportError(error)
            if (!shouldRetry) {
              throw error
            }
            await sleep(600 * attempt)
          }
        }
      } catch (error) {
        lastError = error

        const isLast = index === paths.length - 1
        const isHttp404 = error instanceof HttpError && error.status === 404
        if (!isLast && isHttp404) {
          continue
        }

        throw error
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Не удалось выполнить запрос TeamAI')
  }
}
