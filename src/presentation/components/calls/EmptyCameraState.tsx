interface EmptyCameraStateProps {
  initials: string
  accentColor: string
  size?: 'compact' | 'regular' | 'hero'
  label?: string
}

export default function EmptyCameraState({
  initials,
  size = 'regular',
}: EmptyCameraStateProps) {
  const compact = size === 'compact'
  const hero = size === 'hero'
  const avatarSize = compact ? 52 : hero ? 122 : 88
  const avatarFontSize = compact ? 20 : hero ? 42 : 34

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 45%, #2d3643 0%, #1d252f 70%, #192029 100%)',
      }}
    >
      <div
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #394453, #283340)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          fontSize: avatarFontSize,
          fontWeight: 500,
          letterSpacing: '0.02em',
          userSelect: 'none',
          flexShrink: 0,
          boxShadow: '0 14px 32px rgba(14, 22, 28, 0.18)',
        }}
      >
        {initials}
      </div>
    </div>
  )
}
