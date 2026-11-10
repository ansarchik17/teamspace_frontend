import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatReaction } from '../../../domain/entities/Chat'
import MS from '../../../shared/ui/MaterialSymbol'
import { C } from '../../pages/dashboard/model/constants'
import EmojiGlyph from './EmojiGlyph'
import MessengerAvatar from './MessengerAvatar'
import type { MessageView } from './types'
import { formatRecordingDuration, hasVoiceMarker, getFileExtension, iconByExtension } from './utils'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { authorizedFetch } from '../../../infrastructure/http/authorizedFetch'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'
import { SmartAgentWidgetRenderer } from './SmartAgentWidgetRenderer'
import { SmartAgentTable } from '../../pages/alemai/smart-agent/components/SmartAgentTable'
import type { SmartAgentWidget } from '../../pages/alemai/smart-agent/types'
import { preprocessAndExtractTables, parseSourcesFromText, SmartAgentSourceFiles } from '../../pages/alemai/smart-agent/utils'
import { mt } from './messengerText'


const authSessionStore = new LocalStorageAuthSessionStore()

const isFallbackCaption = (text: string | null | undefined, type: string): boolean => {
  if (!text) return true
  const trimmed = text.trim()
  if (type === 'image' && trimmed === mt('messageBubble.t00')) return true
  if (type === 'video' && trimmed === mt('messageBubble.t01')) return true
  if (type === 'file' && trimmed === mt('messageBubble.t02')) return true
  if (type === 'audio' && trimmed === mt('messageBubble.t03')) return true
  if (type === 'voice' && trimmed === mt('messageBubble.t04')) return true
  if (type === 'video_message' && trimmed === mt('messageBubble.t05')) return true
  return false
}

export const MESSENGER_OPEN_USER_CHAT_EVENT = 'messenger:open-user-chat'
const CHAT_FONT_STACK = '"Manrope", sans-serif'
const IOS_BUBBLE_RADIUS_OUTGOING = '12px'
const IOS_BUBBLE_RADIUS_INCOMING = '12px'
const IOS_INCOMING_BG = '#E4E7ED'
const DEFAULT_THEME_OUTGOING_HEX = '#DBEAFF'
const DEFAULT_OUTGOING_GRADIENT_START = '#2458D3'
const DEFAULT_OUTGOING_GRADIENT_END = '#0D47A1'
const EMOJI_TOKEN_SOURCE = String.raw`\p{Regional_Indicator}{2}|(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\p{Emoji_Modifier})?)*)`
const EMOJI_SPLIT_REGEX = new RegExp(`(${EMOJI_TOKEN_SOURCE})`, 'gu')
const EMOJI_EXACT_REGEX = new RegExp(`^${EMOJI_TOKEN_SOURCE}$`, 'u')

const getMessageStatusIcon = (status: MessageView['status']) => status === 'sent' ? 'done' : 'done_all'
const getMessageStatusColor = (status: MessageView['status'], onDark = true) =>
  status === 'read' ? (onDark ? '#7FD4FF' : '#0161FF') : onDark ? 'rgba(255,255,255,0.72)' : '#8A94A6'

function QuotedMessage({ replyTo, isMe, outgoingPalette, onNavigate }: { replyTo: NonNullable<MessageView['replyTo']>; isMe: boolean; outgoingPalette: ReturnType<typeof buildOutgoingPalette>; onNavigate?: () => void }) {
  return (
    <button
      type="button"
      onClick={onNavigate}
      aria-label={mt('bubble.goToReply', { name: replyTo.senderFullName })}
      style={{
        display: 'block',
        width: '100%',
        marginBottom: 6,
        padding: '5px 9px',
        borderTop: 0,
        borderRight: 0,
        borderBottom: 0,
        borderLeft: `3px solid ${isMe ? 'rgba(255,255,255,0.6)' : C.blue}`,
        borderRadius: 6,
        background: isMe ? 'rgba(255,255,255,0.14)' : 'rgba(44,140,255,0.08)',
        textAlign: 'left',
        cursor: onNavigate ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: isMe ? outgoingPalette.accent : C.blue,
          marginBottom: 2,
          fontFamily: CHAT_FONT_STACK,
        }}
      >
        {replyTo.senderFullName}
      </div>
      <div
        style={{
          fontSize: 12,
          color: isMe ? outgoingPalette.textMuted : C.inkMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 220,
          fontFamily: CHAT_FONT_STACK,
        }}
      >
        {replyTo.attachmentUrl ? `📎 ${replyTo.attachmentType ?? mt('messageBubble.t02')}` : replyTo.content}
      </div>
    </button>
  )
}

function ForwardedMeta({ msg, isMe, outgoingPalette }: { msg: MessageView; isMe: boolean; outgoingPalette: ReturnType<typeof buildOutgoingPalette> }) {
  if (!msg.raw.isForwarded) {
    return null
  }

  const originLabel = msg.raw.originalSenderFullName?.trim() || mt('messageBubble.t06')
  const background = isMe ? 'rgba(255,255,255,0.94)' : '#EEF5FF'
  const borderColor = isMe ? withAlpha(outgoingPalette.solid, 0.3) : 'rgba(44,140,255,0.18)'
  const accentColor = isMe ? outgoingPalette.solid : C.blue
  const shadowColor = isMe ? withAlpha(outgoingPalette.solid, 0.14) : 'rgba(44,140,255,0.08)'

  const originalSenderId = msg.raw.originalSenderId
  const canOpenSender = typeof originalSenderId === 'number' && originalSenderId > 0

  return (
    <div
      role={canOpenSender ? 'button' : undefined}
      tabIndex={canOpenSender ? 0 : undefined}
      title={canOpenSender ? mt('messageBubble.t07') : undefined}
      onClick={canOpenSender ? (event) => {
        event.stopPropagation()
        window.dispatchEvent(new CustomEvent<number>(MESSENGER_OPEN_USER_CHAT_EVENT, { detail: originalSenderId }))
      } : undefined}
      onKeyDown={canOpenSender ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          window.dispatchEvent(new CustomEvent<number>(MESSENGER_OPEN_USER_CHAT_EVENT, { detail: originalSenderId }))
        }
      } : undefined}
      style={{
        cursor: canOpenSender ? 'pointer' : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        marginBottom: 6,
        padding: '6px 10px',
        borderRadius: 999,
        background,
        border: `1px solid ${borderColor}`,
        boxShadow: `0 3px 10px ${shadowColor}`,
        fontSize: 12,
        lineHeight: 1.25,
        fontWeight: 700,
        color: accentColor,
        fontFamily: CHAT_FONT_STACK,
        maxWidth: '100%',
        verticalAlign: 'top',
      }}
    >
      <MS name="reply" size={13} color={accentColor} style={{ transform: 'scaleX(-1)' }} />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {mt('bubble.forwardedFrom', { name: originLabel })}
      </span>
    </div>
  )
}

interface MessageBubbleTheme {
  outgoingColorHex?: string | null
}

interface MessageReactionsProps {
  reactions: ChatReaction[]
  isMe: boolean
  onReact: (emoji: string) => void
  onUnreact: (emoji: string) => void
  outgoingPalette: ReturnType<typeof buildOutgoingPalette>
}

