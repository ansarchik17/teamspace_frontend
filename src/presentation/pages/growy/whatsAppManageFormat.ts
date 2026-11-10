import type { WhatsAppTemplate } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { TONES, type ToneName } from './crmTones'

export { TONES }

export interface WhatsAppBroadcast {
  id: number
  name: string
  status: string
  template_name: string
  scheduled_at?: string
  created_at?: string
  recipient_counts: { total: number; sent: number; delivered: number; read: number; failed: number }
}


export type TemplateState = 'approved' | 'pending' | 'rejected' | 'paused' | 'draft' | 'other'
export const templateState = (status?: string): TemplateState => {
  const value = (status || '').toUpperCase()
  if (value === 'APPROVED') return 'approved'
  if (['PENDING', 'IN_APPEAL', 'SUBMITTED', 'IN_REVIEW', 'ON_REVIEW'].includes(value)) return 'pending'
  if (['REJECTED', 'DISABLED', 'DELETED'].includes(value)) return 'rejected'
  if (value === 'PAUSED') return 'paused'
  if (['DRAFT', 'NOT_SENT'].includes(value)) return 'draft'
  return 'other'
}
export const TEMPLATE_STATE_TONE: Record<TemplateState, ToneName> = {
  approved: 'success', pending: 'warning', rejected: 'error', paused: 'warning', draft: 'neutral', other: 'neutral',
}

export type TemplateKind = 'marketing' | 'utility' | 'authentication' | 'other'
export const templateKind = (category?: string): TemplateKind => {
  const value = (category || '').toUpperCase()
  if (value === 'MARKETING') return 'marketing'
  if (value === 'UTILITY') return 'utility'
  if (value === 'AUTHENTICATION') return 'authentication'
  return 'other'
}
export const KIND_TONE: Record<TemplateKind, ToneName> = { marketing: 'warning', utility: 'action', authentication: 'neutral', other: 'neutral' }

export const BROADCAST_TONE: Record<string, ToneName> = {
  draft: 'neutral', scheduled: 'action', running: 'action', paused: 'warning', cancelled: 'neutral',
  completed: 'success', completed_with_errors: 'warning', failed: 'error',
}

export const templateVariables = (text = '') =>
  [...new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])))].sort((a, b) => a - b)

export const templateParts = (text = '') => text.split(/(\{\{\s*\d+\s*\}\})/g).map((part) => {
  const match = part.match(/^\{\{\s*(\d+)\s*\}\}$/)
  return match ? { variable: Number(match[1]), text: part } : { variable: null, text: part }
})

export const languageLabel = (code?: string) => {
  if (!code) return '—'
  const value = code.toLowerCase()
  if (value.startsWith('kk') || value.startsWith('kz')) return 'KZ'
  return value.slice(0, 2).toUpperCase()
}

export const shortDate = (value: string | undefined, language: string) =>
  value ? new Date(value).toLocaleDateString(language === 'kk' ? 'kk-KZ' : 'ru-RU', { day: 'numeric', month: 'short' }) : '—'

export const templateUpdated = (template: WhatsAppTemplate) => template.updated_at || template.created_at
