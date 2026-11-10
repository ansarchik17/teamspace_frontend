import { useEffect, useState, type ReactNode } from 'react'
import {
  Hand, Maximize2, MessageSquare, Mic, MicOff, Monitor, PhoneOff,
  Presentation, Smile, Users, Video, VideoOff,
} from 'lucide-react'

interface CallControlsProps {
  isMicrophoneEnabled: boolean
  isCameraEnabled: boolean
  isScreenShareEnabled: boolean
  isHandRaised: boolean
  isChatVisible: boolean
  isWhiteboardVisible: boolean
  isParticipantsVisible?: boolean
  isInfoVisible?: boolean
  hasUnreadChat: boolean
  isMinimized?: boolean
  participantCount?: number
  connectionLabel?: string
  connectionTone?: 'connected' | 'waiting' | 'connecting' | 'reconnecting' | 'disconnected' | 'error'
  onToggleMicrophone: () => void
  onToggleCamera: () => void
  onToggleScreenShare: () => void
  onToggleHandRaise: () => void
  onToggleChat: () => void
  onToggleWhiteboard: () => void
  onOpenParticipants: () => void
  onToggleInfo: () => void
  onToggleEmojiPicker: () => void
  onHangUp: () => void
  onExpand: () => void
}

function ControlButton({ icon, label, active = false, muted = false, danger = false, badge = false, compact = false, onClick }: {
  icon: ReactNode
  label: string
  active?: boolean
  muted?: boolean
  danger?: boolean
  badge?: boolean
  compact?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`call-control${active ? ' call-control--active' : ''}${muted ? ' call-control--muted' : ''}${danger ? ' call-control--danger' : ''}${compact ? ' call-control--compact' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span className="call-control__icon">{icon}{badge ? <i className="call-control__badge" /> : null}</span>
      {!compact ? <span className="call-control__label">{danger ? 'Выйти' : label}</span> : null}
    </button>
  )
}

export default function CallControls({
  isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled, isHandRaised,
  isChatVisible, isWhiteboardVisible, isParticipantsVisible = false,
  hasUnreadChat, isMinimized = false, participantCount = 0,
  connectionLabel = 'Подключение', connectionTone = 'connecting', onToggleMicrophone, onToggleCamera,
  onToggleScreenShare, onToggleHandRaise, onToggleChat, onToggleWhiteboard,
  onOpenParticipants, onToggleEmojiPicker, onHangUp, onExpand,
}: CallControlsProps) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (isMinimized) return
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [isMinimized])

  if (isMinimized) {
    return (
      <div className="call-mini-controls">
        <ControlButton compact label="Развернуть" icon={<Maximize2 size={18} />} onClick={onExpand} />
        <ControlButton compact label={isMicrophoneEnabled ? 'Выключить микрофон' : 'Включить микрофон'} icon={isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />} muted={!isMicrophoneEnabled} onClick={onToggleMicrophone} />
        <ControlButton compact label={isCameraEnabled ? 'Выключить камеру' : 'Включить камеру'} icon={isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />} muted={!isCameraEnabled} onClick={onToggleCamera} />
        <ControlButton compact danger label="Завершить звонок" icon={<PhoneOff size={18} />} onClick={onHangUp} />
      </div>
    )
  }

  return (
    <footer className="call-toolbar">
      <div className="call-toolbar__meta">
        <strong>{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</strong>
        <span className="call-toolbar__separator" />
        <span>{participantCount} {participantCount === 1 ? 'участник' : participantCount >= 2 && participantCount <= 4 ? 'участника' : 'участников'}</span>
        <span className="call-toolbar__separator" />
        <span className={`call-toolbar__signal call-toolbar__signal--${connectionTone}`}><i />{connectionLabel}</span>
      </div>
      <div className="call-toolbar__main">
        <ControlButton label="Микрофон" icon={isMicrophoneEnabled ? <Mic size={21} /> : <MicOff size={21} />} muted={!isMicrophoneEnabled} onClick={onToggleMicrophone} />
        <ControlButton label="Камера" icon={isCameraEnabled ? <Video size={21} /> : <VideoOff size={21} />} muted={!isCameraEnabled} onClick={onToggleCamera} />
        <span className="call-toolbar__divider" />
        <ControlButton label="Экран" icon={<Monitor size={21} />} active={isScreenShareEnabled} onClick={onToggleScreenShare} />
        <ControlButton label="Рука" icon={<Hand size={21} />} active={isHandRaised} onClick={onToggleHandRaise} />
        <ControlButton label="Реакции" icon={<Smile size={21} />} onClick={onToggleEmojiPicker} />
        <ControlButton label="Доска" icon={<Presentation size={21} />} active={isWhiteboardVisible} onClick={onToggleWhiteboard} />
      </div>
      <div className="call-toolbar__end">
        <ControlButton label="Чат" icon={<MessageSquare size={21} />} active={isChatVisible} badge={hasUnreadChat} onClick={onToggleChat} />
        <ControlButton label="Участники" icon={<Users size={21} />} active={isParticipantsVisible} onClick={onOpenParticipants} />
        <span className="call-toolbar__divider" />
        <ControlButton label="Завершить звонок" icon={<PhoneOff size={22} />} danger onClick={onHangUp} />
      </div>
    </footer>
  )
}
