import PageHeader from '../../../shared/ui/PageHeader'
import AppButton from '../../../shared/ui/AppButton'
import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function getPrimaryAccessToken(): string | null {
  try {
    const raw = localStorage.getItem('superapp.auth.tokens')
    if (raw) {
      const parsed = JSON.parse(raw) as { accessToken?: unknown }
      const token = typeof parsed?.accessToken === 'string' ? parsed.accessToken.trim() : ''
      if (token) {
        return token
      }
    }
  } catch (e) {
    console.warn('Failed to read primary auth tokens for whiteboard:', e)
  }

  const legacyToken = localStorage.getItem('access_token')
  return legacyToken?.trim() || null
}

function getUserNameFromToken(): string | null {
  try {
    const token = getPrimaryAccessToken()
    if (!token) return null

    const currentLegacyToken = localStorage.getItem('access_token')
    if (currentLegacyToken !== token) {
      localStorage.setItem('access_token', token)
    }

    const payloadPart = token.split('.')[1]
    if (!payloadPart) return null
    
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const jsonPayload = decodeURIComponent(
      window
        .atob(paddedBase64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    const decoded = JSON.parse(jsonPayload)
    
    const firstName = decoded.first_name || decoded.given_name || ''
    const lastName = decoded.last_name || decoded.family_name || ''
    const fullName = `${firstName} ${lastName}`.trim()
    const resolvedName =
      fullName ||
      decoded.name ||
      decoded.preferred_username ||
      decoded.email ||
      decoded.username ||
      decoded.sub ||
      null

    if (resolvedName && localStorage.getItem('username') !== resolvedName) {
      localStorage.setItem('username', resolvedName)
    }

    return resolvedName
  } catch (e) {
    console.warn('Failed to parse token for name:', e)
    return null
  }
}

export default function WhiteboardPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [inputLink, setInputLink] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Получаем имя пользователя из токена и передаем его во фрейм вместе с параметрами (например, room)
  const name = getUserNameFromToken()

  const currentIframeRoomId = useRef<string | null>(null)

  const [iframeSrc, setIframeSrc] = useState(() => {
    const initParams = new URLSearchParams(window.location.search)
    let initRoom = initParams.get('room')
    if (!initRoom) {
      // Проверяем, есть ли сохраненная доска
      const lastRoom = localStorage.getItem('last_whiteboard_room_id')
      if (lastRoom) {
        initRoom = lastRoom
        initParams.set('room', lastRoom)
      }
    }
    if (initRoom) {
      currentIframeRoomId.current = initRoom
    }
    if (name) {
      initParams.set('name', name)
    }
    const initSearch = initParams.toString()
    return initSearch ? `/whiteboard/?${initSearch}` : '/whiteboard/'
  })

  // Редиректим URL родителя на сохраненную доску при первом входе, если в URL нет room
  useEffect(() => {
    const parentParams = new URLSearchParams(location.search)
    const currentParentRoom = parentParams.get('room')

    if (!currentParentRoom) {
      const activeRoom = localStorage.getItem('last_whiteboard_room_id')
      if (activeRoom) {
        parentParams.set('room', activeRoom)
        navigate(`/whiteboard/?${parentParams.toString()}`, { replace: true })
      }
    }
  }, [location.search, navigate])

  // Синхронизируем iframeSrc при смене родительского URL (например, переход по ссылке)
  useEffect(() => {
    const parentParams = new URLSearchParams(location.search)
    const parentRoom = parentParams.get('room')

    if (parentRoom && parentRoom !== currentIframeRoomId.current) {
      currentIframeRoomId.current = parentRoom
      setIsLoading(true)

      const newIframeParams = new URLSearchParams()
      newIframeParams.set('room', parentRoom)
      if (name) {
        newIframeParams.set('name', name)
      }
      setIframeSrc(`/whiteboard/?${newIframeParams.toString()}`)
    }
  }, [location.search, name])

  // Периодически опрашиваем фрейм, чтобы зафиксировать автоматически созданную комнату
  useEffect(() => {
    const checkIframeRoom = () => {
      try {
        if (iframeRef.current && iframeRef.current.contentWindow) {
          const iframeParams = new URLSearchParams(iframeRef.current.contentWindow.location.search)
          const room = iframeParams.get('room')
          if (room) {
            localStorage.setItem('last_whiteboard_room_id', room)
            currentIframeRoomId.current = room

            const parentParams = new URLSearchParams(location.search)
            if (parentParams.get('room') !== room) {
              parentParams.set('room', room)
              navigate(`/whiteboard/?${parentParams.toString()}`, { replace: true })
            }
          }
        }
      } catch (e) {
        // Игнорируем ошибки CORS при редиректах авторизации
      }
    }

    const interval = setInterval(checkIframeRoom, 1000)
    return () => clearInterval(interval)
  }, [location.search, navigate])

  const handleJoinBoard = () => {
    if (!inputLink.trim()) return

    // Регулярное выражение для поиска UUID комнаты (ID доски)
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    const match = inputLink.match(uuidRegex)

    if (match) {
      const roomId = match[0]
      navigate(`/whiteboard/?room=${roomId}`)
      setInputLink('')
      setIsLoading(true) // Показываем спиннер при перезагрузке новой доски
    } else {
      alert('Неверный формат ссылки или ID доски. Пожалуйста, вставьте ссылку на доску или корректный UUID комнаты.')
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: 'calc(100vh - 88px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#FFFFFF',
        borderRadius: '0',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(10, 22, 40, 0.02)',
        border: '1px solid rgba(226, 232, 240, 0.8)',
      }}
    >
      <div className="shrink-0 px-4 pt-6 pb-4 md:px-6 xl:px-8">
        <PageHeader title="Whiteboard" description="Схемы, идеи и совместная работа на одной доске" />
        <div className="ts-toolbar mt-5">
          <label className="ts-toolbar__search">
            <span className="sr-only">Ссылка или ID доски</span>
            <input className="ts-input" placeholder="Вставьте ссылку на доску или ID комнаты…" value={inputLink} onChange={(e) => setInputLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleJoinBoard() }} />
          </label>
          <AppButton disabled={!inputLink.trim()} onClick={handleJoinBoard}>Перейти</AppButton>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', width: '100%' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--ts-bg)',
              gap: '16px',
              fontFamily: 'var(--ts-font)',
              color: '#374C6B',
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '3px solid #E2E8F0',
                borderTopColor: '#2458D3',
                animation: 'spin 1s linear infinite',
              }}
            />
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>Загрузка интерактивной доски...</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="Whiteboard"
          onLoad={() => setIsLoading(false)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          allow="clipboard-write; clipboard-read"
        />
      </div>

    </div>
  )
}
