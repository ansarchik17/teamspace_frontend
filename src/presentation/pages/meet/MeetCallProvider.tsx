import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { MeetCallContext, type ActiveMeetCall } from './meetCallShared'
import MeetRoom from './MeetRoom'
import './meet.css'

export default function MeetCallProvider({
  children,
  onLeave,
}: {
  children: ReactNode
  onLeave?: () => void
}) {
  const navigate = useNavigate()
  const [activeCall, setActiveCall] = useState<ActiveMeetCall | null>(null)
  const activeRef = useRef<ActiveMeetCall | null>(null)
  const [restoreVersion, setRestoreVersion] = useState(0)
  const start = useCallback((call: ActiveMeetCall) => {
    if (activeRef.current)
      throw new Error('Сначала завершите текущую встречу Meet.')
    activeRef.current = call
    setActiveCall(call)
  }, [])
  const restore = useCallback(() => {
    setRestoreVersion((value) => value + 1)
    if (activeRef.current)
      navigate(`/meet/${activeRef.current.session.meeting_id}`)
  }, [navigate])
  const value = useMemo(
    () => ({ activeCall, start, restore, restoreVersion }),
    [activeCall, start, restore, restoreVersion],
  )
  return (
    <MeetCallContext.Provider value={value}>
      {children}
      {activeCall && (
        <MeetRoom
          key={activeCall.session.meeting_id}
          {...activeCall}
          restoreVersion={restoreVersion}
          onLeave={() => {
            activeRef.current = null
            setActiveCall(null)
            if (onLeave) onLeave()
            else navigate('/meet')
          }}
        />
      )}
    </MeetCallContext.Provider>
  )
}
