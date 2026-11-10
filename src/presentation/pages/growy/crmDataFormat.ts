import type { ToneName } from './crmTones'

export interface ImportType { entity: string | null; name: string; import_mode: string; max_file_size: number; template_available: boolean }
export interface ImportField { field_key: string; label: string; importable: boolean; require_mapping: boolean }
export interface ImportSheet { sheet_name: string; header_row: number; rows_count: number; columns: string[]; auto_mapping: Record<string, string>; fields: ImportField[] }
export interface ImportIssue { row?: number; severity: string; reason: string; recommendation?: string }
export interface ImportPreview { run_id: number; preview_token: string; summary: Record<string, Record<string, number>>; issues: ImportIssue[]; unresolved_references?: unknown[] }
export interface ImportJob { run_id: number; source: string; status: string; created_at: string; progress?: { processed?: number; total?: number; failed?: number }; can_rollback?: boolean; issues?: ImportIssue[]; cancel_requested?: boolean }
export interface ExportJob { job_id: number; entity: string; status: string; file_format: string; created_at: string; error_message?: string }

export const JOB_STATUSES = ['preview', 'queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled', 'rolled_back'] as const
export const JOB_TONE: Record<string, ToneName> = {
  preview: 'neutral', queued: 'action', processing: 'action', completed: 'success',
  completed_with_errors: 'warning', failed: 'error', cancelled: 'neutral', rolled_back: 'neutral',
}
export const isRunning = (status: string) => ['queued', 'processing'].includes(status)
export const DUPLICATE_RULES = ['fill_empty', 'update', 'skip', 'create_duplicate'] as const
export const EXPORT_ENTITIES = ['lead', 'contact', 'deal', 'full'] as const
export type ExportEntity = typeof EXPORT_ENTITIES[number]
export const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
