import { useTranslation } from 'react-i18next'
import type { BoardTask } from '../../../domain/entities/board/BoardModels'
import type { PendingAssignmentCommand } from '../../../domain/entities/AssignmentCompletion'
import { canStartNewAssignmentCommand, validAssignmentResult } from '../../../application/use-cases/assignments/assignmentPolicy'
import AppModal from '../../../shared/ui/AppModal'
import type { AssignmentErrorKey } from './useAssignments'

interface Props {
  task: BoardTask
  pending?: PendingAssignmentCommand
  draft: string
  allowed: boolean
  sending: boolean
  error: AssignmentErrorKey | null
  onDraft: (value: string) => void
  onSubmit: (value: string) => void
  onStartNew: () => void
  onClose: () => void
}

export default function AssignmentResultDialog({ task, pending, draft, allowed, sending, error, onDraft, onSubmit, onStartNew, onClose }: Props) {
  const { t } = useTranslation('assignments')
  const frozen = Boolean(pending && pending.phase !== 'invalid')
  const result = frozen ? pending!.command.result_comment : draft
  const confirmed = pending?.phase === 'confirmed'
  const conflict = pending?.phase === 'conflict'
  return <AppModal title={t('dialog.title')} onClose={onClose} footer={<>
    <button type="button" className="ts-button ts-button--secondary" onClick={onClose}>{t('dialog.close')}</button>
    {conflict && allowed && canStartNewAssignmentCommand(task, pending) && <button type="button" className="ts-button ts-button--secondary" disabled={sending} onClick={onStartNew}>{t('dialog.newCommand')}</button>}
    {!confirmed && !conflict && <button type="submit" form="assignment-result" className="ts-button ts-button--primary" disabled={sending || !allowed || !validAssignmentResult(result)}>{sending ? t('dialog.sending') : frozen ? t('dialog.retry') : t('dialog.submit')}</button>}
  </>}>
    <form id="assignment-result" onSubmit={event => { event.preventDefault(); if (allowed && !sending && !confirmed && !conflict && validAssignmentResult(result)) onSubmit(result) }} className="space-y-4">
      <p className="break-words font-medium">{task.title}</p>
      {error && <p role="alert" className="text-sm text-[#AE2634]">{t(error)}</p>}
      {!allowed && <p role="alert" className="text-sm text-[#AE2634]">{t('errors.denied')}</p>}
      {confirmed && <p role="status" className="text-sm text-[#137333]">{t('confirmed')}</p>}
      {frozen && <p className="text-sm text-[#586174]">{t('dialog.locked')}</p>}
      <label className="ts-field block" htmlFor="assignment-result-text">{t('dialog.result')}</label>
      <textarea id="assignment-result-text" className="ts-input w-full" rows={6} value={result} readOnly={frozen || !allowed || sending} placeholder={t('dialog.placeholder')} onChange={event => onDraft(event.target.value)} />
      <p className="text-sm text-[#586174]">{t('dialog.limit', { count: Array.from(result).length })}</p>
    </form>
  </AppModal>
}
