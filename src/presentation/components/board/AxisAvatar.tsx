import { useState } from 'react'
import { AXIS_AVATAR_COLORS } from '../../../shared/ui/axisTokens'

interface AxisAvatarProps {
  initials: string
  src?: string
  size?: number
  seed?: number
  title?: string
}

/** Аватар в цветах бренда: фото, а при его отсутствии — инициалы на синем/графитовом фоне */
export default function AxisAvatar({ initials, src, size = 24, seed = 0, title }: AxisAvatarProps) {
  const [failedSrc, setFailedSrc] = useState('')
  const showImage = Boolean(src) && failedSrc !== src
  const color = AXIS_AVATAR_COLORS[Math.abs(seed) % AXIS_AVATAR_COLORS.length]

  return (
    <span
      title={title}
      className="relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: Math.max(9, Math.round(size * 0.38)),
        letterSpacing: '-0.02em',
      }}
    >
      {initials.slice(0, 2)}
      {showImage ? (
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedSrc(src ?? '')}
        />
      ) : null}
    </span>
  )
}