function MessageReactions({ reactions, isMe, onReact, onUnreact }: MessageReactionsProps) {
  const [hoveredEmoji, setHoveredEmoji] = useState<string | null>(null)
  if (!reactions || reactions.length === 0) return null

  return (
    <div
      data-no-message-select="true"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 4,
        justifyContent: isMe ? 'flex-end' : 'flex-start',
        paddingLeft: isMe ? 0 : 2,
        paddingRight: isMe ? 2 : 0,
      }}
    >
      {reactions.map((r) => {
        const isActive = r.reacted
        const isHovered = hoveredEmoji === r.reaction
        const tooltipNames = r.users.map((u) => u.fullName).filter(Boolean)
        const tooltipText =
          tooltipNames.length === 0
            ? `${r.count}`
            : tooltipNames.length <= 3
              ? tooltipNames.join(', ')
              : mt('bubble.namesAndMore', { names: tooltipNames.slice(0, 3).join(', '), count: r.count - 3 })

        return (
          <div key={r.reaction} style={{ position: 'relative' }}>
            {isHovered && tooltipText ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '110%',
                  [isMe ? 'right' : 'left']: 0,
                  background: 'rgba(20,28,42,0.92)',
                  color: '#F4F6FB',
                  fontSize: 11,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  borderRadius: 8,
                  padding: '5px 8px',
                  whiteSpace: 'nowrap',
                  maxWidth: 200,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  pointerEvents: 'none',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
                  fontFamily: '"Manrope", sans-serif',
                }}
              >
                {tooltipText}
              </div>
            ) : null}
            <button
              type="button"
              onMouseEnter={() => setHoveredEmoji(r.reaction)}
              onMouseLeave={() => setHoveredEmoji(null)}
              onClick={() => {
                if (isActive) {
                  onUnreact(r.reaction)
                } else {
                  onReact(r.reaction)
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '3px 7px',
                borderRadius: 999,
                border: isActive ? '1.5px solid #4C9EFF' : '1.5px solid rgba(10,22,40,0.12)',
                background: isActive ? 'rgba(76,158,255,0.12)' : 'rgba(255,255,255,0.92)',
                cursor: 'pointer',
                fontFamily: '"Manrope", sans-serif',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? '#1F7BFF' : C.inkMuted,
                lineHeight: 1,
                transition: 'background 0.14s ease, border-color 0.14s ease, transform 0.1s ease',
                boxShadow: isActive ? '0 2px 8px rgba(76,158,255,0.18)' : 'none',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{r.reaction}</span>
              <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', minWidth: r.count >= 10 ? 16 : 10 }}>{r.count}</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

const normalizeHexColor = (value: string | null | undefined): string | null => {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }

  return null
}

const hexToRgb = (value: string): [number, number, number] | null => {
  const normalized = normalizeHexColor(value)
  if (!normalized) {
    return null
  }

  const parsed = Number.parseInt(normalized.slice(1), 16)
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255]
}

const withAlpha = (value: string, alpha: number): string => {
  const rgb = hexToRgb(value)
  if (!rgb) {
    return `rgba(47, 75, 226, ${alpha})`
  }

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

const mixHex = (value: string, target: string, ratio: number): string => {
  const fromRgb = hexToRgb(value)
  const toRgb = hexToRgb(target)

  if (!fromRgb || !toRgb) {
    return value
  }

  const mixed = fromRgb.map((channel, index) => Math.round(channel + (toRgb[index] - channel) * ratio))
  return `#${mixed.map((item) => item.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

const isDarkColor = (value: string): boolean => {
  const rgb = hexToRgb(value)
  if (!rgb) {
    return true
  }

  const [r, g, b] = rgb
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance < 0.58
}

interface MessagePalette {
  solid: string
  gradient: string
  gradientEnd: string
  gradientStart: string
  soft: string
  softStrong: string
  border: string
  shadow: string
  text: string
  textMuted: string
  badgeBg: string
  badgeText: string
  accent: string
}

let activeMessageMedia: HTMLMediaElement | null = null

function claimExclusivePlayback(media: HTMLMediaElement) {
  if (media.muted) {
    return
  }
  if (activeMessageMedia && activeMessageMedia !== media && !activeMessageMedia.paused) {
    activeMessageMedia.pause()
  }
  activeMessageMedia = media
}

function BubbleTail({ isMe, color }: { isMe: boolean; color: string }) {
  return (
    <svg
      aria-hidden="true"
      width={9}
      height={17}
      viewBox="0 0 9 17"
      style={{
        position: 'absolute',
        bottom: -1,
        [isMe ? 'right' : 'left']: -8.5,
        transform: isMe ? undefined : 'scaleX(-1)',
        pointerEvents: 'none',
        display: 'block',
      }}
    >
      <path d="M0 0C0 8.2 2.6 13.6 9 17H0V0Z" fill={color} />
    </svg>
  )
}

function buildOutgoingPalette(value?: string | null): MessagePalette {
  const normalized = normalizeHexColor(value)
  const themed = normalized && ![DEFAULT_THEME_OUTGOING_HEX, '#0161FF', '#1554F6', '#2481CC', DEFAULT_OUTGOING_GRADIENT_START].includes(normalized.toUpperCase()) ? normalized : null
  const base = themed ?? DEFAULT_OUTGOING_GRADIENT_START
  const gradientEnd = themed ? mixHex(themed, '#000000', 0.22) : DEFAULT_OUTGOING_GRADIENT_END
  const isDark = isDarkColor(base)

  return {
    solid: base,
    gradient: `linear-gradient(135deg, ${base} 0%, ${gradientEnd} 100%)`,
    gradientEnd,
    gradientStart: mixHex(base, '#FFFFFF', 0.08),
    soft: withAlpha(base, 0.14),
    softStrong: withAlpha(base, 0.18),
    border: withAlpha(base, 0.2),
    shadow: withAlpha(base, 0.26),
    text: isDark ? '#FFFFFF' : '#102033',
    textMuted: isDark ? 'rgba(255,255,255,0.82)' : 'rgba(16,32,51,0.72)',
    badgeBg: isDark ? 'rgba(255,255,255,0.14)' : withAlpha(base, 0.14),
    badgeText: isDark ? '#FFFFFF' : base,
    accent: isDark ? '#FFFFFF' : base,
  }
}

const isEmojiToken = (value: string): boolean => EMOJI_EXACT_REGEX.test(value)

const isEmojiOnlyText = (value: string): boolean => {
  const compact = value.replace(/\s+/g, '')
  if (!compact) {
    return false
  }

  return compact.replace(new RegExp(EMOJI_TOKEN_SOURCE, 'gu'), '').length === 0
}

const renderTaggedText = (
  text: string,
  msgId: string,
  isMe: boolean,
  outgoingPalette: MessagePalette,
  emojiOnlyMessage = false,
) => {
  const emojiSize = emojiOnlyMessage ? 30 : 22
  const lines = text.split('\n')

  return lines.map((line, lineIndex) => {
    const parts = line.split(/(https?:\/\/[^\s]+|alem\.me\/[a-zA-Z0-9._-]+|@[a-zA-Z0-9._-]+)/g)

    return (
      <span key={`${msgId}-line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          if (!part) {
            return null
          }

          if (/^@[a-zA-Z0-9._-]+$/.test(part)) {
            return (
              <Link
                key={`${msgId}-part-${lineIndex}-${partIndex}`}
                to={`/messenger/${part}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-block',
                  padding: '0 3px',
                  margin: '0 1px',
                  borderRadius: 5,
                  background: isMe ? outgoingPalette.badgeBg : 'rgba(76,158,255,0.12)',
                  color: isMe ? outgoingPalette.text : '#2C8CFF',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  textShadow: isMe ? '0 1px 0 rgba(10,22,40,0.08)' : 'none',
                  fontFamily: CHAT_FONT_STACK,
                  textDecoration: 'none',
                }}
              >
                {part}
              </Link>
            )
          }

          if (/^(https?:\/\/[^\s]+|alem\.me\/[a-zA-Z0-9._-]+)$/.test(part)) {
            const url = part.startsWith('alem.me/') ? `https://${part}` : part
            const isInternal =
              part.startsWith('alem.me/') || part.startsWith('https://alem.me/') || part.startsWith('http://alem.me/')

            if (isInternal) {
              const usernameParts = part.split('alem.me/')
              const username = usernameParts[1]?.replace(/\/$/, '')
              if (username) {
                return (
                  <Link
                    key={`${msgId}-part-${lineIndex}-${partIndex}`}
                    to={`/messenger/@${username}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: isMe ? outgoingPalette.text : '#2C8CFF',
                      textDecoration: 'underline',
                      wordBreak: 'break-all',
                    }}
                  >
                    {part}
                  </Link>
                )
              }
            }

            return (
              <a
                key={`${msgId}-part-${lineIndex}-${partIndex}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  color: isMe ? outgoingPalette.text : '#2C8CFF',
                  textDecoration: 'underline',
                  wordBreak: 'break-all',
                }}
              >
                {part}
              </a>
            )
          }

          const emojiSegments = part.split(EMOJI_SPLIT_REGEX)

          return (
            <span key={`${msgId}-part-${lineIndex}-${partIndex}`}>
              {emojiSegments.map((segment, segmentIndex) => {
                if (!segment) {
                  return null
                }

                if (isEmojiToken(segment)) {
                  return (
                    <span
                      key={`${msgId}-emoji-${lineIndex}-${partIndex}-${segmentIndex}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        verticalAlign: emojiOnlyMessage ? '-0.16em' : '-0.24em',
                        margin: emojiOnlyMessage ? '0 1px' : '0 0.02em',
                      }}
                    >
                      <EmojiGlyph emoji={segment} size={emojiSize} />
                    </span>
                  )
                }

                return <span key={`${msgId}-text-${lineIndex}-${partIndex}-${segmentIndex}`}>{segment}</span>
              })}
            </span>
          )
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    )
  })
}

const formatAttachmentSize = (value?: number): string | null => {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return null
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`
}

const openAuthenticatedAttachment = async (url: string, filename: string) => {
  const response = await authorizedFetch(authSessionStore, url)
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.download = filename || 'attachment'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

const resolveAttachmentIconName = (icon: NonNullable<MessageView['attachment']>['icon']): string => {
  switch (icon) {
    case 'image':
      return 'image'
    case 'video':
      return 'videocam'
    case 'audio':
      return 'audiotrack'
    case 'pdf':
      return 'picture_as_pdf'
    case 'word':
      return 'description'
    case 'excel':
      return 'table_chart'
    case 'presentation':
      return 'slideshow'
    case 'text':
      return 'notes'
    case 'archive':
      return 'folder_zip'
    default:
      return 'insert_drive_file'
  }
}

const parseJsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value) {
    return null
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const readFirstString = (records: Array<Record<string, unknown> | null>, keys: string[]): string | null => {
  for (const record of records) {
    if (!record) {
      continue
    }

    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return null
}

const readFirstNumber = (records: Array<Record<string, unknown> | null>, keys: string[]): number | null => {
  for (const record of records) {
    if (!record) {
      continue
    }

    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return value
      }

      if (typeof value === 'string') {
        const normalized = Number(value)
        if (Number.isFinite(normalized) && normalized >= 0) {
          return normalized
        }
      }
    }
  }

  return null
}

const normalizeCallDirection = (value: string | null | undefined): 'incoming' | 'outgoing' | null => {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (
    normalized.includes('outgoing') ||
    normalized.includes('outbound') ||
    normalized.includes('исход') || // i18n-ignore
    normalized === 'out'
  ) {
    return 'outgoing'
  }

  if (
    normalized.includes('incoming') ||
    normalized.includes('inbound') ||
    normalized.includes('вход') || // i18n-ignore
    normalized === 'in'
  ) {
    return 'incoming'
  }

  return null
}

const normalizeCallStatus = (value: string | null | undefined): string | null => {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return normalized || null
}

const formatCallDurationLabel = (totalSeconds: number): string => {
  if (totalSeconds < 60) {
    return mt('duration.s', { s: totalSeconds })
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return seconds > 0 ? mt('duration.hms', { h: hours, m: minutes, s: seconds }) : mt('duration.hm', { h: hours, m: minutes })
  }

  if (seconds > 0) {
    return mt('duration.ms', { m: minutes, s: seconds })
  }

  return mt('duration.m', { m: minutes })
}

function CallSummaryBubble({ msg, showSenderLabel, theme, onReact, onUnreact }: { msg: MessageView; showSenderLabel: boolean; theme?: MessageBubbleTheme; onReact?: (messageId: string, emoji: string) => void; onUnreact?: (messageId: string, emoji: string) => void }) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const payloads = [parseJsonRecord(msg.raw.metadata), parseJsonRecord(msg.raw.content)]
  const rawBlob = `${msg.raw.metadata ?? ''} ${msg.raw.content ?? ''} ${msg.text}`.toLowerCase()
  const durationMatch = rawBlob.match(/(\d+)\s*(сек|секунд|sec|secs|second|seconds|с)\b/) // i18n-ignore
  const inferredDirection =
    normalizeCallDirection(readFirstString(payloads, ['direction', 'call_direction', 'callDirection', 'kind'])) ??
    normalizeCallDirection(rawBlob) ??
    (isMe ? 'outgoing' : 'incoming')
  const normalizedStatus = normalizeCallStatus(readFirstString(payloads, ['status', 'call_status', 'callStatus', 'state'])) ?? normalizeCallStatus(rawBlob)
  const durationSeconds =
    readFirstNumber(payloads, ['duration_seconds', 'durationSeconds', 'call_duration', 'callDuration', 'duration', 'seconds']) ??
    (durationMatch ? Number(durationMatch[1]) : null) ??
    null

  const isMissed =
    normalizedStatus !== null &&
    ['missed', 'no_answer', 'declined', 'busy', 'canceled', 'cancelled', 'пропущ', 'без ответа', 'отклон', 'занят', 'отмен'].some((marker) => // i18n-ignore
      normalizedStatus.includes(marker),
    )
  const statusLabel =
    normalizedStatus?.includes('missed') || normalizedStatus?.includes('пропущ') // i18n-ignore
      ? mt('bubble.status.missed')
      : normalizedStatus?.includes('no_answer') || normalizedStatus?.includes('без ответа') // i18n-ignore
        ? mt('bubble.status.noAnswer')
        : normalizedStatus?.includes('declined') || normalizedStatus?.includes('отклон') // i18n-ignore
          ? mt('bubble.status.declined')
          : normalizedStatus?.includes('busy') || normalizedStatus?.includes('занят') // i18n-ignore
            ? mt('bubble.status.busy')
            : normalizedStatus?.includes('canceled') || normalizedStatus?.includes('cancelled') || normalizedStatus?.includes('отмен') // i18n-ignore
              ? mt('bubble.status.cancelled')
              : null

  const title = isMissed
    ? inferredDirection === 'incoming'
      ? mt('messageBubble.t19')
      : mt('messageBubble.t20')
    : inferredDirection === 'outgoing'
      ? mt('messageBubble.t21')
      : mt('messageBubble.t22')

  const detailParts = [msg.time]
  if (durationSeconds !== null && durationSeconds > 0) {
    detailParts.push(formatCallDurationLabel(durationSeconds))
  } else if (statusLabel) {
    detailParts.push(statusLabel)
  }

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && showSenderLabel ? (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
        ) : null}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div
          style={{
            width: 'fit-content',
            minWidth: 220,
            maxWidth: 'min(320px, 100%)',
            background: isMe ? outgoingPalette.gradient : IOS_INCOMING_BG,
            color: isMe ? outgoingPalette.text : C.ink,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: '14px 16px 12px',
            boxShadow: isMe ? `0 8px 20px ${withAlpha(outgoingPalette.solid, 0.2)}` : '0 2px 8px rgba(10,22,40,0.06)',
            border: 'none',
            fontFamily: CHAT_FONT_STACK,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1.22,
                  letterSpacing: '-0.01em',
                  color: isMe ? outgoingPalette.text : C.ink,
                }}
              >
                {title}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  color: isMe ? outgoingPalette.textMuted : '#6D7F99',
                  lineHeight: 1.2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <MS
                  name="arrow_upward"
                  size={14}
                  color={isMe ? outgoingPalette.textMuted : '#7B8EA8'}
                  style={{ transform: inferredDirection === 'outgoing' ? 'rotate(45deg)' : 'rotate(-135deg)' }}
                />
                <span>{detailParts.join(', ')}</span>
              </div>
            </div>

            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isMe ? outgoingPalette.badgeBg : 'rgba(123,142,168,0.12)',
                flexShrink: 0,
              }}
            >
              <MS name="videocam" size={18} color={isMe ? outgoingPalette.text : '#6D7F99'} />
            </div>
          </div>
        </div>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

function VoiceMessagePlayer({ msg, showSenderLabel, theme, onReact, onUnreact }: { msg: MessageView; showSenderLabel: boolean; theme?: MessageBubbleTheme; onReact?: (messageId: string, emoji: string) => void; onUnreact?: (messageId: string, emoji: string) => void }) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [waveform, setWaveform] = useState([6, 10, 14, 18, 13, 9, 16, 22, 12, 8, 14, 20, 26, 15, 9, 18, 24, 13, 10, 16, 21, 12, 7, 15, 19, 11, 8, 14])
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const startAnimation = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    stopAnimation()

    const tick = () => {
      setCurrentTime(audio.currentTime)

      if (!audio.paused && !audio.ended) {
        animationFrameRef.current = requestAnimationFrame(tick)
      }
    }

    animationFrameRef.current = requestAnimationFrame(tick)
  }, [stopAnimation])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0)
    }

    const handleEnded = () => {
      stopAnimation()
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handlePause = () => {
      stopAnimation()
      setIsPlaying(false)
      setCurrentTime(audio.currentTime)
    }

    const handlePlay = () => {
      claimExclusivePlayback(audio)
      setIsPlaying(true)
      startAnimation()
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('play', handlePlay)

    return () => {
      stopAnimation()
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('play', handlePlay)
    }
  }, [startAnimation, stopAnimation])

  useEffect(() => {
    if (!msg.audioUrl) {
      return
    }

    const audioUrl = msg.audioUrl
    if (!audioUrl) return

    let cancelled = false
    let currentBlobUrl: string | null = null

    const buildWaveform = async () => {
      try {
        const response = await authorizedFetch(authSessionStore, audioUrl)
        const blob = await response.blob()
        
        if (cancelled) return

        currentBlobUrl = URL.createObjectURL(blob)
        setBlobUrl(currentBlobUrl)

        const arrayBuffer = await blob.arrayBuffer()
        const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

        if (!AudioContextCtor) {
          return
        }

        const audioContext = new AudioContextCtor()
        try {
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
          const channelData = audioBuffer.getChannelData(0)
          const barsCount = 28
          const blockSize = Math.max(1, Math.floor(channelData.length / barsCount))
          const nextWaveform = Array.from({ length: barsCount }, (_, index) => {
            const start = index * blockSize
            const end = Math.min(channelData.length, start + blockSize)
            let peak = 0

            for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
              const amplitude = Math.abs(channelData[sampleIndex])
              if (amplitude > peak) {
                peak = amplitude
              }
            }

            return Math.max(6, Math.round(peak * 24))
          })

          if (!cancelled) {
            setWaveform(nextWaveform)
          }
        } finally {
          void audioContext.close().catch(() => undefined)
        }
      } catch (error) {
        console.error('[VoiceMessagePlayer] Failed to load authenticated audio:', error)
      }
    }

    void buildWaveform()

    return () => {
      cancelled = true
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl)
      }
    }
  }, [msg.audioUrl])

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (audio.paused) {
      void audio.play()
      return
    }

    audio.pause()
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && showSenderLabel ? (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
        ) : null}
        <div
          style={{
            background: isMe ? mixHex(outgoingPalette.solid, '#FFFFFF', 0.82) : IOS_INCOMING_BG,
            color: C.ink,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: '10px 12px 8px',
            boxShadow: isMe ? `0 3px 14px ${withAlpha(outgoingPalette.solid, 0.16)}` : '0 1px 4px rgba(10,22,40,0.07)',
            border: 'none',
            maxWidth: '100%',
            minWidth: 250,
            fontFamily: CHAT_FONT_STACK,
          }}
        >
          {blobUrl ? <audio ref={audioRef} preload="metadata" src={blobUrl} /> : <audio ref={audioRef} preload="metadata" />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={togglePlayback}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                border: 'none',
                background: isMe ? '#FFFFFF' : `${C.blue}14`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 10px rgba(10,22,40,0.08)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <MS name={isPlaying ? 'pause' : 'play_arrow'} size={20} color={isMe ? outgoingPalette.solid : C.blue} style={{ marginLeft: isPlaying ? 0 : 2 }} />
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${waveform.length}, 1fr)`,
                  alignItems: 'center',
                  gap: 3,
                  height: 28,
                }}
              >
                {waveform.map((height, index) => {
                  const threshold = (index + 1) / waveform.length
                  const active = progress >= threshold

                  return (
                    <div
                      key={`${msg.raw.id}-bar-${index}`}
                      style={{
                        height: active ? height + 2 : height,
                        borderRadius: 999,
                        background: active ? (isMe ? outgoingPalette.solid : C.blue) : isMe ? mixHex(outgoingPalette.solid, '#FFFFFF', 0.52) : '#C9D7EA',
                        opacity: active ? 1 : 0.72,
                        transition: 'background 0.12s ease, height 0.12s ease, opacity 0.12s ease',
                      }}
                    />
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: isMe ? outgoingPalette.solid : C.blue, letterSpacing: '-0.004em' }}>
                  {formatRecordingDuration(Math.floor(currentTime))}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.inkMuted }}>
                  <span style={{ fontSize: 11, fontWeight: 400 }}>{duration > 0 ? formatRecordingDuration(Math.floor(duration)) : '--:--'}</span>
                  <span style={{ fontSize: 11, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{msg.time}</span>
                  {isMe ? <MS name={getMessageStatusIcon(msg.status)} size={13} color={getMessageStatusColor(msg.status, false)} /> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

function VideoMessagePlayer({ msg, showSenderLabel, theme, onReact, onUnreact }: { msg: MessageView; showSenderLabel: boolean; theme?: MessageBubbleTheme; onReact?: (messageId: string, emoji: string) => void; onUnreact?: (messageId: string, emoji: string) => void }) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const ringSize = 236
  const ringStroke = 4
  const ringRadius = ringSize / 2 - ringStroke / 2
  const ringCircumference = 2 * Math.PI * ringRadius
  const playbackProgress = duration > 0 ? Math.min(currentTime / duration, 1) : 0
  const ringOffset = ringCircumference * (1 - playbackProgress)

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [])

  const startAnimation = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    stopAnimation()

    const tick = () => {
      setCurrentTime(video.currentTime)

      if (!video.paused && !video.ended) {
        animationFrameRef.current = requestAnimationFrame(tick)
      }
    }

    animationFrameRef.current = requestAnimationFrame(tick)
  }, [stopAnimation])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(video.duration) ? video.duration : 0)
    }

    const handlePlay = () => {
      claimExclusivePlayback(video)
      setIsPlaying(true)
      startAnimation()
    }
    const handlePause = () => {
      stopAnimation()
      setIsPlaying(false)
      setCurrentTime(video.currentTime)
    }
    const handleEnded = () => {
      stopAnimation()
      setIsPlaying(false)
      setCurrentTime(video.duration || 0)
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    let cancelled = false
    let currentBlobUrl: string | null = null

    const videoSource = msg.videoUrl
    const loadVideo = async () => {
      if (!videoSource) return
      try {
        const response = await authorizedFetch(authSessionStore, videoSource)
        const blob = await response.blob()
        
        if (cancelled) return

        currentBlobUrl = URL.createObjectURL(blob)
        setBlobUrl(currentBlobUrl)
      } catch (error) {
        console.error('[VideoMessagePlayer] Failed to load authenticated video:', error)
      }
    }

    void loadVideo()

    return () => {
      cancelled = true
      stopAnimation()
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl)
      }
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [startAnimation, stopAnimation, msg.videoUrl])

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    if (video.paused) {
      void video.play()
      return
    }

    video.pause()
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 10, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && showSenderLabel ? (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
        ) : null}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 6 }}>
          <button
            type="button"
            onClick={togglePlayback}
            style={{
              position: 'relative',
              width: 236,
              height: 236,
              borderRadius: '50%',
              overflow: 'hidden',
              border: `3px solid ${isMe ? mixHex(outgoingPalette.solid, '#FFFFFF', 0.58) : '#E5EDF9'}`,
              background: isMe ? mixHex(outgoingPalette.solid, '#FFFFFF', 0.68) : '#F4F7FC',
              boxShadow: isMe ? `0 10px 22px ${withAlpha(outgoingPalette.solid, 0.18)}` : '0 8px 22px rgba(10,22,40,0.1)',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <video
              ref={videoRef}
              src={blobUrl || undefined}
              preload="metadata"
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
                background: '#C8D7EE',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: isPlaying
                  ? 'linear-gradient(180deg, rgba(10,22,40,0.02) 0%, rgba(10,22,40,0.06) 52%, rgba(10,22,40,0.14) 100%)'
                  : 'linear-gradient(180deg, rgba(10,22,40,0.01) 0%, rgba(10,22,40,0.04) 52%, rgba(10,22,40,0.1) 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  background: isPlaying ? 'rgba(10,22,40,0.24)' : 'rgba(255,255,255,0.86)',
                  color: isPlaying ? '#FFFFFF' : (isMe ? outgoingPalette.solid : C.blue),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isPlaying ? '0 10px 24px rgba(10,22,40,0.18)' : '0 10px 24px rgba(10,22,40,0.12)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <MS name={isPlaying ? 'pause' : 'play_arrow'} size={28} color={isPlaying ? '#FFFFFF' : (isMe ? outgoingPalette.solid : C.blue)} style={{ marginLeft: isPlaying ? 0 : 3 }} />
              </div>
            </div>
            <svg
              viewBox={`0 0 ${ringSize} ${ringSize}`}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                transform: 'rotate(-90deg)',
                pointerEvents: 'none',
              }}
            >
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke={isMe ? withAlpha(outgoingPalette.solid, 0.24) : 'rgba(229,237,249,0.92)'}
                strokeWidth={ringStroke}
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke={isMe ? outgoingPalette.solid : '#1F7BFF'}
                strokeWidth={ringStroke}
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                style={{
                  transition: isPlaying ? 'none' : 'stroke-dashoffset 0.22s ease, opacity 0.18s ease',
                  opacity: playbackProgress > 0 ? 1 : 0.45,
                }}
              />
            </svg>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: C.inkFaint,
              justifyContent: isMe ? 'flex-end' : 'flex-start',
              width: '100%',
              padding: isMe ? '0 6px 0 0' : '0 0 0 6px',
              fontFamily: CHAT_FONT_STACK,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{msg.time}</span>
            {isMe && <MS name={getMessageStatusIcon(msg.status)} size={13} color={getMessageStatusColor(msg.status, false)} />}
          </div>
        </div>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

function VideoAttachmentBubble({
  msg,
  showSenderLabel,
  onOpenVideo,
  theme,
  onReact,
  onUnreact,
}: {
  msg: MessageView
  showSenderLabel: boolean
  onOpenVideo?: (message: MessageView) => void
  theme?: MessageBubbleTheme
  onReact?: (messageId: string, emoji: string) => void
  onUnreact?: (messageId: string, emoji: string) => void
}) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && showSenderLabel ? (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
        ) : null}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div
          style={{
            position: 'relative',
            background: isMe ? outgoingPalette.gradient : IOS_INCOMING_BG,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: 8,
            boxShadow: isMe ? `0 8px 24px ${withAlpha(outgoingPalette.solid, 0.16)}` : '0 8px 24px rgba(10,22,40,0.08)',
            border: 'none',
            fontFamily: CHAT_FONT_STACK,
          }}
        >
          <video
            controls
            preload="metadata"
            playsInline
            src={msg.videoUrl || undefined}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 360,
              maxHeight: 420,
              borderRadius: 16,
              background: '#DCE6F8',
            }}
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpenVideo?.(msg)
            }}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 34,
              height: 34,
              borderRadius: 17,
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'rgba(15,23,42,0.54)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(10,22,40,0.18)',
            }}
            title={mt('messageBubble.t23')}
            aria-label={mt('messageBubble.t23')}
          >
            <MS name="zoom_in" size={18} color="currentColor" />
          </button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              marginTop: 8,
              color: isMe ? outgoingPalette.textMuted : C.inkFaint,
              padding: '0 4px 2px',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{msg.time}</span>
            {isMe ? (
              <MS
                name={getMessageStatusIcon(msg.status)}
                size={13}
                color={getMessageStatusColor(msg.status)}
              />
            ) : null}
          </div>
          {msg.text && !isFallbackCaption(msg.text, msg.kind) && (
            <div
              style={{
                padding: '10px 6px 2px',
                fontSize: 15,
                lineHeight: 1.38,
                fontWeight: 400,
                color: isMe ? outgoingPalette.text : C.ink,
                textAlign: 'left',
                letterSpacing: '-0.008em',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {renderTaggedText(msg.text, msg.raw.id, isMe, outgoingPalette)}
            </div>
          )}
        </div>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

function FileAttachmentBubble({ msg, showSenderLabel, theme, onReact, onUnreact }: { msg: MessageView; showSenderLabel: boolean; theme?: MessageBubbleTheme; onReact?: (messageId: string, emoji: string) => void; onUnreact?: (messageId: string, emoji: string) => void }) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const attachment = msg.attachment
  const [isOpeningAttachment, setIsOpeningAttachment] = useState(false)

  const handleOpenAttachment = useCallback(async () => {
    if (!attachment?.url || isOpeningAttachment) {
      return
    }

    setIsOpeningAttachment(true)
    try {
      await openAuthenticatedAttachment(attachment.url, attachment.filename)
    } catch (error) {
      console.error('[FileAttachmentBubble] Failed to open authenticated attachment:', error)
    } finally {
      setIsOpeningAttachment(false)
    }
  }, [attachment?.filename, attachment?.url, isOpeningAttachment])

  if (!attachment) {
    return null
  }

  const metaParts = [attachment.ext ? attachment.ext.replace('.', '').toUpperCase() : null, formatAttachmentSize(attachment.size)].filter(Boolean)
  const captionText = msg.text?.trim() === attachment.url ? '' : msg.text

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && showSenderLabel ? (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
        ) : null}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => void handleOpenAttachment()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              void handleOpenAttachment()
            }
          }}
          aria-label={mt('bubble.openFile', { name: attachment.filename })}
          style={{
            display: 'block',
            minWidth: 260,
            maxWidth: 360,
            background: isMe ? outgoingPalette.gradient : IOS_INCOMING_BG,
            color: isMe ? outgoingPalette.text : C.ink,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: 14,
            boxShadow: isMe ? `0 12px 30px ${outgoingPalette.shadow}` : '0 8px 22px rgba(10,22,40,0.08)',
            border: 'none',
            fontFamily: CHAT_FONT_STACK,
            textDecoration: 'none',
            cursor: attachment.url && !isOpeningAttachment ? 'pointer' : 'default',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: isMe ? outgoingPalette.badgeBg : '#EEF5FF',
                color: isMe ? outgoingPalette.text : C.blue,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MS name={resolveAttachmentIconName(attachment.icon)} size={22} color={isMe ? outgoingPalette.text : C.blue} />
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                title={attachment.filename}
                style={{
                  minWidth: 0,
                  flex: 1,
                  fontSize: 15,
                  lineHeight: 1.28,
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {attachment.filename}
              </div>
              {metaParts.length > 0 ? (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    lineHeight: 1.2,
                    color: isMe ? outgoingPalette.textMuted : C.inkFaint,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {metaParts.join(' • ')}
                </div>
              ) : null}
              {isOpeningAttachment ? (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    lineHeight: 1.2,
                    color: isMe ? outgoingPalette.textMuted : C.inkFaint,
                  }}
                >
                  {mt('messageBubble.t24')}
                </div>
              ) : null}
            </div>
          </div>
          {captionText && !isFallbackCaption(captionText, msg.kind) && (
            <div
              style={{
                marginTop: 12,
                padding: '0 2px',
                fontSize: 15,
                lineHeight: 1.38,
                fontWeight: 400,
                color: isMe ? outgoingPalette.text : C.ink,
                textAlign: 'left',
                letterSpacing: '-0.008em',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {renderTaggedText(captionText, msg.raw.id, isMe, outgoingPalette)}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              marginTop: 10,
              color: isMe ? outgoingPalette.textMuted : C.inkFaint,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{msg.time}</span>
            {isMe ? (
              <MS
                name={getMessageStatusIcon(msg.status)}
                size={13}
                color={isMe ? getMessageStatusColor(msg.status) : C.blue}
              />
            ) : null}
          </div>
        </div>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

type SharedPublicationPreview = { imageUrl: string; summary: string }

const sharedPublicationPreviewCache = new Map<string, Promise<SharedPublicationPreview>>()
const sharedDriveImageCache = new Map<string, Promise<string>>()
const SHARED_IMAGE_FILE_PATTERN = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i

const loadSharedPublicationPreview = (publicationId: string): Promise<SharedPublicationPreview> => {
  const cached = sharedPublicationPreviewCache.get(publicationId)
  if (cached) return cached
  const request = (async (): Promise<SharedPublicationPreview> => {
    const response = await authorizedFetch(new LocalStorageAuthSessionStore(), `/api/v1/publications/${encodeURIComponent(publicationId)}`)
    if (!response.ok) return { imageUrl: '', summary: '' }
    const payload = await response.json() as Record<string, unknown>
    const publication = (payload.publication && typeof payload.publication === 'object' ? payload.publication : payload) as {
      cover_image_url?: string
      content?: string
      attachments?: Array<{ file_url?: string; file_type?: string; mime_type?: string; thumbnail_url?: string }>
    }
    const attachments = Array.isArray(publication.attachments) ? publication.attachments : []
    const image = attachments.find((item) => item.file_type === 'image' || item.mime_type?.startsWith('image/') || SHARED_IMAGE_FILE_PATTERN.test(item.file_url || ''))
    const raw = publication.cover_image_url || image?.thumbnail_url || image?.file_url || attachments.find((item) => item.thumbnail_url)?.thumbnail_url || ''
    return {
      imageUrl: raw ? normalizeBackendAssetUrl(raw) ?? raw : '',
      summary: (publication.content || '').replace(/\s+/g, ' ').trim().slice(0, 220),
    }
  })().catch(() => ({ imageUrl: '', summary: '' }))
  sharedPublicationPreviewCache.set(publicationId, request)
  return request
}

const sharedNoteSummaryCache = new Map<string, Promise<{ text: string; imageSource: string }>>()

const collectNoteDocText = (node: unknown, parts: string[]): void => {
  if (parts.join(' ').length > 400 || !node) return
  if (Array.isArray(node)) {
    node.forEach((item) => collectNoteDocText(item, parts))
    return
  }
  if (typeof node !== 'object') return
  const record = node as Record<string, unknown>
  if (typeof record.text === 'string' && record.text.trim()) parts.push(record.text.trim())
  Object.entries(record).forEach(([key, value]) => {
    if (key !== 'text' && value && typeof value === 'object') collectNoteDocText(value, parts)
  })
}

type SharedNotePreview = { text: string; imageSource: string }

const loadSharedNoteSummary = (noteId: string): Promise<SharedNotePreview> => {
  const cached = sharedNoteSummaryCache.get(noteId)
  if (cached) return cached
  const request = (async (): Promise<SharedNotePreview> => {
    const response = await authorizedFetch(new LocalStorageAuthSessionStore(), `/api/v1/notes/${encodeURIComponent(noteId)}`)
    if (!response.ok) return { text: '', imageSource: '' }
    const payload = await response.json() as Record<string, unknown>
    const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    const data = isObject(payload.data) ? payload.data : payload
    const note = isObject(data.note) ? data.note : data
    const attachments = Array.isArray(note.attachments) ? note.attachments.filter(isObject) : []
    const image = attachments.find((item) => String(item.mime_type || '').startsWith('image/') || SHARED_IMAGE_FILE_PATTERN.test(String(item.real_name || item.download_url || '')))
    const rawImage = image && typeof image.download_url === 'string' ? image.download_url : ''
    const imageSource = rawImage ? normalizeBackendAssetUrl(rawImage) ?? rawImage : ''
    const parts: string[] = []
    collectNoteDocText(note.content_doc, parts)
    const docText = parts.join('\n').trim()
    const plainSource = typeof note.content_text === 'string' && note.content_text.trim() ? note.content_text : typeof note.content === 'string' ? note.content : ''
    const plain = plainSource.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim()
    return { text: (plain || docText).slice(0, 320), imageSource }
  })().catch(() => ({ text: '', imageSource: '' }))
  sharedNoteSummaryCache.set(noteId, request)
  return request
}

function WhiteboardBubble({ msg, theme, onReact, onUnreact }: { msg: MessageView; theme?: MessageBubbleTheme; onReact?: (messageId: string, emoji: string) => void; onUnreact?: (messageId: string, emoji: string) => void }) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const metadata = parseJsonRecord(msg.raw.metadata) as { type?: string; room_id?: string; url?: string } | null
  if (!metadata || metadata.type !== 'whiteboard') return null
  const boardUrl = metadata.url || (metadata.room_id ? `${window.location.origin}/web/whiteboard/?room=${encodeURIComponent(metadata.room_id)}` : '')
  const openBoard = () => {
    if (!boardUrl) return
    try {
      const parsed = new URL(boardUrl, window.location.origin)
      if (parsed.origin === window.location.origin) window.location.assign(parsed.href)
      else window.open(parsed.href, '_blank', 'noopener,noreferrer')
    } catch {
      window.open(boardUrl, '_blank', 'noopener,noreferrer')
    }
  }
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div
          role="link"
          tabIndex={0}
          onClick={openBoard}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openBoard() } }}
          style={{ display: 'block', minWidth: 260, maxWidth: 360, background: isMe ? outgoingPalette.gradient : '#FFFFFF', color: isMe ? '#FFFFFF' : C.ink, borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING, padding: 16, boxShadow: '0 12px 30px rgba(10,22,40,0.08)', cursor: 'pointer', fontFamily: CHAT_FONT_STACK }}
        >
          <div aria-hidden="true" style={{ position: 'relative', marginBottom: 12, borderRadius: 12, overflow: 'hidden', aspectRatio: '16 / 9', background: '#FFFFFF', backgroundImage: 'radial-gradient(#D5DDEB 1.2px, transparent 1.2px)', backgroundSize: '16px 16px', border: isMe ? 'none' : '1px solid #E5EAF3' }}>
            <span style={{ position: 'absolute', left: '10%', top: '18%', width: '30%', height: '34%', borderRadius: 8, background: '#FFE08A', transform: 'rotate(-4deg)' }} />
            <span style={{ position: 'absolute', left: '46%', top: '14%', width: '22%', height: '30%', borderRadius: 999, border: '3px solid #2458D3' }} />
            <span style={{ position: 'absolute', left: '58%', top: '54%', width: '30%', height: '28%', borderRadius: 8, background: '#C7F0DC' }} />
            <span style={{ position: 'absolute', left: '16%', top: '68%', width: '34%', height: 3, borderRadius: 999, background: '#FF6B6B', transform: 'rotate(-8deg)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8, marginBottom: 2 }}>Whiteboard</div>
              <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mt('messageBubble.t25')}</div>
              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4 }}>{mt('messageBubble.t26')}</div>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: '8px 12px', background: isMe ? 'rgba(255,255,255,0.12)' : '#EEF2FF', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <MS name="open_in_new" size={16} /> {mt('bubble.openBoard')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 11, opacity: 0.6 }}>
            {msg.time}
            {isMe && <MS name={getMessageStatusIcon(msg.status)} size={12} color={getMessageStatusColor(msg.status)} style={{ marginLeft: 4 }} />}
          </div>
        </div>
        <MessageReactions reactions={msg.raw.reactions ?? []} isMe={isMe} onReact={(emoji) => onReact?.(msg.raw.id, emoji)} onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)} outgoingPalette={outgoingPalette} />
      </div>
    </div>
  )
}

const loadSharedDriveImage = (downloadUrl: string): Promise<string> => {
  const cached = sharedDriveImageCache.get(downloadUrl)
  if (cached) return cached
  const request = (async () => {
    const response = await authorizedFetch(new LocalStorageAuthSessionStore(), downloadUrl)
    if (!response.ok) return ''
    const blob = await response.blob()
    return blob.type.startsWith('image/') || !blob.type ? URL.createObjectURL(blob) : ''
  })().catch(() => '')
  sharedDriveImageCache.set(downloadUrl, request)
  return request
}

function SharedContentPreview({ imageUrl, text, isMe, tint }: { imageUrl?: string; text?: string; isMe: boolean; tint: string }) {
  const [failedUrl, setFailedUrl] = useState('')
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl
  const previewText = (text || '').trim()
  if (!showImage && !previewText) return null
  if (showImage) {
    return (
      <div style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', aspectRatio: '16 / 9', background: isMe ? 'rgba(255,255,255,0.14)' : '#EEF2F8' }}>
        <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl || '')} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 12, background: isMe ? 'rgba(255,255,255,0.14)' : tint, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-line', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
      {previewText}
    </div>
  )
}

type DriveFileBubbleMetadata = {
  type: string
  fileName?: string
  fileSize?: number
  fileId: string
  fileMime?: string
  fileDownloadUrl?: string
}

function DriveFileBubble({ msg, onOpenDriveFile, theme, onReact, onUnreact }: { msg: MessageView; onOpenDriveFile?: (file: DriveFileBubbleMetadata) => void; theme?: MessageBubbleTheme; onReact?: (messageId: string, emoji: string) => void; onUnreact?: (messageId: string, emoji: string) => void }) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const metadata = parseJsonRecord(msg.raw.metadata) as DriveFileBubbleMetadata | null

  const fileName = metadata?.fileName || mt('messageBubble.t27')
  const fileSize = metadata?.fileSize ? formatAttachmentSize(metadata.fileSize) : null

  const extension = getFileExtension(fileName)
  const iconType = iconByExtension(extension)
  const iconName = resolveAttachmentIconName(iconType)
  const driveImageSource = metadata?.type === 'drive_file' && metadata.fileDownloadUrl && (metadata.fileMime?.startsWith('image/') || SHARED_IMAGE_FILE_PATTERN.test(fileName)) ? metadata.fileDownloadUrl : ''
  const [driveImageUrl, setDriveImageUrl] = useState('')
  useEffect(() => {
    if (!driveImageSource) return
    let active = true
    void loadSharedDriveImage(driveImageSource).then((url) => { if (active) setDriveImageUrl(url) })
    return () => { active = false }
  }, [driveImageSource])

  if (!metadata || metadata.type !== 'drive_file') return null

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div
          role="button"
          onClick={() => onOpenDriveFile?.(metadata)}
          style={{
            display: 'block',
            minWidth: 260,
            maxWidth: 360,
            background: isMe ? outgoingPalette.gradient : '#FFFFFF',
            color: isMe ? '#FFFFFF' : C.ink,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: '16px',
            boxShadow: '0 12px 30px rgba(10,22,40,0.08)',
            border: 'none',
            cursor: 'pointer',
            fontFamily: CHAT_FONT_STACK,
            transition: 'transform 0.1s ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <SharedContentPreview imageUrl={driveImageUrl} isMe={isMe} tint="#F1F5FB" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: isMe ? 'rgba(255,255,255,0.18)' : '#EEF2FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MS name={iconName} size={28} color={isMe ? '#FFFFFF' : C.blue} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8, marginBottom: 2 }}>Team Drive</div>
              <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
              {fileSize && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{fileSize}</div>}
            </div>
          </div>
          
          <div style={{ 
            marginTop: 16, 
            padding: '8px 12px', 
            background: isMe ? 'rgba(255,255,255,0.12)' : '#F8FAFC', 
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}>
            <MS name="open_in_new" size={16} />
            {mt('messageBubble.t28')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 11, opacity: 0.6 }}>
            {msg.time}
            {isMe && <MS name={getMessageStatusIcon(msg.status)} size={12} color={getMessageStatusColor(msg.status)} style={{ marginLeft: 4 }} />}
          </div>
        </div>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

function NoteBubble({ msg, onOpenNote, theme, onReact, onUnreact }: { msg: MessageView; onOpenNote?: (noteId: string) => void; theme?: MessageBubbleTheme; onReact?: (messageId: string, emoji: string) => void; onUnreact?: (messageId: string, emoji: string) => void }) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const metadata = parseJsonRecord(msg.raw.metadata) as { type: string; note_title?: string; note_summary?: string; note_cover_url?: string; note_url?: string; note_id?: string; noteId?: string } | null
  
  const sharedNoteId = metadata?.type === 'note' ? String(metadata.note_id || metadata.noteId || '') : ''
  const metaNoteSummary = metadata?.type === 'note' ? (metadata.note_summary || '').trim() : ''
  const [loadedNoteSummary, setLoadedNoteSummary] = useState('')
  const [noteImageUrl, setNoteImageUrl] = useState('')
  useEffect(() => {
    if (!sharedNoteId) return
    let active = true
    void loadSharedNoteSummary(sharedNoteId).then(async (preview) => {
      if (!active) return
      setLoadedNoteSummary(preview.text)
      if (!preview.imageSource) return
      const url = await loadSharedDriveImage(preview.imageSource)
      if (active) setNoteImageUrl(url)
    })
    return () => { active = false }
  }, [sharedNoteId])

  if (!metadata || metadata.type !== 'note') return null

  const noteTitle = metadata.note_title || mt('messageBubble.t29')
  const noteSummary = loadedNoteSummary || metaNoteSummary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || (noteImageUrl ? '' : mt('messageBubble.t30'))
  const noteUrl = metadata.note_url || '#'

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div
          role="button"
          onClick={() => {
            const noteId = metadata.note_id || metadata.noteId;
            if (noteId && onOpenNote) {
              onOpenNote(noteId);
            } else {
              window.open(noteUrl, '_blank');
            }
          }}
          style={{
            display: 'block',
            minWidth: 260,
            maxWidth: 360,
            background: isMe ? outgoingPalette.gradient : '#FFFFFF',
            color: isMe ? '#FFFFFF' : C.ink,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: '16px',
            boxShadow: '0 12px 30px rgba(10,22,40,0.08)',
            border: 'none',
            cursor: 'pointer',
            fontFamily: CHAT_FONT_STACK,
            transition: 'transform 0.1s ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <SharedContentPreview imageUrl={noteImageUrl} isMe={isMe} tint="#FFF9DB" />
          <SharedContentPreview text={noteSummary} isMe={isMe} tint="#FFF9DB" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: isMe ? 'rgba(255,255,255,0.18)' : '#FFF9DB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MS name="description" size={28} color={isMe ? '#FFFFFF' : '#F59E0B'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8, marginBottom: 2 }}>Notes</div>
              <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{noteTitle}</div>
            </div>
          </div>
          
          <div style={{ 
            marginTop: 16, 
            padding: '8px 12px', 
            background: isMe ? 'rgba(255,255,255,0.12)' : '#FFFBEB', 
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}>
            <MS name="open_in_new" size={16} />
            {mt('messageBubble.t31')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 11, opacity: 0.6 }}>
            {msg.time}
            {isMe && <MS name={getMessageStatusIcon(msg.status)} size={12} color={getMessageStatusColor(msg.status)} style={{ marginLeft: 4 }} />}
          </div>
        </div>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

function PublicationBubble({ msg, onOpenPublication, theme, onReact, onUnreact }: { msg: MessageView; onOpenPublication?: (publicationId: string) => void; theme?: MessageBubbleTheme; onReact?: (messageId: string, emoji: string) => void; onUnreact?: (messageId: string, emoji: string) => void }) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const metadata = parseJsonRecord(msg.raw.metadata) as {
    type: string
    publication_id?: string
    publication_title?: string
    publication_summary?: string
    publication_url?: string
    publication_source?: string
    publication_cover_url?: string
  } | null
  const isPublication = metadata?.type === 'publication'
  const publicationId = isPublication ? metadata?.publication_id || '' : ''
  const metaCoverUrl = isPublication && metadata?.publication_cover_url ? normalizeBackendAssetUrl(metadata.publication_cover_url) ?? metadata.publication_cover_url : ''
  const [loadedPreview, setLoadedPreview] = useState<SharedPublicationPreview | null>(null)
  useEffect(() => {
    if (!publicationId || metaCoverUrl) return
    let active = true
    void loadSharedPublicationPreview(publicationId).then((preview) => { if (active) setLoadedPreview(preview) })
    return () => { active = false }
  }, [publicationId, metaCoverUrl])

  if (!metadata || metadata.type !== 'publication') return null

  const title = metadata.publication_title || mt('messageBubble.t32')
  const previewSummary = metadata.publication_summary || loadedPreview?.summary || ''
  const publicationUrl = metadata.publication_url || (metadata.publication_id
    ? `${window.location.origin}/web/news/${encodeURIComponent(metadata.publication_id)}`
    : '#')
  const openPublication = () => {
    if (publicationId && onOpenPublication) onOpenPublication(publicationId)
    else if (publicationUrl !== '#') window.location.assign(publicationUrl)
  }

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div
          role="link"
          tabIndex={0}
          onClick={openPublication}
          onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && publicationUrl !== '#') { event.preventDefault(); openPublication() } }}
          style={{
            display: 'block',
            minWidth: 260,
            maxWidth: 360,
            background: isMe ? outgoingPalette.gradient : '#FFFFFF',
            color: isMe ? '#FFFFFF' : C.ink,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: 16,
            boxShadow: '0 12px 30px rgba(10,22,40,0.08)',
            border: 'none',
            cursor: 'pointer',
            fontFamily: CHAT_FONT_STACK,
          }}
        >
          <SharedContentPreview imageUrl={metaCoverUrl || loadedPreview?.imageUrl} text={previewSummary} isMe={isMe} tint="#EEF2FF" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: isMe ? 'rgba(255,255,255,0.18)' : '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MS name="newspaper" size={27} color={isMe ? '#FFFFFF' : C.blue} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8, marginBottom: 2 }}>{metadata.publication_source || mt('messageBubble.t33')}</div>
              <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
              {previewSummary && (metaCoverUrl || loadedPreview?.imageUrl) ? <div style={{ fontSize: 12, opacity: 0.72, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{previewSummary}</div> : null}
            </div>
          </div>
          <div style={{ marginTop: 16, padding: '8px 12px', background: isMe ? 'rgba(255,255,255,0.12)' : '#EEF2FF', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <MS name="open_in_new" size={16} /> {mt('bubble.openNews')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 11, opacity: 0.6 }}>
            {msg.time}
            {isMe && <MS name={getMessageStatusIcon(msg.status)} size={12} color={getMessageStatusColor(msg.status)} style={{ marginLeft: 4 }} />}
          </div>
        </div>
        <MessageReactions reactions={msg.raw.reactions ?? []} isMe={isMe} onReact={(emoji) => onReact?.(msg.raw.id, emoji)} onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)} outgoingPalette={outgoingPalette} />
      </div>
    </div>
  )
}

function TaskBubble({
  msg,
  theme,
  onReact,
  onUnreact,
}: {
  msg: MessageView
  theme?: MessageBubbleTheme
  onReact?: (messageId: string, emoji: string) => void
  onUnreact?: (messageId: string, emoji: string) => void
}) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const metadata = parseJsonRecord(msg.raw.metadata) as {
    kind?: string
    task_id?: string
    taskId?: string
    title?: string
    board_id?: string
  } | null

  if (!metadata) return null

  const taskId = metadata.task_id || metadata.taskId || ''
  const taskTitle = metadata.title || mt('messageBubble.t34')
  const taskUrl = `/kanban?task=${encodeURIComponent(taskId)}`

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>
            {msg.senderLabel}
          </div>
        )}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <Link
          to={taskUrl}
          style={{
            display: 'block',
            minWidth: 260,
            maxWidth: 360,
            background: isMe
              ? outgoingPalette.gradient
              : '#FFFFFF',
            color: isMe ? '#FFFFFF' : C.ink,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: '16px',
            boxShadow: '0 12px 30px rgba(10,22,40,0.08)',
            border: 'none',
            cursor: 'pointer',
            fontFamily: CHAT_FONT_STACK,
            textDecoration: 'none',
            transition: 'transform 0.1s ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: isMe ? 'rgba(255,255,255,0.18)' : '#E8F0FE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MS name="assignment" size={28} color={isMe ? '#FFFFFF' : '#1A73E8'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8, marginBottom: 2 }}>Team Kanban</div>
              <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {taskTitle}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: '8px 12px',
              background: isMe ? 'rgba(255,255,255,0.12)' : '#F1F3F4',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              color: isMe ? '#FFFFFF' : '#3C4043',
            }}
          >
            <MS name="open_in_new" size={16} />
            {mt('messageBubble.t35')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 11, opacity: 0.6, color: isMe ? '#FFFFFF' : C.inkFaint }}>
            {msg.time}
            {isMe && <MS name={getMessageStatusIcon(msg.status)} size={12} color={getMessageStatusColor(msg.status)} style={{ marginLeft: 4 }} />}
          </div>
        </Link>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

function EventBubble({
  msg,
  theme,
  onReact,
  onUnreact,
}: {
  msg: MessageView
  theme?: MessageBubbleTheme
  onReact?: (messageId: string, emoji: string) => void
  onUnreact?: (messageId: string, emoji: string) => void
}) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const metadata = parseJsonRecord(msg.raw.metadata) as {
    kind?: string
    event_id?: string
    eventId?: string
    title?: string
    start_time?: string
    end_time?: string
    location?: string
  } | null

  if (!metadata) return null

  const eventId = metadata.event_id || metadata.eventId || ''
  const eventTitle = metadata.title || mt('messageBubble.t36')
  const eventUrl = `/calendar?event=${encodeURIComponent(eventId)}`

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>
            {msg.senderLabel}
          </div>
        )}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <Link
          to={eventUrl}
          style={{
            display: 'block',
            minWidth: 260,
            maxWidth: 360,
            background: isMe
              ? outgoingPalette.gradient
              : '#FFFFFF',
            color: isMe ? '#FFFFFF' : C.ink,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: '16px',
            boxShadow: '0 12px 30px rgba(10,22,40,0.08)',
            border: 'none',
            cursor: 'pointer',
            fontFamily: CHAT_FONT_STACK,
            textDecoration: 'none',
            transition: 'transform 0.1s ease',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: isMe ? 'rgba(255,255,255,0.18)' : '#FFF0F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <MS name="calendar_month" size={28} color={isMe ? '#FFFFFF' : '#FF4B4B'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.8, marginBottom: 2 }}>Team Calendar</div>
              <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {eventTitle}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: '8px 12px',
              background: isMe ? 'rgba(255,255,255,0.12)' : '#FFF5F5',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              color: isMe ? '#FFFFFF' : '#FF4B4B',
            }}
          >
            <MS name="open_in_new" size={16} />
            {mt('messageBubble.t37')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 11, opacity: 0.6, color: isMe ? '#FFFFFF' : C.inkFaint }}>
            {msg.time}
            {isMe && <MS name={getMessageStatusIcon(msg.status)} size={12} color={getMessageStatusColor(msg.status)} style={{ marginLeft: 4 }} />}
          </div>
        </Link>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}

interface AlbumFile {
  url: string
  type: string
  size: number
  name: string
}

const isAlbumImageFile = (file: AlbumFile): boolean => {
  const mime = (file.type ?? '').toLowerCase()
  const ext = getFileExtension(file.name ?? '')?.toLowerCase() ?? ''
  return mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)
}

function AlbumBubble({
  msg,
  showSenderLabel,
  onOpenImage,
  theme,
  onReact,
  onUnreact,
}: {
  msg: MessageView
  showSenderLabel: boolean
  onOpenImage?: (message: MessageView) => void
  theme?: MessageBubbleTheme
  onReact?: (messageId: string, emoji: string) => void
  onUnreact?: (messageId: string, emoji: string) => void
}) {
  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const metadata = parseJsonRecord(msg.raw.metadata) as { gallery?: AlbumFile[] } | null
  const files = metadata?.gallery || []
  const isImageAlbum = files.length > 0 && files.every(isAlbumImageFile)

  const handleOpenFile = useCallback(async (file: AlbumFile) => {
    if (!file.url) {
      return
    }

    try {
      await openAuthenticatedAttachment(file.url, file.name)
    } catch (error) {
      console.error('[AlbumBubble] Failed to open attachment:', error)
    }
  }, [])

  if (files.length === 0) return null

  const handleOpenPhoto = (file: AlbumFile, index: number) => {
    const pseudoMessage: MessageView = {
      ...msg,
      raw: {
        ...msg.raw,
        id: `${msg.raw.id}_album_${index}`,
      },
      mediaUrl: file.url,
    }
    onOpenImage?.(pseudoMessage)
  }

  const count = files.length
  let gridStyle: React.CSSProperties = {
    display: 'grid',
    gap: 4,
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: 320,
    width: '100%',
  }

  if (count === 2) {
    gridStyle.gridTemplateColumns = '1fr 1fr'
  } else if (count === 3) {
    gridStyle.gridTemplateColumns = '2fr 1fr'
    gridStyle.gridTemplateRows = '1fr 1fr'
  } else if (count >= 4) {
    gridStyle.gridTemplateColumns = '1fr 1fr'
    gridStyle.gridTemplateRows = '1fr 1fr'
  }

  if (!isImageAlbum) {
    return (
      <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
        <div style={{ maxWidth: '68%' }}>
          {!isMe && showSenderLabel ? (
            <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
          ) : null}
          <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
          <div
            style={{
              background: isMe ? outgoingPalette.gradient : IOS_INCOMING_BG,
              borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
              padding: 8,
              boxShadow: isMe ? `0 12px 32px ${withAlpha(outgoingPalette.solid, 0.22)}` : '0 10px 28px rgba(10,22,40,0.12)',
              border: 'none',
              maxWidth: 360,
              width: '100%',
              fontFamily: CHAT_FONT_STACK,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map((file, idx) => {
                const ext = getFileExtension(file.name ?? '') ?? ''
                const metaParts = [ext ? ext.replace('.', '').toUpperCase() : null, formatAttachmentSize(file.size)].filter(Boolean)
                return (
                  <button
                    key={`${file.url}:${idx}`}
                    type="button"
                    onClick={() => void handleOpenFile(file)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      width: '100%',
                      border: 'none',
                      borderRadius: 12,
                      background: isMe ? outgoingPalette.badgeBg : '#FFFFFF',
                      color: isMe ? outgoingPalette.text : C.ink,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: isMe ? withAlpha('#FFFFFF', 0.22) : '#EEF5FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <MS name={resolveAttachmentIconName(iconByExtension(ext))} size={20} color={isMe ? outgoingPalette.text : C.blue} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, lineHeight: 1.28, fontWeight: 700, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                        {file.name}
                      </div>
                      {metaParts.length > 0 ? (
                        <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.2, color: isMe ? outgoingPalette.textMuted : C.inkFaint }}>
                          {metaParts.join(' • ')}
                        </div>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>

            {msg.text && !isFallbackCaption(msg.text, msg.kind) && (
              <div
                style={{
                  padding: '10px 10px 2px',
                  fontSize: 15,
                  lineHeight: 1.38,
                  fontWeight: 400,
                  color: isMe ? outgoingPalette.text : C.ink,
                  textAlign: 'left',
                  letterSpacing: '-0.008em',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {renderTaggedText(msg.text, msg.raw.id, isMe, outgoingPalette)}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 4,
                padding: '6px 6px 2px',
                color: isMe ? outgoingPalette.textMuted : C.inkFaint,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{msg.time}</span>
              {isMe ? (
                <MS
                  name={getMessageStatusIcon(msg.status)}
                  size={13}
                  color={getMessageStatusColor(msg.status)}
                />
              ) : null}
            </div>
          </div>
          <MessageReactions
            reactions={msg.raw.reactions ?? []}
            isMe={isMe}
            onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
            onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
            outgoingPalette={outgoingPalette}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
      <div style={{ maxWidth: '68%' }}>
        {!isMe && showSenderLabel ? (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
        ) : null}
        <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
        <div
          style={{
            position: 'relative',
            background: isMe ? outgoingPalette.gradient : IOS_INCOMING_BG,
            borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
            padding: 4,
            boxShadow: isMe ? `0 12px 32px ${withAlpha(outgoingPalette.solid, 0.22)}` : '0 10px 28px rgba(10,22,40,0.12)',
            border: 'none',
            maxWidth: 330,
            width: '100%',
            fontFamily: CHAT_FONT_STACK,
          }}
        >
          <div style={gridStyle}>
            {files.slice(0, 4).map((file, idx) => {
              let itemStyle: React.CSSProperties = {
                position: 'relative',
                cursor: 'zoom-in',
                height: count === 1 ? 220 : count === 2 ? 150 : idx === 0 && count === 3 ? 154 : 75,
                background: '#DCE6F8',
              }

              if (idx === 0 && count === 3) {
                itemStyle.gridRow = 'span 2'
              }

              const isMoreThanFour = count > 4 && idx === 3

              return (
                <div
                  key={idx}
                  style={itemStyle}
                  onClick={() => handleOpenPhoto(file, idx)}
                >
                  <img
                    src={file.url}
                    alt={file.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {isMoreThanFour ? (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(15, 23, 42, 0.65)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      fontSize: 18,
                      fontWeight: 700,
                      backdropFilter: 'blur(4px)',
                    }}>
                      +{count - 3}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {msg.text && !isFallbackCaption(msg.text, msg.kind) && (
            <div
              style={{
                padding: '10px 10px 2px',
                fontSize: 15,
                lineHeight: 1.38,
                fontWeight: 400,
                color: isMe ? outgoingPalette.text : C.ink,
                textAlign: 'left',
                letterSpacing: '-0.008em',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            >
              {renderTaggedText(msg.text, msg.raw.id, isMe, outgoingPalette)}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              padding: '4px 6px 4px',
              color: isMe ? outgoingPalette.textMuted : C.inkFaint,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{msg.time}</span>
            {isMe ? (
              <MS
                name={getMessageStatusIcon(msg.status)}
                size={13}
                color={getMessageStatusColor(msg.status)}
              />
            ) : null}
          </div>
        </div>
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
      </div>
    </div>
  )
}


const getMarkdownComponents = (isMe: boolean, outgoingPalette: MessagePalette): Components => ({
  h1: ({ children, ...props }) => (
    <h1 style={{ fontSize: '16px', fontWeight: 700, margin: '8px 0 4px', color: isMe ? outgoingPalette.text : '#102033' }} {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 style={{ fontSize: '15px', fontWeight: 700, margin: '6px 0 4px', color: isMe ? outgoingPalette.text : '#102033' }} {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 style={{ fontSize: '14px', fontWeight: 700, margin: '6px 0 4px', color: isMe ? outgoingPalette.text : '#102033' }} {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p style={{ margin: '0 0 6px 0', lineHeight: 1.4, overflowWrap: 'anywhere', wordBreak: 'break-word' }} {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong style={{ fontWeight: 700 }} {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em style={{ fontStyle: 'italic' }} {...props}>
      {children}
    </em>
  ),
  ul: ({ children, ...props }) => (
    <ul style={{ margin: '4px 0 6px', paddingLeft: '20px', listStyleType: 'disc' }} {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol style={{ margin: '4px 0 6px', paddingLeft: '20px', listStyleType: 'decimal' }} {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li style={{ margin: '2px 0', lineHeight: 1.4 }} {...props}>
      {children}
    </li>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: isMe ? outgoingPalette.text : '#2C8CFF',
        textDecoration: 'underline',
        wordBreak: 'break-all',
      }}
      {...props}
    >
      {children}
    </a>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      style={{
        margin: '6px 0',
        paddingLeft: '10px',
        borderLeft: `3px solid ${isMe ? 'rgba(255,255,255,0.4)' : '#C8D5E8'}`,
        color: isMe ? outgoingPalette.textMuted : '#556677',
        fontStyle: 'italic',
      }}
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr
      style={{
        margin: '10px 0',
        border: 'none',
        borderTop: `1px solid ${isMe ? 'rgba(255,255,255,0.2)' : 'rgba(10,22,40,0.1)'}`,
      }}
    />
  ),
  pre: ({ children, ...props }) => (
    <pre
      style={{
        margin: '6px 0',
        padding: '8px',
        background: isMe ? 'rgba(0,0,0,0.15)' : 'rgba(10,22,40,0.04)',
        borderRadius: '8px',
        overflowX: 'auto',
        fontFamily: 'monospace',
        fontSize: '13px',
      }}
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ children, className, ...props }) => {
    const isBlock = Boolean(className)
    return isBlock ? (
      <code
        style={{
          fontFamily: 'monospace',
          fontSize: '13px',
          display: 'block',
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}
        className={className}
        {...props}
      >
        {children}
      </code>
    ) : (
      <code
        style={{
          fontFamily: 'monospace',
          fontSize: '13px',
          background: isMe ? 'rgba(0,0,0,0.15)' : 'rgba(10,22,40,0.04)',
          padding: '2px 4px',
          borderRadius: '4px',
        }}
        {...props}
      >
        {children}
      </code>
    )
  },
  table: ({ children, ...props }) => (
    <div style={{ margin: '8px 0', maxWidth: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }} {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th
      style={{
        border: `1px solid ${isMe ? 'rgba(255,255,255,0.3)' : 'rgba(10,22,40,0.1)'}`,
        background: isMe ? 'rgba(255,255,255,0.1)' : 'rgba(10,22,40,0.02)',
        padding: '6px 8px',
        fontWeight: 700,
        textAlign: 'left',
      }}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      style={{
        border: `1px solid ${isMe ? 'rgba(255,255,255,0.2)' : 'rgba(10,22,40,0.08)'}`,
        padding: '6px 8px',
      }}
      {...props}
    >
      {children}
    </td>
  ),
})

const preprocessMarkdown = (text: string): string => {
  if (!text) return text

  const rawLines = text.replace(/\r\n/g, '\n').split('\n')
  const processedRawLines: string[] = []
  const isDelimiterRow = (line: string) => {
    const trimmed = line.trim()
    return trimmed.startsWith('|') && trimmed.endsWith('|') && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/.test(trimmed)
  }
  const isTableRow = (line: string) => {
    const trimmed = line.trim()
    return trimmed.startsWith('|') && trimmed.endsWith('|')
  }

  for (let i = 0; i < rawLines.length; i++) {
    const currentLine = rawLines[i]

    // Check if the next line is a delimiter row, and if current line has a merged prefix before a table header
    if (i + 1 < rawLines.length && isDelimiterRow(rawLines[i + 1])) {
      const firstPipeIdx = currentLine.indexOf('|')
      if (firstPipeIdx > 0) {
        let prefix = currentLine.substring(0, firstPipeIdx)
        const tableHeader = currentLine.substring(firstPipeIdx)

        // Close unmatched bold markers in prefix
        const boldMatches = prefix.match(/\*\*/g)
        if (boldMatches && boldMatches.length % 2 !== 0) {
          prefix = prefix.trim() + '**'
        }

        processedRawLines.push(prefix)
        processedRawLines.push(tableHeader)
        continue
      }
    }

    if (isDelimiterRow(currentLine)) {
      const prevLine = processedRawLines[processedRawLines.length - 1]
      const hasPrevTableRow = prevLine !== undefined && isTableRow(prevLine) && !isDelimiterRow(prevLine)
      if (!hasPrevTableRow) {
        const columnCount = (currentLine.match(/\|/g) || []).length - 1
        if (columnCount > 0) {
          const dummyHeader = '|' + Array(columnCount).fill(' ').join('|') + '|'
          processedRawLines.push(dummyHeader)
        }
      }
    }
    processedRawLines.push(currentLine)
  }
  const preparedText = processedRawLines.join('\n')

  let processed = preparedText
  // 1. Replace inline "--- ###" or "---" followed by hash headers with clean newlines and hr
  processed = processed.replace(/---\s*(#{1,6}\s+)/g, '\n\n---\n\n$1')
  // 2. If we have any headings inline that are not at the start of a line, prefix with newlines
  processed = processed.replace(/([^\n])\s*(#{1,6}\s+)/g, '$1\n\n$2')
  // 3. If we have bullet points inline after a period/parenthesis, put them on a new line
  processed = processed.replace(/([\.?!]|\))\s+([-*•])\s+/g, '$1\n- ')
  return processed
}

interface MessageBubbleProps {
  msg: MessageView
  showSenderLabel: boolean
  onOpenImage?: (message: MessageView) => void
  onOpenVideo?: (message: MessageView) => void
  theme?: MessageBubbleTheme
  isSmartAgentSending?: boolean
  isSmartAgentChat?: boolean
  isLastSmartAgentMessage?: boolean
  showTail?: boolean
  groupedWithPrevious?: boolean
  onOpenMenu?: (event: ReactMouseEvent<HTMLElement>) => void
  onSendFeedback?: (feedback: 'like' | 'dislike') => void
  onReact?: (messageId: string, emoji: string) => void
  onUnreact?: (messageId: string, emoji: string) => void
  onReply?: () => void
  onNavigateToReply?: (messageId: string) => void
  onConfirm?: () => void
  onCancel?: () => void
  onSelect?: (selectionValue: string, displayText: string) => void
  onOpenDriveFile?: (file: DriveFileBubbleMetadata) => void
  onOpenNote?: (noteId: string) => void
  onOpenPublication?: (publicationId: string) => void
  onEditSubmit?: (newText: string, messageId: string) => void
  onRegenerate?: () => void
}

export default function MessageBubble({ msg, showSenderLabel, onOpenImage, onOpenVideo, theme, isSmartAgentSending = false, isSmartAgentChat = false, showTail = false, groupedWithPrevious = false, onOpenMenu, isLastSmartAgentMessage = false, onSendFeedback, onReact, onUnreact, onReply, onNavigateToReply, onConfirm, onCancel, onSelect, onOpenDriveFile, onOpenNote, onOpenPublication, onEditSubmit, onRegenerate }: MessageBubbleProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(msg.text)

  if (msg.kind === 'service') {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          margin: '10px 0',
          width: '100%',
          fontFamily: CHAT_FONT_STACK,
        }}
      >
        <div
          style={{
            background: 'rgba(10,22,40,0.06)',
            color: C.inkMuted,
            padding: '6px 14px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            textAlign: 'center',
            maxWidth: '85%',
            backdropFilter: 'blur(4px)',
            border: '1px solid rgba(10,22,40,0.04)',
          }}
        >
          {msg.text}
        </div>
      </div>
    )
  }

  const isMe = msg.from === 'me'
  const outgoingPalette = buildOutgoingPalette(theme?.outgoingColorHex)
  const emojiOnlyMessage = isEmojiOnlyText(msg.text)
  const inlineTime = !isSmartAgentChat && !emojiOnlyMessage
  const timeMetaWidth = msg.time.length * 7 + 10 + (msg.from === 'me' ? 18 : 0) + (msg.raw.isEdited ? 62 : 0)
  const forcedVoiceUrl = hasVoiceMarker(msg.audioUrl, msg.videoUrl, msg.raw.attachmentUrl, msg.raw.content)
    ? msg.audioUrl ?? msg.videoUrl ?? msg.raw.attachmentUrl ?? undefined
    : undefined

  const metadata = parseJsonRecord(msg.raw.metadata)
  if (metadata && Array.isArray(metadata.gallery) && metadata.gallery.length > 0) {
    return <AlbumBubble msg={msg} showSenderLabel={showSenderLabel} onOpenImage={onOpenImage} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (metadata?.type === 'drive_file') {
    return <DriveFileBubble msg={msg} onOpenDriveFile={onOpenDriveFile} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }
  
  if (metadata?.type === 'note') {
    return <NoteBubble msg={msg} onOpenNote={onOpenNote} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (metadata?.type === 'whiteboard') {
    return <WhiteboardBubble msg={msg} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (metadata?.type === 'publication') {
    return <PublicationBubble msg={msg} onOpenPublication={onOpenPublication} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (metadata?.kind === 'task' || metadata?.type === 'task') {
    return <TaskBubble msg={msg} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (metadata?.kind === 'event' || metadata?.type === 'event') {
    return <EventBubble msg={msg} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }


  if (forcedVoiceUrl) {
    return <VoiceMessagePlayer msg={{ ...msg, kind: 'voice', audioUrl: forcedVoiceUrl, videoUrl: undefined, isCall: false }} showSenderLabel={showSenderLabel} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (msg.kind === 'video_message' && msg.videoUrl) {
    return <VideoMessagePlayer msg={msg} showSenderLabel={showSenderLabel} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (msg.kind === 'video' && msg.videoUrl) {
    return <VideoAttachmentBubble msg={msg} showSenderLabel={showSenderLabel} onOpenVideo={onOpenVideo} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (msg.isCall) {
    return <CallSummaryBubble msg={msg} showSenderLabel={showSenderLabel} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (msg.kind === 'image' && msg.mediaUrl) {
    return (
      <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 8, alignItems: 'flex-end', gap: 8 }}>
        <div style={{ maxWidth: '68%' }}>
          {!isMe && showSenderLabel ? (
            <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpenImage?.(msg)
            }}
            style={{
              position: 'relative',
              display: 'block',
              border: 'none',
              background: isMe ? outgoingPalette.gradient : IOS_INCOMING_BG,
              borderRadius: isMe ? IOS_BUBBLE_RADIUS_OUTGOING : IOS_BUBBLE_RADIUS_INCOMING,
              padding: 0,
              boxShadow: isMe ? `0 12px 32px ${withAlpha(outgoingPalette.solid, 0.22)}` : '0 10px 28px rgba(10,22,40,0.12)',
              maxWidth: '100%',
              fontFamily: CHAT_FONT_STACK,
              cursor: 'zoom-in',
              overflow: 'hidden',
            }}
          >
            <img
              src={msg.mediaUrl}
              alt="attachment"
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                maxHeight: 420,
                objectFit: 'cover',
                background: '#DCE6F8',
              }}
            />
            {msg.text && !isFallbackCaption(msg.text, msg.kind) && (
              <div
                style={{
                  padding: '10px 14px 2px',
                  fontSize: 15,
                  lineHeight: 1.38,
                  fontWeight: 400,
                  color: isMe ? outgoingPalette.text : C.ink,
                  textAlign: 'left',
                  letterSpacing: '-0.008em',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {renderTaggedText(msg.text, msg.raw.id, isMe, outgoingPalette)}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 4,
                padding: '4px 10px 8px',
                color: isMe ? outgoingPalette.textMuted : C.inkFaint,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{msg.time}</span>
              {isMe ? (
                <MS
                  name={getMessageStatusIcon(msg.status)}
                  size={13}
                  color={getMessageStatusColor(msg.status)}
                />
              ) : null}
            </div>
          </button>
          <MessageReactions
            reactions={msg.raw.reactions ?? []}
            isMe={isMe}
            onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
            onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
            outgoingPalette={outgoingPalette}
          />
        </div>
      </div>
    )
  }

  if ((msg.kind === 'voice' || msg.kind === 'audio') && msg.audioUrl) {
    return <VoiceMessagePlayer msg={msg} showSenderLabel={showSenderLabel} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (msg.kind === 'file' && msg.attachment) {
    return <FileAttachmentBubble msg={msg} showSenderLabel={showSenderLabel} theme={theme} onReact={onReact} onUnreact={onUnreact} />
  }

  if (isEditing) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6, width: '100%' }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: '68%', background: '#FFFFFF', border: '1px solid #E5E7EF', borderRadius: 20, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{
              width: '100%',
              minHeight: 60,
              border: 'none',
              borderBottom: '1px solid #F3F4F6',
              outline: 'none',
              resize: 'none',
              fontFamily: CHAT_FONT_STACK,
              fontSize: 15,
              color: '#1F2937',
              paddingBottom: 4
            }}
            autoFocus
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false)
                setEditText(msg.text)
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid #E5E7EF',
                background: 'transparent',
                color: '#4B5563',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {mt('messageBubble.t38')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (editText.trim() && editText !== msg.text) {
                  onEditSubmit?.(editText.trim(), msg.raw.id)
                }
                setIsEditing(false)
              }}
              disabled={!editText.trim() || editText === msg.text}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: 'none',
                background: editText.trim() && editText !== msg.text ? 'linear-gradient(to top right, #2C8CFF, #4C9EFF)' : '#9CA3AF',
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: 600,
                cursor: editText.trim() && editText !== msg.text ? 'pointer' : 'not-allowed',
                opacity: editText.trim() && editText !== msg.text ? 1 : 0.6,
              }}
            >
              {mt('messageBubble.t39')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: showTail ? 8 : 2, alignItems: 'flex-end', gap: 8 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!isMe && showSenderLabel ? (
        <div style={{ alignSelf: 'flex-start', flexShrink: 0, paddingTop: 2 }}>
          <MessengerAvatar
            initials={msg.senderLabel.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}
            imageUrl={msg.raw.senderAvatar}
            size={40}
            seed={msg.raw.senderId}
          />
        </div>
      ) : null}
      <div style={{ position: 'relative', maxWidth: 'min(78%, 720px)' }}>
        {isHovered && isMe && isSmartAgentChat && onEditSubmit ? (
          <button
            type="button"
            onClick={() => {
              setEditText(msg.text)
              setIsEditing(true)
            }}
            disabled={isSmartAgentSending}
            title={mt('messageBubble.t40')}
            style={{
              position: 'absolute',
              left: -34,
              bottom: 4,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(10,22,40,0.08)',
              cursor: isSmartAgentSending ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s ease',
              zIndex: 2,
              boxShadow: '0 2px 8px rgba(10,22,40,0.12)',
              opacity: isSmartAgentSending ? 0.4 : 1,
            }}
          >
            <MS name="edit" size={15} color={C.inkMuted} />
          </button>
        ) : null}
        {!isMe && showSenderLabel ? (
          <div style={{ fontSize: 11, fontWeight: 500, color: C.blue, marginBottom: 4, paddingLeft: 2, letterSpacing: '-0.006em', fontFamily: CHAT_FONT_STACK }}>{msg.senderLabel}</div>
        ) : null}
        <div
          style={{
            position: 'relative',
            background: isMe ? outgoingPalette.gradient : IOS_INCOMING_BG,
            color: isMe ? outgoingPalette.text : C.ink,
            borderRadius: isMe
              ? `15px ${groupedWithPrevious ? 5 : 15}px ${showTail ? 0 : 5}px 15px`
              : `${groupedWithPrevious ? 5 : 15}px 15px 15px ${showTail ? 0 : 5}px`,
            padding: emojiOnlyMessage ? '6px 10px 6px' : inlineTime ? '6px 10px 7px 12px' : '6px 12px 6px',
            fontSize: 16,
            lineHeight: emojiOnlyMessage ? 1.22 : 1.3125,
            fontWeight: 400,
            letterSpacing: 0,
            boxShadow: 'none',
            border: 'none',
            opacity: 1,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            maxWidth: '100%',
            fontFamily: CHAT_FONT_STACK,
          }}
        >
          {showTail ? <BubbleTail isMe={isMe} color={isMe ? outgoingPalette.gradientEnd : IOS_INCOMING_BG} /> : null}
          {isHovered && onOpenMenu && !isSmartAgentChat ? (
            <button
              type="button"
              aria-label={mt('messageBubble.t41')}
              title={mt('messageBubble.t42')}
              onClick={(event) => {
                event.stopPropagation()
                onOpenMenu(event)
              }}
              style={{
                position: 'absolute',
                top: 3,
                right: 4,
                width: 24,
                height: 24,
                padding: 0,
                border: 'none',
                borderRadius: 999,
                background: isMe ? withAlpha(outgoingPalette.gradientEnd, 0.72) : 'rgba(228,231,237,0.94)',
                color: isMe ? outgoingPalette.text : C.inkMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 2,
              }}
            >
              <MS name="expand_more" size={18} color="currentColor" />
            </button>
          ) : null}
          <ForwardedMeta msg={msg} isMe={isMe} outgoingPalette={outgoingPalette} />
          {msg.replyTo ? <QuotedMessage replyTo={msg.replyTo} isMe={isMe} outgoingPalette={outgoingPalette} onNavigate={onNavigateToReply ? () => onNavigateToReply(msg.replyTo!.id) : undefined} /> : null}
          <div style={{ minHeight: emojiOnlyMessage ? 32 : undefined }}>
            {isSmartAgentChat && !isMe ? (
              (() => {
                const { text: processedText, tables: processedTables } = preprocessAndExtractTables(msg.text, msg.tables)
                const hasWidget = Boolean(msg.raw.metadata && parseJsonRecord(msg.raw.metadata)?.type)
                const sourceFiles = !hasWidget ? parseSourcesFromText(processedText) : []

                if (!processedTables || processedTables.length === 0) {
                  return (
                    <div>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={getMarkdownComponents(isMe, outgoingPalette)}>
                        {preprocessMarkdown(processedText)}
                      </ReactMarkdown>
                      {sourceFiles.length > 0 && <SmartAgentSourceFiles fileNames={sourceFiles} />}
                    </div>
                  )
                }

                const parts = processedText.split(/(\[table:\d+\])/g)
                return (
                  <div>
                    {parts.map((part, index) => {
                      const match = part.match(/\[table:(\d+)\]/)
                      if (match) {
                        const tableIdx = parseInt(match[1], 10)
                        const tableData = processedTables?.[tableIdx]
                        if (tableData) {
                          return <SmartAgentTable key={`table-${tableIdx}-${index}`} table={tableData} variant="messenger" />
                        }
                        return <span key={`fallback-${index}`}>{part}</span>
                      } else {
                        if (!part.trim()) return null
                        return (
                          <ReactMarkdown key={`text-${index}`} remarkPlugins={[remarkGfm]} components={getMarkdownComponents(isMe, outgoingPalette)}>
                            {preprocessMarkdown(part)}
                          </ReactMarkdown>
                        )
                      }
                    })}
                    {sourceFiles.length > 0 && <SmartAgentSourceFiles fileNames={sourceFiles} />}
                  </div>
                )
              })()
            ) : (
              <>
                {renderTaggedText(msg.text, msg.raw.id, isMe, outgoingPalette, emojiOnlyMessage)}
                {inlineTime ? <span aria-hidden="true" style={{ display: 'inline-block', width: timeMetaWidth, height: 1 }} /> : null}
              </>
            )}
          </div>
          {msg.raw.metadata && !isMe && (
            (() => {
              const widgetData = parseJsonRecord(msg.raw.metadata) as Record<string, unknown>
              if (widgetData && widgetData.type) {
                return (
                  <SmartAgentWidgetRenderer 
                    widget={widgetData as unknown as SmartAgentWidget} 
                    isSending={isSmartAgentSending}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    onSelect={onSelect}
                  />
                )
              }
              return null
            })()
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 3,
              ...(inlineTime
                ? { position: 'absolute' as const, right: 8, bottom: 4, lineHeight: 1, whiteSpace: 'nowrap' as const }
                : { marginTop: emojiOnlyMessage ? 3 : 4, minWidth: 56 }),
              color: isMe ? outgoingPalette.textMuted : C.inkFaint,
            }}
          >
            {msg.raw.isEdited ? <span style={{ fontSize: 12, fontStyle: 'italic' }}>{mt('messageBubble.t43')}</span> : null}
            <span style={{ fontSize: 12, fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>{msg.time}</span>
            {isMe ? (
              <MS
                name={getMessageStatusIcon(msg.status)}
                size={13}
                color={getMessageStatusColor(msg.status)}
              />
            ) : null}
          </div>
        </div>

        {/* Feedback Buttons */}
        {isLastSmartAgentMessage && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingLeft: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                disabled={msg.feedback !== null && msg.feedback !== undefined}
                onClick={() => onSendFeedback?.('like')}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${
                    msg.feedback === 'like'
                      ? '#2C8CFF'
                      : '#E5E7EF'
                  }`,
                  backgroundColor: msg.feedback === 'like' ? 'rgba(44, 140, 255, 0.08)' : 'rgba(255, 255, 255, 0.8)',
                  cursor: msg.feedback ? 'default' : 'pointer',
                  opacity: msg.feedback && msg.feedback !== 'like' ? 0.4 : 1,
                  transition: 'all 0.2s ease',
                  fontSize: 14,
                }}
                title={mt('messageBubble.t44')}
              >
                👍
              </button>
              <button
                type="button"
                disabled={msg.feedback !== null && msg.feedback !== undefined}
                onClick={() => onSendFeedback?.('dislike')}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${
                    msg.feedback === 'dislike'
                      ? '#FF4D4F'
                      : '#E5E7EF'
                  }`,
                  backgroundColor: msg.feedback === 'dislike' ? 'rgba(255, 77, 79, 0.08)' : 'rgba(255, 255, 255, 0.8)',
                  cursor: msg.feedback ? 'default' : 'pointer',
                  opacity: msg.feedback && msg.feedback !== 'dislike' ? 0.4 : 1,
                  transition: 'all 0.2s ease',
                  fontSize: 14,
                }}
                title={mt('messageBubble.t45')}
              >
                👎
              </button>
              {onRegenerate ? (
                <button
                  type="button"
                  disabled={isSmartAgentSending}
                  onClick={onRegenerate}
                  style={{
                    minWidth: 32,
                    height: 32,
                    padding: '0 9px',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    border: '1px solid #E5E7EF',
                    background: 'rgba(255, 255, 255, 0.8)',
                    color: '#52627D',
                    cursor: isSmartAgentSending ? 'default' : 'pointer',
                    opacity: isSmartAgentSending ? 0.5 : 1,
                    fontSize: 12,
                  }}
                  title={mt('messageBubble.t46')}
                >
                  <MS name="refresh" size={16} />
                  {mt('messageBubble.t47')}
                </button>
              ) : null}
            </div>
            {msg.feedback === 'dislike' && (
              <span style={{ fontSize: 12, color: '#8C9BBB', fontFamily: '"Manrope", sans-serif', fontWeight: 500 }}>
                {mt('messageBubble.t48')}
              </span>
            )}
          </div>
        )}
        <MessageReactions
          reactions={msg.raw.reactions ?? []}
          isMe={isMe}
          onReact={(emoji) => onReact?.(msg.raw.id, emoji)}
          onUnreact={(emoji) => onUnreact?.(msg.raw.id, emoji)}
          outgoingPalette={outgoingPalette}
        />
        {isHovered && onReply ? (
          <button
            type="button"
            onClick={onReply}
            title={mt('messageBubble.t49')}
            style={{
              position: 'absolute',
              [isMe ? 'left' : 'right']: -34,
              bottom: 4,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(10,22,40,0.08)',
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
              zIndex: 2,
              boxShadow: '0 2px 8px rgba(10,22,40,0.12)',
            }}
          >
            <MS name="reply" size={16} color={C.inkMuted} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
