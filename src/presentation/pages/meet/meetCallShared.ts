import { createContext, useContext } from 'react'
import type { MeetSession } from '../../../infrastructure/meet/meetApi'

export interface ActiveMeetCall {
  session: MeetSession
  title: string
  microphone: boolean
  camera: boolean
  guest?: boolean
}

export const MeetCallContext = createContext<{
  activeCall: ActiveMeetCall | null
  start: (call: ActiveMeetCall) => void
  restore: () => void
  restoreVersion: number
} | null>(null)

export function useMeetCall() {
  const context = useContext(MeetCallContext)
  if (!context) throw new Error('MeetCallProvider is missing')
  return context
}
