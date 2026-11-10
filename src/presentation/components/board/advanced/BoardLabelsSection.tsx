import { useMemo, useState } from 'react'
import type { BoardLabelViewModel } from '../../../view-models/BoardViewModel'
import AppConfirmDialog from '../../../../shared/ui/AppConfirmDialog'
import { bt } from '../boardText'

interface BoardLabelsSectionProps {
  labels: BoardLabelViewModel[]
  selectedTaskLabelIds: string[]
  isLoading: boolean
  onCreateLabel: (payload: { name: string; color: string }) => Promise<void>
  onDeleteLabel: (labelId: string) => Promise<void>
  onAddTaskLabel: (labelId: string) => Promise<void>
  onRemoveTaskLabel: (labelId: string) => Promise<void>
}

export default function BoardLabelsSection({
  labels,
  selectedTaskLabelIds,
  isLoading,
  onCreateLabel,
  onDeleteLabel,
  onAddTaskLabel,
  onRemoveTaskLabel,
}: BoardLabelsSectionProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2458D3')
  const [deletingLabelId, setDeletingLabelId] = useState('')

  const isLabelDuplicate = useMemo(() => {
    const trimmed = name.trim().toLowerCase()
    return trimmed !== '' && labels.some((l) => l.name.toLowerCase() === trimmed)
  }, [name, labels])

  const selectedSet = useMemo(() => new Set(selectedTaskLabelIds), [selectedTaskLabelIds])

  return (
    <section className="rounded-2xl border border-[#E2EAF5] bg-white p-4">
      <h4 className="text-base font-bold text-[#0A1628]">{bt('taskDetail.labels')}</h4>
      <p className="mt-1 text-xs text-[#7186A7]">{bt('labels.hint')}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={name}
          maxLength={50}
          onChange={(event) => setName(event.target.value)}
          placeholder={bt('labels.namePlaceholder')}
          className={`h-10 min-w-[220px] flex-1 rounded-xl border bg-[#F9FBFE] px-3 text-sm text-[#0A1628] outline-none focus:border-[#2458D3] ${isLabelDuplicate ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-[#DDE3EE]'}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (!isLabelDuplicate && name.trim()) {
                void onCreateLabel({ name: name.trim(), color }).then(() => {
                  setName('')
                })
              }
            }
          }}
        />
        <input
          value={color}
          onChange={(event) => setColor(event.target.value)}
          type="color"
          aria-label={bt('labels.color')}
          className="h-10 w-14 rounded-xl border border-[#DDE3EE] bg-white px-1"
        />
        <button
          type="button"
          disabled={isLoading || !name.trim() || isLabelDuplicate}
          onClick={() => {
            void onCreateLabel({ name: name.trim(), color }).then(() => {
              setName('')
            })
          }}
          className="ts-button ts-button--primary h-10 rounded-xl bg-[#2458D3] px-4 text-sm font-semibold text-white transition hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {bt('createTask.add')}
        </button>
      </div>
      {isLabelDuplicate && (
        <p className="mt-1 text-[11px] font-semibold text-red-500">{bt('labels.exists')}</p>
      )}

      {isLoading ? (
        <div className="mt-3 h-10 animate-pulse rounded-xl bg-[#EEF3FB]" />
      ) : labels.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {labels.map((label) => {
            const selected = selectedSet.has(label.id)
            return (
              <div
                key={label.id}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                  selected ? 'border-[#B7D6F8] bg-[#EEF2FF]' : 'border-[#DDE3EE] bg-white'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                <span className="font-medium text-[#0A1628]">{label.name}</span>
                <button
                  type="button"
                  aria-label={selected ? bt('labels.removeFromTask', { name: label.name }) : bt('labels.addToTask', { name: label.name })}
                  disabled={isLoading}
                  onClick={() => {
                    void (selected ? onRemoveTaskLabel(label.id) : onAddTaskLabel(label.id))
                  }}
                  className="text-xs font-semibold text-[#2458D3]"
                >
                  {selected ? bt('labels.remove') : bt('labels.toTask')}
                </button>
                <button
                  type="button"
                  aria-label={bt('taskDetail.removeLabel', { name: label.name })}
                  disabled={isLoading}
                  onClick={() => setDeletingLabelId(label.id)}
                  className="text-xs font-semibold text-[#C53030]"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-[#DDE3EE] px-3 py-4 text-sm text-[#8497B4]">
          {bt('labels.empty')}
        </p>
      )}

      <AppConfirmDialog
        open={Boolean(deletingLabelId)}
        title={bt('labels.deleteTitle')}
        message={bt('labels.deleteText')}
        confirmText={bt('delete')}
        isLoading={isLoading}
        onCancel={() => setDeletingLabelId('')}
        onConfirm={() => {
          if (!deletingLabelId) return
          void onDeleteLabel(deletingLabelId).finally(() => {
            setDeletingLabelId('')
          })
        }}
      />
    </section>
  )
}
