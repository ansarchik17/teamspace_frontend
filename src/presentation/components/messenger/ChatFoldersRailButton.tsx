import type { CSSProperties, ReactNode } from 'react'
import MS from '../../../shared/ui/MaterialSymbol'

export const TELEGRAM_RAIL_WIDTH = 72
export const TELEGRAM_RAIL_BG = '#F0F2F5'

interface ChatFoldersRailButtonProps {
  selected: boolean
  label: string
  icon?: string
  badge?: number
  onClick: () => void
  title?: string
  iconColor?: string
  children?: ReactNode
}

export function ChatFoldersRailButton({
  selected,
  label,
  icon,
  badge = 0,
  onClick,
  title,
  iconColor,
  children,
}: ChatFoldersRailButtonProps) {
  const resolvedIconColor = selected ? '#2458D3' : iconColor ?? '#707579'

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      style={{
        width: '100%',
        border: 'none',
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        padding: '2px 0',
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: 12,
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s ease',
        }}
      >
        {children ?? (icon ? <MS name={icon} size={24} color={resolvedIconColor} /> : null)}
        {badge > 0 ? (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: '#2458D3',
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid #F0F2F5',
            }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: selected ? 600 : 500,
          color: selected ? '#2458D3' : '#707579',
          textAlign: 'center',
          lineHeight: 1.15,
          maxWidth: 64,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {label}
      </span>
    </button>
  )
}
export const telegramRailIconButtonStyle = (active = false): CSSProperties => ({
  width: 44,
  height: 44,
  borderRadius: 12,
  border: 'none',
  background: 'transparent',
  color: active ? '#2458D3' : '#707579',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'color 0.15s ease',
})
