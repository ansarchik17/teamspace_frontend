import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import AlemAIChat from './AlemAIChat'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'

export default function AlemAiPage() {
  const [searchParams] = useSearchParams()
  const initialPrompt = searchParams.get('prompt') || ''
  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const accessToken = sessionStore.getTokens()?.accessToken || ''

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <AlemAIChat key={initialPrompt} authToken={accessToken} initialPrompt={initialPrompt} />
    </div>
  )
}
