import { useMemo } from 'react'
import type { LiveKitCallParticipant, LiveKitCallState } from '../../calls/types'
import CallParticipantTile from './CallParticipantTile'

interface CallVideoGridProps {
  call: LiveKitCallState
  participants: LiveKitCallParticipant[]
  accentColor: string
  isMinimized?: boolean
}

const getGridColumns = (count: number): string =>
  count <= 1 ? 'minmax(0, 1fr)' : `repeat(${count <= 4 ? 2 : count <= 9 ? 3 : 4}, minmax(0, 1fr))`

export default function CallVideoGrid({
  call,
  participants,
  accentColor,
  isMinimized = false,
}: CallVideoGridProps) {
  const orderedParticipants = useMemo(
    () =>
      participants.slice().sort((left, right) => {
        // SID is assigned for the participant's room session and does not change
        // when LiveKit updates speaking state or participant metadata.
        if (left.isLocal !== right.isLocal) return left.isLocal ? 1 : -1
        return left.sid.localeCompare(right.sid)
      }),
    [participants],
  )

  const count = orderedParticipants.length
  const isWaiting =
    !isMinimized &&
    count <= 1 &&
    (call.phase === 'connecting' || call.phase === 'ringing' || !call.roomConnected)

  return (
    <>
      <div
        className="call-video-grid"
        data-count={count}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: getGridColumns(count),
          gridAutoRows: count <= 1 ? 'minmax(0, 1fr)' : 'minmax(160px, 1fr)',
          gap: isMinimized ? 6 : 8,
          padding: isMinimized ? 4 : 10,
          overflowY: 'auto',
          alignContent: count === 1 ? 'center' : 'stretch',
          background: '#11161d',
        }}
      >
        {orderedParticipants.map((participant) => (
          <div
            key={participant.sid}
            style={{
              minHeight: isMinimized ? 100 : count === 1 ? 0 : 160,
              maxWidth: count === 1 ? 'min(100%, 1200px)' : 'none',
              width: '100%',
              justifySelf: count === 1 ? 'center' : 'stretch',
              aspectRatio: count === 1 ? '16 / 9' : undefined,
            }}
          >
            <CallParticipantTile
              participant={participant}
              accentColor={accentColor}
              isCompact={isMinimized}
              spotlight={count === 1}
            />
          </div>
        ))}
      </div>
      {isWaiting ? <WaitingBadge connecting={call.phase === 'connecting'} /> : null}
    </>
  )
}

function WaitingBadge({ connecting }: { connecting: boolean }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 15,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        borderRadius: 999,
        padding: '10px 16px',
        background: 'rgba(22, 28, 37, 0.92)',
        border: '1px solid rgba(255,255,255,0.06)',
        color: '#E8EAED',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: connecting ? '#8AB4F8' : '#F9AB00',
          animation: 'call-wait-pulse 1.2s ease-in-out infinite',
        }}
      />
      <span style={{ fontSize: 13, fontWeight: 600 }}>
        {connecting ? 'Подключение к встрече...' : 'Ожидаем других участников...'}
      </span>
      <style>{`
        @keyframes call-wait-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  )
}
