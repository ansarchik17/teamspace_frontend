export type AskHistoryMessage = {
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  data_cards?: AskDataCard[]
  data_sources?: AskDataSource[]
}

export interface AskDataCard {
  id: string
  source_id: string
  title: string
  service: string
  status?: string
  due_at?: string
  href?: string
  empty?: boolean
  fields?: Array<{ label: string; value: string }>
  external_url?: string
  confirmation?: { token: string; expires_at: string }
}

export interface ChatActionDecision {
  token: string
  decision: 'confirm' | 'cancel'
}

export type AskRequest = {
  question: string
  conv_id?: string | null
  conversation_history?: AskHistoryMessage[]
  force_new_session?: boolean
  tool?: string
  actionDecision?: ChatActionDecision
}

export interface AskConfidence {
  score: number
  label: string
  reason: string
  heuristic: boolean
}

export interface AskSource {
  title: string
  url: string
  content: string
  score?: number | null
}

export interface AskDocumentSource {
  document_id: string
  name: string
  chunk_id: string
  locator?: Record<string, unknown>
  rank: number
}

export interface AskDataSource {
  id: string
  dataset: string
  title: string
  retrieved_at: string
  status: string
  truncated?: boolean
}

export interface AskResponse {
  answer: string
  route: string
  learned: boolean
  rationale: string
  confidence: AskConfidence
  sources: AskSource[]
  document_sources?: AskDocumentSource[]
  data_sources?: AskDataSource[]
  data_cards?: AskDataCard[]
  kb_hits: unknown[]
  conversation_history: AskHistoryMessage[]
  conv_id?: string
  session_id?: string
}

export interface ChatConversationSummary {
  conv_id: string
  name: string
  updated_at?: string | null
  last_message_at?: string | null
  preview?: string | null
  last_message?: string | null
  pinned?: boolean
  archived?: boolean
  archived_at?: string | null
  section_id?: string | null
}

export interface ChatConversationDetail {
  conv_id: string
  name: string
  messages: AskHistoryMessage[]
  updated_at?: string | null
}

export interface ChatToolInfo {
  id: string
  label: string
  description: string
  endpoint: string
  method: string
  accepts_text: boolean
  accepts_file: boolean
  file_endpoint?: string
}

export type AskApiResponse = AskResponse
