import { useEffect, useMemo, useRef } from 'react'
import { AudioLines, Mic, MicOff, MonitorUp, VideoOff } from 'lucide-react'
import type { LiveKitCallParticipant } from '../../calls/types'
import EmptyCameraState from './EmptyCameraState'

interface CallParticipantTileProps {
  participant: LiveKitCallParticipant
  accentColor: string
  isCompact?: boolean
  spotlight?: boolean
  isFloatingSelfView?: boolean
}

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return '?'
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('')
}

export default function CallParticipantTile({
  participant,
  accentColor,
  isCompact = false,
  spotlight = false,
  isFloatingSelfView = false,
}: CallParticipantTileProps) {
  const mediaHostRef = useRef<HTMLDivElement | null>(null)
  const audioHostRef = useRef<HTMLDivElement | null>(null)
  const initials = useMemo(() => getInitials(participant.name), [participant.name])
  const primaryVideoTrack = participant.screenShareTrack ?? participant.videoTrack

  useEffect(() => {
    const host = mediaHostRef.current
    if (!host) return

    host.innerHTML = ''
    if (!primaryVideoTrack) return

    const element = primaryVideoTrack.attach()
    element.style.width = '100%'
    element.style.height = '100%'
    element.style.objectFit = 'cover'
    element.style.borderRadius = 'inherit'
    if (participant.isLocal && !participant.screenShareTrack) {
      element.style.transform = 'scaleX(-1)'
    }
    host.appendChild(element)

    return () => {
      primaryVideoTrack.detach(element)
      element.remove()
    }
  }, [participant.isLocal, participant.screenShareTrack, primaryVideoTrack])

  useEffect(() => {
    const host = audioHostRef.current
    if (!host) return

    host.innerHTML = ''
    if (!participant.audioTrack || participant.isLocal) return

    const element = participant.audioTrack.attach()
    element.autoplay = true
    host.appendChild(element)

    return () => {
      participant.audioTrack?.detach(element)
      element.remove()
    }
  }, [participant.audioTrack, participant.isLocal])

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        minHeight: isCompact ? 100 : spotlight ? 260 : 160,
        borderRadius: isCompact ? 8 : 10,
        overflow: 'hidden',
        background: '#202832',
        border: participant.isSpeaking ? '2px solid #348dff' : '2px solid transparent',
        boxShadow: participant.isSpeaking ? 'inset 0 0 0 1px rgba(52,141,255,.35)' : isFloatingSelfView ? '0 12px 28px rgba(0,0,0,.2)' : 'none',
        transition: 'border-color 160ms ease',
      }}
    >
      <div
        ref={mediaHostRef}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          overflow: 'hidden',
          background: '#202832',
        }}
      />

      {!primaryVideoTrack ? (
        <EmptyCameraState
          initials={initials}
          accentColor={accentColor}
          size={isCompact ? 'compact' : spotlight ? 'hero' : 'regular'}
          label={participant.name}
        />
      ) : null}

      <div ref={audioHostRef} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />

      <div
        style={{
          position: 'absolute',
          inset: 'auto 0 0 0',
          height: 72,
          background: 'linear-gradient(180deg, transparent, rgba(8, 12, 18, .42))',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 10,
          bottom: 9,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: 'calc(100% - 60px)',
          color: '#FFFFFF',
          background: 'rgba(14, 19, 26, .78)',
          borderRadius: 6,
          padding: '6px 9px',
        }}
      >
        <span
          style={{
            fontSize: isCompact ? 11 : 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {participant.name}
          {participant.isLocal ? ' (Вы)' : ''}
        </span>
        {participant.isHandRaised ? <span style={{ color: '#F9AB00', fontSize: 15 }}>✋</span> : null}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {participant.isSpeaking ? (
          <StatusChip active><AudioLines size={15} /></StatusChip>
        ) : null}
        {!participant.isMicrophoneEnabled ? (
          <StatusChip>
            <MicOff size={13} />
          </StatusChip>
        ) : !participant.isSpeaking ? <StatusChip><Mic size={13} /></StatusChip> : null}
        {!participant.isCameraEnabled ? (
          <StatusChip>
            <VideoOff size={13} />
          </StatusChip>
        ) : null}
        {participant.screenShareTrack ? (
          <StatusChip active>
            <MonitorUp size={13} />
          </StatusChip>
        ) : null}
      </div>
    </div>
  )
}

function StatusChip({
  children,
  active = false,
}: {
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <span
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: active ? 'rgba(16, 28, 48, .92)' : 'rgba(16,18,20,0.72)',
        color: active ? '#4099ff' : '#FFFFFF',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {children}
    </span>
  )
}
