import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { clampMeetPosition, copyMeetStyles } from './meetWindowUtils'
import meetingCss from './meet.css?inline'

interface PipApi {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>
}
type PipWindow = Window & { documentPictureInPicture?: PipApi }
type Mode = 'full' | 'mini' | 'pip'

export default function useMeetWindow(
  meetingId: string,
  connected: boolean,
  restoreVersion: number,
  guest = false,
) {
  // Keep a single portal target: moving it between documents preserves media and React state.
  const hostRef = useRef<HTMLDivElement | null>(null)
  if (!hostRef.current) hostRef.current = document.createElement('div')
  const host = hostRef.current
  const [mode, setMode] = useState<Mode>('full')
  const [position, setPosition] = useState({
    left: Math.max(0, window.innerWidth - 420),
    top: Math.max(0, window.innerHeight - 360),
  })
  const [message, setMessage] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const pipRef = useRef<Window | null>(null)
  const pendingRef = useRef(false)
  const generation = useRef(0)
  const modeRef = useRef(mode)
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    left: number
    top: number
  } | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const meetingPath = `/meet/${meetingId}`
  const backgroundPath = guest ? meetingPath : '/meet'
  const pathnameRef = useRef(location.pathname)
  pathnameRef.current = location.pathname
  const canPip = Boolean((window as PipWindow).documentPictureInPicture)

  useLayoutEffect(() => {
    document.body.appendChild(host)
    return () => {
      generation.current += 1
      const pip = pipRef.current
      pipRef.current = null
      pip?.close()
      host.remove()
    }
  }, [host])
  useLayoutEffect(() => {
    modeRef.current = mode
    const surface = hostRef.current
    if (!surface) return
    surface.className = `meet-call-surface meet-call-surface--${mode}`
    surface.style.left = mode === 'mini' ? `${position.left}px` : ''
    surface.style.top = mode === 'mini' ? `${position.top}px` : ''
  }, [host, mode, position])

  const closePip = useCallback(() => {
    generation.current += 1
    const pip = pipRef.current
    pipRef.current = null
    document.body.appendChild(host)
    pip?.close()
  }, [host])
  const changeMode = useCallback((next: Mode) => {
    modeRef.current = next
    setMode(next)
  }, [])
  const restore = useCallback(() => {
    closePip()
    changeMode('full')
    setMessage('')
    window.focus()
    navigate(meetingPath)
  }, [changeMode, closePip, meetingPath, navigate])

  const openWindow = useCallback(
    async (automatic = false, leaveMeetingRoute = false) => {
      // There is only one floating meeting, including across route/tab changes.
      if (pendingRef.current || pipRef.current) return
      const fallback = (text: string) => {
        changeMode('mini')
        setMessage(text)
        if (leaveMeetingRoute && pathnameRef.current === meetingPath)
          navigate(backgroundPath)
      }
      const api = (window as PipWindow).documentPictureInPicture
      if (!api) {
        if (!automatic)
          fallback(
            'Этот браузер поддерживает окно встречи только внутри Workspace.',
          )
        return
      }
      if (document.fullscreenElement === host)
        void document.exitFullscreen().catch(() => undefined)
      pendingRef.current = true
      const requestGeneration = generation.current
      try {
        // Request before awaiting anything: the button/route click supplies activation.
        const pip = await api.requestWindow({ width: 400, height: 340 })
        if (generation.current !== requestGeneration) {
          pip.close()
          return
        }
        pipRef.current = pip
        copyMeetStyles(document, pip.document, meetingCss)
        pip.document.title = 'Meet · UniteSpace'
        pip.document.body.appendChild(host)
        changeMode('pip')
        setMessage('')
        pip.addEventListener(
          'pagehide',
          () => {
            if (pipRef.current !== pip) return
            pipRef.current = null
            document.body.appendChild(host)
            // Closing the system window restores the meeting, not a second mini-window.
            changeMode('full')
            navigate(meetingPath)
          },
          { once: true },
        )
        if (leaveMeetingRoute && pathnameRef.current === meetingPath)
          navigate(backgroundPath)
      } catch {
        if (generation.current !== requestGeneration) return
        closePip()
        if (!automatic)
          fallback(
            'Браузер не разрешил отдельное окно. Встреча остаётся внутри Workspace; повторите сворачивание из встречи.',
          )
      } finally {
        pendingRef.current = false
      }
    },
    [backgroundPath, changeMode, closePip, host, meetingPath, navigate],
  )
  const minimize = useCallback(() => openWindow(false, true), [openWindow])

  const visitedMeetingRoute = useRef(location.pathname === meetingPath)
  useEffect(() => {
    if (location.pathname === meetingPath) visitedMeetingRoute.current = true
    else if (visitedMeetingRoute.current && modeRef.current === 'full') {
      void openWindow()
    }
  }, [location.pathname, meetingPath, openWindow])
  const lastRestoreVersion = useRef(restoreVersion)
  useEffect(() => {
    if (lastRestoreVersion.current !== restoreVersion) {
      lastRestoreVersion.current = restoreVersion
      restore()
    }
  }, [restoreVersion, restore])

  useEffect(() => {
    if (!connected || !canPip || !navigator.mediaSession) return
    const mediaSession = navigator.mediaSession as unknown as {
      setActionHandler: (action: string, handler: (() => void) | null) => void
    }
    try {
      mediaSession.setActionHandler(
        'enterpictureinpicture',
        () => void openWindow(true),
      )
    } catch {
      return
    }
    return () => {
      try {
        mediaSession.setActionHandler('enterpictureinpicture', null)
      } catch {
        /* Unsupported browser action. */
      }
    }
  }, [canPip, connected, openWindow])

  useEffect(() => {
    if (mode !== 'mini') return
    const clamp = () => {
      const rect = host.getBoundingClientRect()
      setPosition((value) => {
        const next = clampMeetPosition(
          value.left,
          value.top,
          rect.width,
          rect.height,
          window.innerWidth,
          window.innerHeight,
        )
        return next.left === value.left && next.top === value.top ? value : next
      })
    }
    const observer = new ResizeObserver(clamp)
    observer.observe(host)
    window.addEventListener('resize', clamp)
    clamp()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', clamp)
    }
  }, [host, mode])

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === host)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [host])
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === host) await document.exitFullscreen()
      else await host.requestFullscreen()
    } catch {
      setMessage('Браузер не разрешил полноэкранный режим.')
    }
  }
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (
      mode !== 'mini' ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest('button')
    )
      return
    const rect = host.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const rect = host.getBoundingClientRect()
    setPosition(
      clampMeetPosition(
        drag.left + event.clientX - drag.x,
        drag.top + event.clientY - drag.y,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight,
      ),
    )
  }
  const onPointerUp = () => {
    dragRef.current = null
  }
  return {
    host,
    mode,
    compact: mode !== 'full',
    message,
    fullscreen,
    minimize,
    restore,
    toggleFullscreen,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: onPointerUp,
    },
  }
}
