import { useRef, useState } from 'react'
import { ArrowUp, Download, FileText, Image as ImageIcon, Paperclip } from 'lucide-react'
import type { BoardCommentViewModel, BoardUserViewModel } from '../../../view-models/BoardViewModel'
import type { BoardTask } from '../../../../domain/entities/board/BoardModels'
import AppConfirmDialog from '../../../../shared/ui/AppConfirmDialog'
import GradientAvatar from '../../../../shared/ui/GradientAvatar'
import { bt } from '../boardText'

const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png'])
const ALLOWED_PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png']
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']

const isSupportedCommentPhoto = (file: File): boolean => {
  if (file.type && ALLOWED_PHOTO_MIME_TYPES.has(file.type.toLowerCase())) return true
  const lowerName = file.name.toLowerCase()
  return ALLOWED_PHOTO_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

const getFileNameFromUrl = (url: string): string => {
  const raw = (() => {
    try {
      return new URL(url).pathname.split('/').pop()?.trim() ?? ''
    } catch {
      return url.split('/').pop()?.split('?')[0]?.trim() ?? ''
    }
  })()
  return decodeURIComponent(raw).replace(/^\d+_/, '') || bt('taskDetail.attachment')
}

const getInitials = (name: string): string =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??'

export const formatRelativeTime = (value: string | undefined, fallback: string): string => {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const diff = Math.max(0, Date.now() - date.getTime())
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return bt('comments.justNow')
  if (minutes < 60) return bt('comments.minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return bt('comments.hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days === 1) return bt('comments.yesterday')
  if (days < 7) return bt('comments.daysAgo', { count: days })
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(/\.$/, '')
}

interface BoardCommentsSectionProps {
  comments: BoardCommentViewModel[]
  users?: BoardUserViewModel[]
  currentUserId?: number | null
  isLoading: boolean
  isSubmitting: boolean
  className?: string
  onOpenAttachment: (url: string) => Promise<void>
  onUpdateComment: (commentId: string, content: string) => Promise<void>
  onDeleteComment: (commentId: string) => Promise<void>
}

export default function BoardCommentsSection({
  comments,
  users = [],
  currentUserId,
  isLoading,
  isSubmitting,
  className = '',
  onOpenAttachment,
  onUpdateComment,
  onDeleteComment,
}: BoardCommentsSectionProps) {
  const [editingId, setEditingId] = useState('')
  const [editingText, setEditingText] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const usersById = new Map(users.map((user) => [user.id, user]))

  const openAttachment = (url: string) => {
    setAttachmentError('')
    void onOpenAttachment(url).catch((error) => {
      setAttachmentError(error instanceof Error && error.message ? error.message : bt('errors.openAttachment'))
    })
  }

  const saveEdit = (commentId: string) => {
    if (!editingText.trim()) return
    void onUpdateComment(commentId, editingText.trim()).then(() => {
      setEditingId('')
      setEditingText('')
    })
  }

  return (
    <div className={className}>
      {isLoading ? (
        <div className="space-y-5">
          {[0, 1].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex gap-2.5">
                <span className="h-6 w-6 shrink-0 rounded-full bg-[#F2F2F7]" />
                <span className="flex-1 space-y-2 pt-1">
                  <span className="block h-2.5 w-32 rounded-full bg-[#F2F2F7]" />
                  <span className="block h-2.5 w-4/5 rounded-full bg-[#F2F2F7]" />
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : comments.length ? (
        <ol>
          {comments.map((comment, index) => {
            const author = usersById.get(comment.userId)
            const canManage = currentUserId == null || currentUserId === comment.userId
            const isEditing = editingId === comment.id
            const isLast = index === comments.length - 1
            return (
              <li key={comment.id} className={`group relative flex gap-2.5 ${isLast ? '' : 'pb-5'}`}>
                {!isLast ? <span className="absolute bottom-1 left-[11.5px] top-7 border-l border-dashed border-[#D1D1D6]" aria-hidden="true" /> : null}
                <span className="relative shrink-0">
                  <GradientAvatar initials={author?.initials || getInitials(comment.authorName)} src={author?.avatarUrl} size={24} seed={comment.userId} />
                </span>
                <div className="min-w-0 flex-1 pt-px">
                  <p className="text-[13px] leading-[18px]">
                    <span className="font-medium text-[#1D1D1F]">{comment.authorName}</span>
                    <span className="ml-1.5 text-[11px] text-[#8E8E93]" title={comment.createdAtLabel}>{formatRelativeTime(comment.createdAt, comment.createdAtLabel)}</span>
                  </p>
                  {isEditing ? (
                    <textarea
                      value={editingText}
                      autoFocus
                      rows={2}
                      onChange={(event) => setEditingText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          saveEdit(comment.id)
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          setEditingId('')
                        }
                      }}
                      className="mt-1 block w-full resize-none border-b border-[#2458D3] bg-transparent pb-1 text-[13px] leading-[18px] text-[#1D1D1F] outline-none"
                    />
                  ) : comment.content ? (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-[#3C3C43]">{comment.content}</p>
                  ) : null}
                  {comment.attachmentUrl && !isEditing ? (
                    <AttachmentCard url={comment.attachmentUrl} onOpen={() => openAttachment(comment.attachmentUrl)} />
                  ) : null}
                  {canManage ? (
                    <div className={`mt-1 flex items-center gap-1.5 text-[11px] text-[#AEAEB2] transition ${isEditing ? '' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
                      {isEditing ? (
                        <>
                          <button type="button" disabled={isSubmitting || !editingText.trim()} onClick={() => saveEdit(comment.id)} className="text-[#2458D3] hover:underline disabled:opacity-50">{bt('save')}</button>
                          <span aria-hidden="true">·</span>
                          <button type="button" onClick={() => setEditingId('')} className="hover:text-[#1D1D1F]">{bt('cancel')}</button>
                        </>
                      ) : (
                        <>
                          {comment.content ? (
                            <>
                              <button type="button" onClick={() => { setEditingId(comment.id); setEditingText(comment.content) }} className="hover:text-[#1D1D1F]">{bt('comments.edit')}</button>
                              <span aria-hidden="true">·</span>
                            </>
                          ) : null}
                          <button type="button" onClick={() => setDeletingId(comment.id)} className="hover:text-[#D92D20]">{bt('delete')}</button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="py-6 text-center text-[13px] text-[#8E8E93]">{bt('comments.empty')}</p>
      )}

      {attachmentError ? <p className="mt-2 text-[12px] text-[#D92D20]">{attachmentError}</p> : null}

      <AppConfirmDialog
        open={Boolean(deletingId)}
        title={bt('comments.deleteTitle')}
        message={bt('comments.deleteText')}
        confirmText={bt('delete')}
        isLoading={isSubmitting}
        onCancel={() => setDeletingId('')}
        onConfirm={() => {
          if (!deletingId) return
          void onDeleteComment(deletingId).finally(() => setDeletingId(''))
        }}
      />
    </div>
  )
}

function AttachmentCard({ url, onOpen }: { url: string; onOpen: () => void }) {
  const fileName = getFileNameFromUrl(url)
  const lower = fileName.toLowerCase()
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1).toUpperCase() : 'FILE'
  const isImage = IMAGE_EXTENSIONS.some((item) => lower.endsWith(item))
  const isPdf = lower.endsWith('.pdf')
  const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-2 flex w-full max-w-[240px] items-center gap-2.5 rounded-xl border border-[#E5E5EA] bg-white px-3 py-2 text-left transition hover:border-[#C7C7CC]"
    >
      <span className={`flex shrink-0 ${isPdf ? 'text-[#E5484D]' : isImage ? 'text-[#16A34A]' : 'text-[#2458D3]'}`}>
        {isImage ? <ImageIcon size={22} strokeWidth={1.5} /> : <FileText size={22} strokeWidth={1.5} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-[#1D1D1F]">{baseName}</span>
        <span className="block text-[11px] text-[#8E8E93]">{extension}</span>
      </span>
      <Download size={15} strokeWidth={1.75} className="shrink-0 text-[#8E8E93]" />
    </button>
  )
}

export function CommentComposer({
  selectedTask,
  currentUser,
  isSubmitting,
  onCreateComment,
  onCreatePhotoComment,
}: {
  selectedTask: BoardTask | null
  currentUser?: BoardUserViewModel
  isSubmitting: boolean
  onCreateComment: (payload: { content: string }) => Promise<void>
  onCreatePhotoComment: (payload: { file: File; content?: string }) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const disabled = !selectedTask || isSubmitting

  const resize = () => {
    const element = inputRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`
  }

  const send = () => {
    if (!text.trim() || disabled) return
    setError('')
    void onCreateComment({ content: text.trim() }).then(() => {
      setText('')
      requestAnimationFrame(resize)
    }).catch((cause: unknown) => {
      setError(cause instanceof Error && cause.message ? cause.message : bt('errors.addComment'))
    })
  }

  return (
    <div>
      <div className="flex items-end gap-2.5">
        <span className="mb-1.5 shrink-0">
          <GradientAvatar initials={currentUser?.initials || '?'} src={currentUser?.avatarUrl} size={20} seed={currentUser?.id ?? 0} />
        </span>
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          disabled={disabled}
          onChange={(event) => { setText(event.target.value); resize() }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder={bt('comments.placeholder')}
          className="block h-8 min-w-0 flex-1 resize-none rounded-lg border border-[#E5E5EA] bg-[#FAFAFA] px-3 py-[6px] text-[13px] leading-[18px] text-[#1D1D1F] outline-none transition placeholder:text-[#8E8E93] focus:border-[#C7C7CC] focus:bg-white disabled:opacity-60"
        />
        <label className={`mb-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#8E8E93] transition hover:text-[#1D1D1F] ${disabled ? 'pointer-events-none opacity-50' : ''}`} title={bt('comments.attachPhoto')}>
          <Paperclip size={16} strokeWidth={1.75} />
          <input
            type="file"
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file || !selectedTask) return
              if (!isSupportedCommentPhoto(file)) {
                setError(bt('comments.onlyImages'))
                return
              }
              setError('')
              void onCreatePhotoComment({ file, content: text.trim() || undefined }).then(() => {
                setText('')
                requestAnimationFrame(resize)
              }).catch((cause: unknown) => {
                setError(cause instanceof Error && cause.message ? cause.message : bt('errors.addPhotoComment'))
              })
            }}
          />
        </label>
        <button
          type="button"
          onClick={send}
          disabled={disabled || !text.trim()}
          className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1D1D1F] text-white transition hover:bg-black disabled:bg-[#E5E5EA] disabled:text-[#AEAEB2]"
          aria-label={bt('comments.send')}
        >
          <ArrowUp size={14} strokeWidth={2.25} />
        </button>
      </div>
      {error ? <p role="alert" className="ml-[30px] mt-1 text-[12px] text-[#D92D20]">{error}</p> : null}
    </div>
  )
}
