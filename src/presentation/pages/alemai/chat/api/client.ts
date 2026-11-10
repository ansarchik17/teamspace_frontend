import { getAlemAiApi } from '../../runtime'
import type {
  AskApiResponse,
  AskHistoryMessage,
  AskRequest,
  ChatConversationDetail,
  ChatConversationSummary,
  ChatToolInfo,
  ChatActionDecision,
} from './types'
import type { AlemAiChatPatch, AlemAiChatSectionInput, AlemAiCurrentUser, AlemAiDocument, AlemAiProfile, AlemAiReminder } from '../../../../../infrastructure/repositories/HttpAlemAiRepository'

interface AskQuestionParams {
  question: string
  token: string
  convId?: string | null
  conversationHistory?: AskHistoryMessage[]
  forceNewSession?: boolean
  file?: File | null
  actionDecision?: ChatActionDecision
}

interface AskQuestionResult {
  answer: string
  convId: string
  conversationHistory: AskHistoryMessage[]
  fullResponse: AskApiResponse
}

export async function askQuestion(params: AskQuestionParams): Promise<AskQuestionResult> {
  const attachment = params.file ?? null
  const payload: AskRequest = { question: params.question }
  const convId = params.convId?.trim()
  const conversationHistory = Array.isArray(params.conversationHistory) ? params.conversationHistory : []

  const api = getAlemAiApi()
  const result = attachment
    ? await api.askQuestionWithAttachment({
        question: params.question,
        chatId: convId,
        image: attachment.type.startsWith('image/') ? attachment : null,
        file: attachment.type.startsWith('image/') ? null : attachment,
        conversationHistory,
      })
    : await (async () => {
        if (convId) payload.conv_id = convId
        if (conversationHistory.length > 0) payload.conversation_history = conversationHistory
        if (params.forceNewSession) payload.force_new_session = true
        if (params.actionDecision) payload.actionDecision = params.actionDecision
        return api.askQuestion(payload)
      })()

  return {
    answer: result.answer,
    convId: result.convId,
    conversationHistory: result.conversationHistory,
    fullResponse: result.fullResponse,
  }
}

export async function uploadAIDocument(_token: string, chatId: string, file: File): Promise<AlemAiDocument> {
  void _token
  return getAlemAiApi().uploadAIDocument(chatId, file)
}

export async function listAIDocuments(_token: string, chatId: string): Promise<AlemAiDocument[]> {
  void _token
  return getAlemAiApi().listAIDocuments(chatId)
}

export async function waitForAIDocument(
  _token: string,
  chatId: string,
  documentId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<AlemAiDocument> {
  void _token
  const intervalMs = Math.max(500, options.intervalMs ?? 1500)
  const timeoutMs = Math.max(intervalMs, options.timeoutMs ?? 120000)
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    const document = await getAlemAiApi().getAIDocument(chatId, documentId)
    if (document.status === 'ready') return document
    if (document.status === 'failed' || document.status === 'deleted') {
      throw new Error(document.error_message || 'Не удалось обработать документ.')
    }
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
  }
  throw new Error('Документ обрабатывается дольше ожидаемого. Проверьте его статус позже.')
}

export async function listChatConversations(_token: string): Promise<ChatConversationSummary[]> {
  void _token
  const api = getAlemAiApi()
  return api.listChatConversations()
}

export async function createChatConversation(_token: string, name: string, sectionId?: string | null): Promise<ChatConversationSummary> {
  void _token
  const api = getAlemAiApi()
  return api.createChatConversation(name, sectionId)
}

export async function getChatConversation(_token: string, convId: string): Promise<ChatConversationDetail> {
  void _token
  const api = getAlemAiApi()
  return api.getChatConversation(convId)
}

export async function fetchTools(_token: string): Promise<ChatToolInfo[]> {
  void _token
  const api = getAlemAiApi()
  return api.fetchTools()
}

export async function getCurrentUser(_token: string): Promise<AlemAiCurrentUser> {
  void _token
  const api = getAlemAiApi()
  return api.getCurrentUser()
}

export async function getProfile(_token: string): Promise<AlemAiProfile> {
  void _token
  const api = getAlemAiApi()
  return api.getProfile()
}

export async function updateProfile(_token: string, profile: AlemAiProfile): Promise<AlemAiProfile> {
  void _token
  const api = getAlemAiApi()
  return api.updateProfile(profile)
}

export async function listReminders(_token: string): Promise<AlemAiReminder[]> {
  void _token
  const api = getAlemAiApi()
  return api.listReminders()
}

export async function createReminder(_token: string, text: string, dueAt: string): Promise<AlemAiReminder> {
  void _token
  const api = getAlemAiApi()
  return api.createReminder(text, dueAt)
}

export async function markReminderDone(_token: string, reminderId: string): Promise<void> {
  void _token
  const api = getAlemAiApi()
  return api.markReminderDone(reminderId)
}

export async function deleteReminder(_token: string, reminderId: string): Promise<void> {
  void _token
  const api = getAlemAiApi()
  return api.deleteReminder(reminderId)
}

export async function pollDueReminders(_token: string): Promise<AlemAiReminder[]> {
  void _token
  const api = getAlemAiApi()
  return api.pollDueReminders()
}

export const updateChatConversation = (convId: string, patch: AlemAiChatPatch) => getAlemAiApi().updateChatConversation(convId, patch)
export const deleteChatConversation = (convId: string) => getAlemAiApi().deleteChatConversation(convId)
export const listChatSections = () => getAlemAiApi().listChatSections()
export const createChatSection = (input: AlemAiChatSectionInput) => getAlemAiApi().createChatSection(input)
export const updateChatSection = (sectionId: string, input: Partial<AlemAiChatSectionInput>) => getAlemAiApi().updateChatSection(sectionId, input)
export const deleteChatSection = (sectionId: string) => getAlemAiApi().deleteChatSection(sectionId)
