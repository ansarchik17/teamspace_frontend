import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Room } from 'livekit-client'
import { CalendarDays, Copy, Info, Users, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { CallChatMessage, CallReaction, LiveKitCallState } from '../../calls/types'
import type { UserDirectoryUser } from '../../../infrastructure/repositories/HttpUserDirectoryRepository'
import CallChatPanel from './CallChatPanel'
import CallControls from './CallControls'
import CallHeader from './CallHeader'
import CallVideoGrid from './CallVideoGrid'
import CallWhiteboard from './CallWhiteboard'
import './CallScreen.css'

interface CallScreenProps {
  room: Room | null
  currentCall: LiveKitCallState
  activeReactions: CallReaction[]
  callMessages: CallChatMessage[]
  unreadChatCount: number
  isChatVisible: boolean
  isWhiteboardVisible: boolean
  onSetChatVisible: (visible: boolean) => void
  onSetWhiteboardVisible: (visible: boolean) => void
  onHangUp: () => void
  onToggleMicrophone: () => void
  onToggleCamera: () => void
  onToggleScreenShare: () => void
  onToggleHandRaise: () => void
  onSendReaction: (emoji: string) => void
  onSendMessage: (input: { text: string; recipientId?: string; recipientName?: string }) => void
  onInviteParticipant: (userId: number) => void
  onSearchUsers?: (query: string) => Promise<UserDirectoryUser[]>
}

const ACCENT = '#8AB4F8'

interface DocumentPictureInPictureApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
}

interface WindowWithDocumentPictureInPicture extends Window {
  documentPictureInPicture?: DocumentPictureInPictureApi
}

interface MiniWindowDrag {
  pointerId: number
  startX: number
  startY: number
  left: number
  top: number
  width: number
  height: number
}

type SidePanelMode = 'participants' | 'info' | null

