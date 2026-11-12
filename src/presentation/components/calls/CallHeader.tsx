import { Check, Copy, LockKeyhole, Maximize2, Minimize2, PictureInPicture2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import ConnectionStatus from './ConnectionStatus'

interface CallHeaderProps {
  title: string
  subtitle: string
  participantCount: number
  connectionTone: 'connected' | 'waiting' | 'connecting' | 'reconnecting' | 'disconnected' | 'error'
  connectionLabel: string
  isRecording?: boolean
  isMinimized?: boolean
  startedAt?: string
  isScreenShareEnabled?: boolean
  meetingLabel?: string
  onOpenParticipants: () => void
  onCopyLink: () => void
  canShareLink: boolean
  onMinimize: () => void
  canOpenPictureInPicture?: boolean
  onOpenPictureInPicture?: () => void
  onDragStart?: (event: React.PointerEvent<HTMLElement>) => void
  onDragMove?: (event: React.PointerEvent<HTMLElement>) => void
  onDragEnd?: (event: React.PointerEvent<HTMLElement>) => void
}

export default function CallHeader({
  title,
  subtitle,
  connectionTone,
  connectionLabel,
  isMinimized = false,
  onCopyLink,
  canShareLink,
  onMinimize,
  canOpenPictureInPicture = false,
  onOpenPictureInPicture,
  onDragStart,
  onDragMove,
  onDragEnd,
}: CallHeaderProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timeout)
  }, [copied])

  return (
    <header
      className={`call-topbar${isMinimized ? ' call-topbar--compact' : ''}`}
      onPointerDown={isMinimized ? onDragStart : undefined}
      onPointerMove={isMinimized ? onDragMove : undefined}
      onPointerUp={isMinimized ? onDragEnd : undefined}
      onPointerCancel={isMinimized ? onDragEnd : undefined}
    >
      <div className="call-topbar__identity">
        <span className="call-topbar__mark" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}unitespace-mark.svg`} alt="" /></span>
        <span className="call-topbar__brand">Видеозвонок</span>
        {!isMinimized ? (
          <>
            <span className="call-topbar__divider" />
            <span className="call-topbar__title" title={subtitle}>{title}</span>
            <LockKeyhole size={13} className="call-topbar__lock" aria-label="Закрытая встреча" />
          </>
        ) : null}
      </div>
      <div className="call-topbar__actions">
        {!isMinimized ? <ConnectionStatus tone={connectionTone} label={connectionLabel} /> : null}
        {canShareLink ? <button
          type="button"
          className="call-topbar__action"
          onClick={() => {
            onCopyLink()
            setCopied(true)
          }}
          title={copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
          aria-label={copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button> : null}
        {canOpenPictureInPicture && onOpenPictureInPicture ? (
          <button
            type="button"
            className="call-topbar__action"
            onClick={onOpenPictureInPicture}
            title="Открыть плавающее окно поверх вкладок"
            aria-label="Открыть плавающее окно поверх вкладок"
          >
            <PictureInPicture2 size={17} />
          </button>
        ) : null}
        <button
          type="button"
          className="call-topbar__action"
          onClick={onMinimize}
          title={isMinimized ? 'Развернуть' : 'Свернуть'}
          aria-label={isMinimized ? 'Развернуть' : 'Свернуть'}
        >
          {isMinimized ? <Maximize2 size={17} /> : <Minimize2 size={17} />}
        </button>
      </div>
    </header>
  )
}
