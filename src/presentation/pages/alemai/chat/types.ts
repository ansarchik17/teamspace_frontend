import type { AskDataCard, AskDataSource } from './api/types'

export type ChatRole = 'assistant' | 'user'

export interface ChatMessage {
  id: number
  role: ChatRole
  text: string
  time?: string
  meta?: {
    isError?: boolean
    retryable?: boolean
    dataCards?: AskDataCard[]
    dataSources?: AskDataSource[]
    route?: string
    learned?: boolean
    rationale?: string
    confidenceScore?: number
    confidenceLabel?: string
    noLiveSources?: boolean
    sources?: Array<{
      title: string
      url: string
    }>
  }
}