export default function CallScreen({
  room,
  currentCall,
  activeReactions,
  callMessages,
  unreadChatCount,
  isChatVisible,
  isWhiteboardVisible,
  onSetChatVisible,
  onSetWhiteboardVisible,
  onHangUp,
  onToggleMicrophone,
  onToggleCamera,
  onToggleScreenShare,
  onToggleHandRaise,
  onSendReaction,
  onSendMessage,
  onInviteParticipant,
  onSearchUsers,
}: CallScreenProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [openedFromCalendarMeeting] = useState(() =>
    location.pathname.startsWith('/calls/calendar/'),
  )
  const [pictureInPictureWindow, setPictureInPictureWindow] = useState<Window | null>(null)
  const [miniPosition, setMiniPosition] = useState<{ left: number; top: number } | null>(null)
  const miniWindowRef = useRef<HTMLDivElement | null>(null)
  const pictureInPictureWindowRef = useRef<Window | null>(null)
  const pictureInPicturePendingRef = useRef(false)
  const automaticPictureInPictureRef = useRef(false)
  const miniDragRef = useRef<MiniWindowDrag | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [sidePanelMode, setSidePanelMode] = useState<SidePanelMode>(null)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserDirectoryUser[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [invitedUserIds, setInvitedUserIds] = useState<Set<number>>(new Set())

  const participants = currentCall.participants ?? []
  const localParticipant = participants.find((p) => p.isLocal) ?? null
  const showChatPanel = isChatVisible && localParticipant !== null
  const isCalendarMeetingRoute = location.pathname.startsWith('/calls/calendar/')
  const isMeetingRoute =
    openedFromCalendarMeeting ||
    isCalendarMeetingRoute ||
    location.pathname.includes('/meet/')
  const canShareLink = openedFromCalendarMeeting || isCalendarMeetingRoute

  const connectionInfo = useMemo(() => {
    if (currentCall.warning?.includes('Восстанавлив')) {
      return { tone: 'reconnecting' as const, label: 'Переподключение' }
    }
    if (currentCall.warning && currentCall.phase === 'error') {
      return { tone: 'error' as const, label: 'Ошибка подключения' }
    }
    if (currentCall.phase === 'connecting') {
      return {
        tone: currentCall.roomConnected ? ('reconnecting' as const) : ('connecting' as const),
        label: currentCall.roomConnected ? 'Переподключение' : 'Подключение',
      }
    }
    if (currentCall.roomConnected) {
      if (participants.length <= 1) {
        return {
          tone: 'waiting' as const,
          label: currentCall.kind === 'direct' ? 'Ожидаем ответа' : 'Ожидаем участников',
        }
      }
      return { tone: 'connected' as const, label: 'Подключено' }
    }
    if (currentCall.phase === 'error') {
      return { tone: 'error' as const, label: 'Ошибка' }
    }
    return { tone: 'disconnected' as const, label: 'Отключено' }
  }, [currentCall.kind, currentCall.phase, currentCall.roomConnected, currentCall.warning, participants.length])

  const title =
    currentCall.displayName ||
    (isMeetingRoute ? 'Встреча' : currentCall.kind === 'group' ? 'Групповой звонок' : 'Видеозвонок')

  const subtitle =
    currentCall.kind === 'group'
      ? currentCall.groupName || 'Групповой звонок'
      : currentCall.acceptedByName
        ? `В разговоре с ${currentCall.acceptedByName}`
        : currentCall.phase === 'ringing'
          ? 'Ожидаем ответа...'
          : 'Личный звонок'

  const handleCopyLink = async () => {
    if (!canShareLink || typeof window === 'undefined') return
    const href = `${window.location.origin}${import.meta.env.BASE_URL}calls/calendar/${encodeURIComponent(currentCall.roomName)}`
    try {
      await navigator.clipboard.writeText(href)
    } catch {
      // ignore clipboard errors in UI
    }
  }

  const returnToCalendarOrigin = useCallback(() => {
    if (isCalendarMeetingRoute) {
      const historyIndex = (window.history.state as { idx?: number } | null)?.idx
      if (typeof historyIndex === 'number' && historyIndex > 0) {
        navigate(-1)
      } else {
        navigate('/calendar', { replace: true })
      }
    }
  }, [isCalendarMeetingRoute, navigate])

  const minimizeCall = useCallback(() => {
    setIsMinimized(true)
    setSidePanelMode(null)
    onSetChatVisible(false)
    returnToCalendarOrigin()
  }, [onSetChatVisible, returnToCalendarOrigin])

  const handleHangUp = useCallback(() => {
    returnToCalendarOrigin()
    onHangUp()
  }, [onHangUp, returnToCalendarOrigin])

  const openPictureInPicture = useCallback(async (automatic = false) => {
    const pipApi = (window as WindowWithDocumentPictureInPicture).documentPictureInPicture
    if (!pipApi || pictureInPictureWindowRef.current || pictureInPicturePendingRef.current) return

    pictureInPicturePendingRef.current = true
    try {
      const rect = miniWindowRef.current?.getBoundingClientRect()
      const pipWindow = await pipApi.requestWindow({
        width: Math.round(rect?.width || 400),
        height: Math.round(rect?.height || 260),
      })
      const { document: pipDocument } = pipWindow
      pipDocument.documentElement.style.cssText = 'height:100%; margin:0; overflow:hidden;'
      pipDocument.body.style.cssText = 'height:100%; margin:0; overflow:hidden; background:#11161d;'

      document.head
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((styleNode) => pipDocument.head.appendChild(styleNode.cloneNode(true)))

      const pipStyle = pipDocument.createElement('style')
      pipStyle.textContent = `
        .call-mini-window--pip { position:relative !important; inset:auto !important; width:100% !important; height:100% !important; min-width:0 !important; min-height:0 !important; max-width:none !important; max-height:none !important; resize:none !important; }
        .call-mini-window--pip .call-mini-controls { bottom:8px; }
      `
      pipDocument.head.appendChild(pipStyle)

      pictureInPictureWindowRef.current = pipWindow
      automaticPictureInPictureRef.current = automatic
      setPictureInPictureWindow(pipWindow)
      pipWindow.addEventListener('pagehide', () => {
        pictureInPictureWindowRef.current = null
        setPictureInPictureWindow(null)
        const shouldRestoreFullCall =
          automaticPictureInPictureRef.current && document.visibilityState === 'visible'
        automaticPictureInPictureRef.current = false
        if (shouldRestoreFullCall) setIsMinimized(false)
      }, { once: true })
      minimizeCall()
    } catch {
      // Fall back to the in-page mini call if the browser blocks Picture-in-Picture.
      minimizeCall()
    } finally {
      pictureInPicturePendingRef.current = false
    }
  }, [minimizeCall])

  useEffect(() => {
    if (!currentCall.roomConnected || !('mediaSession' in navigator)) return

    const mediaSession = navigator.mediaSession as unknown as {
      setActionHandler: (
        action: string,
        handler: ((details?: { reason?: string }) => void) | null,
      ) => void
    }
    try {
      mediaSession.setActionHandler('enterpictureinpicture', () => {
        void openPictureInPicture(true)
      })
    } catch {
      return
    }

    return () => {
      try {
        mediaSession.setActionHandler('enterpictureinpicture', null)
      } catch {
        // The action may not be supported by this browser.
      }
    }
  }, [currentCall.roomConnected, openPictureInPicture])

  useEffect(() => () => {
    pictureInPictureWindowRef.current?.close()
    pictureInPictureWindowRef.current = null
  }, [])

  useEffect(() => {
    const miniWindow = miniWindowRef.current
    if (!isMinimized || pictureInPictureWindow || !miniWindow) return

    const clampPosition = () => {
      const rect = miniWindow.getBoundingClientRect()
      setMiniPosition((position) => position ? {
        left: Math.min(position.left, Math.max(0, window.innerWidth - rect.width)),
        top: Math.min(position.top, Math.max(0, window.innerHeight - rect.height)),
      } : position)
    }

    const observer = new ResizeObserver(clampPosition)
    observer.observe(miniWindow)
    window.addEventListener('resize', clampPosition)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', clampPosition)
    }
  }, [isMinimized, pictureInPictureWindow])

  const handleMiniPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    const rect = miniWindowRef.current?.getBoundingClientRect()
    if (!rect) return

    miniDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleMiniPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = miniDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const left = Math.min(
      Math.max(0, drag.left + event.clientX - drag.startX),
      Math.max(0, window.innerWidth - drag.width),
    )
    const top = Math.min(
      Math.max(0, drag.top + event.clientY - drag.startY),
      Math.max(0, window.innerHeight - drag.height),
    )
    setMiniPosition({ left, top })
  }

  const handleMiniPointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    if (miniDragRef.current?.pointerId !== event.pointerId) return
    miniDragRef.current = null
  }

  const canOpenPictureInPicture =
    typeof window !== 'undefined' &&
    Boolean((window as WindowWithDocumentPictureInPicture).documentPictureInPicture)

  if (isMinimized) {
    const miniWindow = (
      <div
        ref={miniWindowRef}
        className={`call-mini-window${pictureInPictureWindow ? ' call-mini-window--pip' : ''}`}
        style={{
          position: pictureInPictureWindow ? 'relative' : 'fixed',
          right: pictureInPictureWindow ? undefined : 16,
          bottom: pictureInPictureWindow ? undefined : 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          left: pictureInPictureWindow ? 0 : miniPosition?.left,
          top: pictureInPictureWindow ? 0 : miniPosition?.top,
          width: pictureInPictureWindow ? '100%' : undefined,
          height: pictureInPictureWindow ? '100%' : undefined,
          zIndex: 1500,
          borderRadius: 18,
          overflow: 'hidden',
          background: '#202124',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.36)',
        }}
      >
        <CallHeader
          title={title}
          subtitle={subtitle}
          participantCount={participants.length}
          connectionTone={connectionInfo.tone}
          connectionLabel={connectionInfo.label}
          isMinimized
          startedAt={currentCall.createdAt}
          isScreenShareEnabled={currentCall.isScreenShareEnabled}
          onOpenParticipants={() => setSidePanelMode('participants')}
          canShareLink={canShareLink}
          onCopyLink={handleCopyLink}
          onMinimize={() => setIsMinimized(false)}
          canOpenPictureInPicture={canOpenPictureInPicture && !pictureInPictureWindow}
          onOpenPictureInPicture={() => void openPictureInPicture(false)}
          onDragStart={handleMiniPointerDown}
          onDragMove={handleMiniPointerMove}
          onDragEnd={handleMiniPointerEnd}
        />
        <div style={{ position: 'absolute', inset: 0 }}>
          <CallVideoGrid call={currentCall} participants={participants} accentColor={ACCENT} isMinimized />
        </div>
        <CallControls
          isMicrophoneEnabled={currentCall.isMicrophoneEnabled}
          isCameraEnabled={currentCall.isCameraEnabled}
          isScreenShareEnabled={currentCall.isScreenShareEnabled}
          isHandRaised={Boolean(localParticipant?.isHandRaised)}
          isChatVisible={isChatVisible}
          isWhiteboardVisible={isWhiteboardVisible}
          isParticipantsVisible={sidePanelMode === 'participants'}
          isInfoVisible={sidePanelMode === 'info'}
          hasUnreadChat={unreadChatCount > 0}
          isMinimized
          onToggleMicrophone={onToggleMicrophone}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
          onToggleHandRaise={onToggleHandRaise}
          onToggleChat={() => onSetChatVisible(!isChatVisible)}
          onToggleWhiteboard={() => onSetWhiteboardVisible(!isWhiteboardVisible)}
          onOpenParticipants={() => setSidePanelMode(sidePanelMode === 'participants' ? null : 'participants')}
          onToggleInfo={() => setSidePanelMode(sidePanelMode === 'info' ? null : 'info')}
          onToggleEmojiPicker={() => setShowEmojiPicker((prev) => !prev)}
          onHangUp={handleHangUp}
          onExpand={() => setIsMinimized(false)}
        />
      </div>
    )

    return pictureInPictureWindow
      ? createPortal(miniWindow, pictureInPictureWindow.document.body)
      : miniWindow
  }

  return (
    <>
      <div className={`call-stage${sidePanelMode || showChatPanel ? ' call-stage--panel' : ''}`}>
        <CallHeader
            title={title}
            subtitle={subtitle}
            participantCount={participants.length}
            connectionTone={connectionInfo.tone}
            connectionLabel={connectionInfo.label}
            startedAt={currentCall.createdAt}
            isScreenShareEnabled={currentCall.isScreenShareEnabled}
            onOpenParticipants={() => setSidePanelMode(sidePanelMode === 'participants' ? null : 'participants')}
            canShareLink={canShareLink}
            onCopyLink={handleCopyLink}
            canOpenPictureInPicture={canOpenPictureInPicture}
            onOpenPictureInPicture={() => void openPictureInPicture(false)}
            onMinimize={minimizeCall}
        />
        <div className="call-stage__video">
          <CallVideoGrid call={currentCall} participants={participants} accentColor={ACCENT} />

          {currentCall.warning ? (
            <div
              style={{
                position: 'absolute',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 25,
                maxWidth: 'min(90vw, 560px)',
                borderRadius: 16,
                padding: '12px 18px',
                background: 'rgba(95, 26, 24, 0.9)',
                border: '1px solid rgba(242,139,130,0.18)',
                color: '#FCE8E6',
                fontSize: 13,
                fontWeight: 600,
                backdropFilter: 'blur(16px)',
              }}
            >
              {currentCall.warning}
            </div>
          ) : null}

          {room && localParticipant ? (
            <div
              style={{
                display: isWhiteboardVisible ? 'block' : 'none',
                position: 'absolute',
                inset: 0,
                zIndex: 100,
              }}
            >
              <CallWhiteboard
                room={room}
                onClose={() => onSetWhiteboardVisible(false)}
                currentUserName={localParticipant.name || ''}
                isVisible={isWhiteboardVisible}
              />
            </div>
          ) : null}

        </div>

        {showChatPanel && localParticipant ? (
          <CallChatPanel
            messages={callMessages}
            onSendMessage={(text, recipientId, recipientName) =>
              onSendMessage({ text, recipientId, recipientName })
            }
            onClose={() => onSetChatVisible(false)}
            localIdentity={localParticipant.identity}
            participantCount={participants.length}
            onOpenParticipants={() => {
              onSetChatVisible(false)
              setSidePanelMode('participants')
            }}
            onOpenInfo={() => {
              onSetChatVisible(false)
              setSidePanelMode('info')
            }}
            participants={participants.map((p) => ({
              identity: p.identity,
              name: p.name,
            }))}
          />
        ) : null}

        {sidePanelMode ? (
          <CallSidePanel
            mode={sidePanelMode}
            title={title}
            statusLabel={connectionInfo.label}
            participants={participants}
            userSearchQuery={userSearchQuery}
            searchResults={searchResults}
            isSearching={isSearching}
            invitedUserIds={invitedUserIds}
            onClose={() => setSidePanelMode(null)}
            onSetMode={setSidePanelMode}
            onOpenChat={() => {
              setSidePanelMode(null)
              onSetChatVisible(true)
            }}
            onCopyLink={handleCopyLink}
            canShareLink={canShareLink}
            onOpenCalendar={() => navigate('/calendar')}
            onSearchChange={(value) => {
              setUserSearchQuery(value)
              if (!onSearchUsers || !value.trim()) {
                setSearchResults([])
                setIsSearching(false)
                return
              }
              setIsSearching(true)
              onSearchUsers(value)
                .then((results) => {
                  setSearchResults(results)
                  setIsSearching(false)
                })
                .catch(() => setIsSearching(false))
            }}
            onInvite={(userId) => {
              if (invitedUserIds.has(userId)) return
              onInviteParticipant(userId)
              setInvitedUserIds((prev) => {
                const next = new Set(prev)
                next.add(userId)
                return next
              })
            }}
          />
        ) : null}
        <CallControls
          isMicrophoneEnabled={currentCall.isMicrophoneEnabled}
          isCameraEnabled={currentCall.isCameraEnabled}
          isScreenShareEnabled={currentCall.isScreenShareEnabled}
          isHandRaised={Boolean(localParticipant?.isHandRaised)}
          isChatVisible={isChatVisible}
          isWhiteboardVisible={isWhiteboardVisible}
          isParticipantsVisible={sidePanelMode === 'participants'}
          isInfoVisible={sidePanelMode === 'info'}
          hasUnreadChat={unreadChatCount > 0}
          participantCount={participants.length}
          connectionLabel={connectionInfo.label}
          connectionTone={connectionInfo.tone}
          onToggleMicrophone={onToggleMicrophone}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
          onToggleHandRaise={onToggleHandRaise}
          onToggleChat={() => {
            setSidePanelMode(null)
            onSetChatVisible(!isChatVisible)
          }}
          onToggleWhiteboard={() => onSetWhiteboardVisible(!isWhiteboardVisible)}
          onOpenParticipants={() => {
            onSetChatVisible(false)
            setSidePanelMode(sidePanelMode === 'participants' ? null : 'participants')
          }}
          onToggleInfo={() => {
            onSetChatVisible(false)
            setSidePanelMode(sidePanelMode === 'info' ? null : 'info')
          }}
          onToggleEmojiPicker={() => setShowEmojiPicker((prev) => !prev)}
          onHangUp={handleHangUp}
          onExpand={() => setIsMinimized(false)}
        />
      </div>

      {showEmojiPicker ? (
        <div onClick={() => setShowEmojiPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 1600 }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: '50%',
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 110px)',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 8,
              padding: '12px 14px',
              borderRadius: 999,
               background: 'rgba(32, 33, 36, 0.96)',
               border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(18px)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              zIndex: 1601,
            }}
          >
            {['👍', '❤️', '😂', '👏', '🎉', '😮'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSendReaction(emoji)
                  setShowEmojiPicker(false)
                }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                   border: '1px solid rgba(255,255,255,0.06)',
                   background: 'rgba(60,64,67,0.92)',
                  fontSize: 22,
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1700, overflow: 'hidden' }}>
        {activeReactions.map((reaction) => (
          <FloatingReaction key={reaction.id} reaction={reaction} />
        ))}
      </div>
    </>
  )
}

