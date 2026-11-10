import type { CSSProperties } from 'react'
import MS from '../../../shared/ui/MaterialSymbol'

interface PinnedIconProps {
  size?: number
  color?: string
  style?: CSSProperties
}

export default function PinnedIcon({ size = 16, color = 'currentColor', style }: PinnedIconProps) {
  return <MS name="keep" size={size} color={color} style={style} />
}
