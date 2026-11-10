import { useEffect, useState } from 'react'
import type { BoardChecklistItem } from '../../../domain/entities/board/BoardModels'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { bt } from './boardText'

type ChecklistUpdate = { text?: string; completed?: boolean }

const getRequestErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback

interface TaskChecklistSectionProps {
  taskId: string
  canEdit: boolean
  onLoad: (taskId: string) => Promise<BoardChecklistItem[]>
  onCreate: (taskId: string, payload: { text: string; completed?: boolean; position?: number }) => Promise<BoardChecklistItem>
  onUpdate: (taskId: string, itemId: string, payload: ChecklistUpdate) => Promise<BoardChecklistItem>
  onDelete: (taskId: string, itemId: string) => Promise<void>
}

export default function TaskChecklistSection({ taskId, canEdit, onLoad, onCreate, onUpdate, onDelete }: TaskChecklistSectionProps) {
  const [items, setItems] = useState<BoardChecklistItem[]>([])
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editingText, setEditingText] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setDraft('')
    setEditingId('')

    void onLoad(taskId)
      .then((loaded) => {
        if (!cancelled) setItems(loaded)
      })
      .catch((error) => {
        if (!cancelled) {
          setItems([])
          setError(getRequestErrorMessage(error, bt('checklist.loadError')))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [taskId])

  const replaceItem = (next: BoardChecklistItem) => {
    setItems((current) => current.map((item) => item.id === next.id ? next : item))
  }

  const addItem = async () => {
    const text = draft.trim()
    if (!text || adding) return

    setAdding(true)
    setError('')
    try {
      const created = await onCreate(taskId, { text, position: items.length })
      setItems((current) => [...current, created].sort((left, right) => left.position - right.position))
      setDraft('')
    } catch (error) {
      setError(getRequestErrorMessage(error, bt('checklist.addError')))
    } finally {
      setAdding(false)
    }
  }

  const updateItem = async (itemId: string, payload: ChecklistUpdate) => {
    if (savingId) return

    setSavingId(itemId)
    setError('')
    try {
      replaceItem(await onUpdate(taskId, itemId, payload))
      setEditingId('')
    } catch (error) {
      setError(getRequestErrorMessage(error, bt('checklist.saveError')))
    } finally {
      setSavingId('')
    }
  }

  const deleteItem = async (itemId: string) => {
    if (savingId) return

    setSavingId(itemId)
    setError('')
    try {
      await onDelete(taskId, itemId)
      setItems((current) => current.filter((item) => item.id !== itemId))
      setEditingId('')
    } catch (error) {
      setError(getRequestErrorMessage(error, bt('checklist.deleteError')))
    } finally {
      setSavingId('')
    }
  }

  const completedCount = items.filter((item) => item.completed).length
  const progress = items.length ? Math.round((completedCount / items.length) * 100) : 0

  return (
    <section>
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="h-[18px] w-[18px] rounded-full bg-[#F2F2F7]" />
              <span className="h-2.5 w-2/3 rounded-full bg-[#F2F2F7]" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {items.length ? (
            <div className="mb-3 flex items-center gap-3">
              <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#F2F2F7]">
                <div className="h-full rounded-full bg-[#2458D3] transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[11px] tabular-nums text-[#8E8E93]">{bt('stats.ai.ofCount', { done: completedCount, total: items.length })}</span>
            </div>
          ) : null}

          <ul>
            {items.map((item) => {
              const isSaving = savingId === item.id
              const isEditing = editingId === item.id
              return (
                <li key={item.id} className="group flex min-h-9 items-center gap-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.completed}
                    disabled={!canEdit || isSaving}
                    onClick={() => { void updateItem(item.id, { completed: !item.completed }) }}
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition disabled:cursor-default ${item.completed ? 'border-[#2458D3] bg-[#2458D3] text-white' : 'border-[#C7C7CC] bg-white hover:border-[#8E8E93]'}`}
                    aria-label={bt('checklist.toggle', { text: item.text })}
                  >
                    {item.completed ? <Check size={11} strokeWidth={3} /> : null}
                  </button>
                  {isEditing ? (
                    <input
                      value={editingText}
                      disabled={isSaving}
                      onChange={(event) => setEditingText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && editingText.trim()) void updateItem(item.id, { text: editingText.trim() })
                        if (event.key === 'Escape') setEditingId('')
                      }}
                      onBlur={() => {
                        if (editingText.trim() && editingText.trim() !== item.text) void updateItem(item.id, { text: editingText.trim() })
                        else setEditingId('')
                      }}
                      className="h-7 min-w-0 flex-1 border-b border-[#2458D3] bg-transparent text-[13px] text-[#1D1D1F] outline-none"
                      autoFocus
                    />
                  ) : (
                    <span
                      onDoubleClick={() => { if (canEdit) { setEditingId(item.id); setEditingText(item.text) } }}
                      className={`min-w-0 flex-1 text-[13px] leading-[18px] transition ${item.completed ? 'text-[#AEAEB2] line-through' : 'text-[#1D1D1F]'}`}
                    >
                      {item.text}
                    </span>
                  )}
                  {canEdit && !isEditing ? (
                    <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button type="button" disabled={isSaving} onClick={() => { setEditingId(item.id); setEditingText(item.text) }} className="flex h-6 w-6 items-center justify-center rounded-md text-[#AEAEB2] transition hover:text-[#1D1D1F] disabled:opacity-50" aria-label={bt('checklist.edit')}>
                        <Pencil size={13} strokeWidth={1.75} />
                      </button>
                      <button type="button" disabled={isSaving} onClick={() => { void deleteItem(item.id) }} className="flex h-6 w-6 items-center justify-center rounded-md text-[#AEAEB2] transition hover:text-[#D92D20] disabled:opacity-50" aria-label={bt('checklist.delete')}>
                        <Trash2 size={13} strokeWidth={1.75} />
                      </button>
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>

          {!items.length && !canEdit ? <p className="py-6 text-center text-[13px] text-[#8E8E93]">{bt('checklist.empty')}</p> : null}

          {canEdit ? (
            <div className="flex min-h-9 items-center gap-2.5">
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[#AEAEB2]">
                <Plus size={15} strokeWidth={1.75} />
              </span>
              <input
                value={draft}
                disabled={adding}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void addItem() }}
                placeholder={adding ? bt('checklist.adding') : bt('checklist.add')}
                className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-[#1D1D1F] outline-none placeholder:text-[#AEAEB2]"
              />
            </div>
          ) : null}
        </>
      )}

      {error ? <p className="mt-2 text-[12px] text-[#D92D20]">{error}</p> : null}
    </section>
  )
}