function FloatingReaction({ reaction }: { reaction: CallReaction }) {
  const [leftOffset] = useState(() => Math.random() * 46 - 23)
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 132,
        left: `calc(50% + ${leftOffset}%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        animation: 'call-float-up 4s ease-out forwards',
      }}
    >
      <span style={{ fontSize: 42 }}>{reaction.emoji}</span>
      <div
        style={{
          padding: '4px 9px',
          borderRadius: 999,
           background: 'rgba(32, 33, 36, 0.9)',
           border: '1px solid rgba(255,255,255,0.06)',
           color: '#E8EAED',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {reaction.senderName}
      </div>
      <style>{`
        @keyframes call-float-up {
          0% { transform: translateY(0); opacity: 0; }
          12% { opacity: 1; }
          82% { opacity: 1; }
          100% { transform: translateY(-260px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function CallSidePanel({
  mode,
  title,
  statusLabel,
  participants,
  userSearchQuery,
  searchResults,
  isSearching,
  invitedUserIds,
  onClose,
  onSetMode,
  onOpenChat,
  onCopyLink,
  canShareLink,
  onOpenCalendar,
  onSearchChange,
  onInvite,
}: {
  mode: 'participants' | 'info'
  title: string
  statusLabel: string
  participants: LiveKitCallState['participants']
  userSearchQuery: string
  searchResults: UserDirectoryUser[]
  isSearching: boolean
  invitedUserIds: Set<number>
  onClose: () => void
  onSetMode: (mode: 'participants' | 'info') => void
  onOpenChat: () => void
  onCopyLink: () => void
  canShareLink: boolean
  onOpenCalendar: () => void
  onSearchChange: (value: string) => void
  onInvite: (userId: number) => void
}) {
  return (
    <aside
      style={{
        position: 'relative',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        background: '#1a2028',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '-20px 0 50px rgba(0,0,0,0.24)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '0 12px',
          minHeight: 54,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 7, height: 54, minWidth: 0 }}>
          <button type="button" className="call-panel-tab" onClick={onOpenChat}>Чат</button>
          <button type="button" className={`call-panel-tab${mode === 'participants' ? ' call-panel-tab--active' : ''}`} onClick={() => onSetMode('participants')}>Участники <span className="call-panel-count">{participants.length}</span></button>
          <button type="button" className={`call-panel-tab${mode === 'info' ? ' call-panel-tab--active' : ''}`} onClick={() => onSetMode('info')}>О встрече</button>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <X size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {mode === 'participants' ? (
          <>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Пригласить участника..."
                style={{
                  width: '100%',
                  height: 46,
                  borderRadius: 14,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#F8FAFC',
                  outline: 'none',
                  padding: '0 14px',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
              {participants.map((participant) => (
                <div
                  key={participant.sid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderRadius: 16,
                    padding: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #2458D3 0%, #60A5FA 100%)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                    }}
                  >
                    {(participant.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600 }}>
                      {participant.name}
                      {participant.isLocal ? ' (Вы)' : ''}
                    </div>
                    <div style={{ marginTop: 4, color: '#94A3B8', fontSize: 12 }}>
                      {participant.isLocal ? 'Organizer' : 'Participant'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, color: '#94A3B8', fontSize: 11 }}>
                    <span>{participant.isMicrophoneEnabled ? 'Mic on' : 'Mic off'}</span>
                    <span>{participant.isCameraEnabled ? 'Cam on' : 'Cam off'}</span>
                  </div>
                </div>
              ))}
            </div>

            {userSearchQuery.trim() ? (
              <div style={{ marginTop: 20 }}>
                <div style={{ color: '#94A3B8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Найденные пользователи
                </div>
                {isSearching ? (
                  <div style={{ color: '#94A3B8', fontSize: 13 }}>Поиск...</div>
                ) : searchResults.length === 0 ? (
                  <div style={{ color: '#94A3B8', fontSize: 13 }}>Пользователи не найдены</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderRadius: 14,
                          padding: 12,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: '50%',
                            background: 'rgba(47,75,226,0.2)',
                            color: '#DBEAFE',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                          }}
                        >
                          {(user.fullName || user.username || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ color: '#F8FAFC', fontSize: 14, fontWeight: 600 }}>{user.fullName || user.username}</div>
                          <div style={{ marginTop: 3, color: '#94A3B8', fontSize: 12 }}>{user.username}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onInvite(user.id)}
                          disabled={invitedUserIds.has(user.id)}
                          style={{
                            height: 36,
                            borderRadius: 999,
                            border: 'none',
                            padding: '0 14px',
                            background: invitedUserIds.has(user.id) ? 'rgba(255,255,255,0.08)' : '#2458D3',
                            color: '#FFFFFF',
                            cursor: invitedUserIds.has(user.id) ? 'default' : 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          {invitedUserIds.has(user.id) ? 'Приглашён' : 'Invite'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <InfoCard icon={<CalendarDays size={16} />} title="Встреча">
              {title}
            </InfoCard>
            <InfoCard icon={<Users size={16} />} title="Участники">
              {participants.length}
            </InfoCard>
            <InfoCard icon={<Info size={16} />} title="Статус">
              {statusLabel}
            </InfoCard>
            <div style={{ display: 'grid', gap: 10 }}>
              {canShareLink ? (
                <button type="button" onClick={onCopyLink} style={infoButtonStyle}>
                  <Copy size={15} />
                  <span>Скопировать ссылку</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={onOpenCalendar}
                style={secondaryInfoButtonStyle}
              >
                <CalendarDays size={15} />
                <span>Вернуться в календарь</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function InfoCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 14,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {icon}
        <span>{title}</span>
      </div>
      <div style={{ marginTop: 10, color: '#F8FAFC', fontSize: 14, fontWeight: 600 }}>{children}</div>
    </div>
  )
}

const infoButtonStyle = {
  height: 42,
  borderRadius: 14,
  border: 'none',
  background: '#2458D3',
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  cursor: 'pointer',
  fontWeight: 700,
} as const

const secondaryInfoButtonStyle = {
  ...infoButtonStyle,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.08)',
} as const
