import type { CSSProperties } from 'react'

const CHAT_DOODLE_EMOJIS = ['😊', '⭐', '🌸', '💬', '🎵', '🦋', '🍀', '☀️', '🎈', '🌙', '🐾', '🎨'] as const

const buildChatDoodleSvg = (): string => {
  const tiles = CHAT_DOODLE_EMOJIS.map((emoji, index) => {
    const column = index % 4
    const row = Math.floor(index / 4)
    const x = 24 + column * 96 + (row % 2 === 0 ? 0 : 18)
    const y = 36 + row * 96 + (column % 2 === 0 ? 0 : 14)
    const rotate = ((index * 17) % 28) - 14
    const size = 24 + (index % 3) * 4

    return `<text x="${x}" y="${y}" font-size="${size}" opacity="0.11" fill="#64748B" transform="rotate(${rotate} ${x} ${y})">${emoji}</text>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="0 0 420 420">${tiles}</svg>`
}

const CHAT_DOODLE_PATTERN_URL = `url("data:image/svg+xml,${encodeURIComponent(buildChatDoodleSvg())}")`

export const CHAT_DOODLE_WALLPAPER_STYLE: CSSProperties = {
  backgroundColor: '#E8EEF5',
  backgroundImage: CHAT_DOODLE_PATTERN_URL,
  backgroundSize: '420px 420px',
  backgroundRepeat: 'repeat',
}

export const getDefaultChatCanvasStyle = (): CSSProperties => ({ backgroundColor: '#FFFFFF' })
