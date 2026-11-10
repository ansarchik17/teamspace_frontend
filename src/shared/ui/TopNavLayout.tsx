import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useRef, type ReactNode } from 'react'

interface TopNavLayoutProps {
  topNav: ReactNode
  background?: string
  fontFamily?: string
  outletContext?: unknown
}

const sectionOf = (pathname: string) => pathname.split('/').filter(Boolean)[0] ?? ''

export default function TopNavLayout({
  topNav,
  background = 'var(--ts-bg)',
  fontFamily = 'var(--ts-font)',
  outletContext,
}: TopNavLayoutProps) {
  const { pathname } = useLocation()
  const section = sectionOf(pathname)
  const pageRef = useRef<HTMLDivElement>(null)
  const previousSectionRef = useRef(section)

  // Soft fade-in when switching between sections (not on navigation inside a section).
  useEffect(() => {
    if (previousSectionRef.current === section) return
    previousSectionRef.current = section
    const element = pageRef.current
    if (!element || typeof element.animate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    element.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    )
  }, [section])

  return (
    <div className="ts-app-layout" style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background, fontFamily, overflow: 'hidden' }}>
      {topNav}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/*
          Прокрутка здесь, а не на каждой странице: контент растёт по высоте, область под шапкой
          остаётся с фиксированной высотой (100vh − nav), появляется стандартный вертикальный скролл.
        */}
        <div ref={pageRef} data-section={section} className="ts-section flex min-h-0 min-w-0 flex-1 flex-col overflow-auto overscroll-y-contain">
          <Outlet context={outletContext} />
        </div>
      </div>
    </div>
  )
}
