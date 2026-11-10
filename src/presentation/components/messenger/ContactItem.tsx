import type { MouseEvent as ReactMouseEvent } from 'react'
import type { ChatListItem } from './types'
import MS from '../../../shared/ui/MaterialSymbol'
import EmojiGlyph from './EmojiGlyph'
import MessengerAvatar from './MessengerAvatar'
import PinnedIcon from './PinnedIcon'
import { mt } from './messengerText'

const EMOJI_TOKEN_SOURCE = String.raw`\p{Regional_Indicator}{2}|(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\p{Emoji_Modifier})?)*)`
const EMOJI_SPLIT_REGEX = new RegExp(`(${EMOJI_TOKEN_SOURCE})`, 'gu')
const EMOJI_EXACT_REGEX = new RegExp(`^${EMOJI_TOKEN_SOURCE}$`, 'u')

const isEmojiToken = (value: string): boolean => EMOJI_EXACT_REGEX.test(value)

function renderPreviewText(value: string) {
  const parts = value.split(EMOJI_SPLIT_REGEX)

  return parts.map((part, index) => {
    if (!part) {
      return null
    }

    if (isEmojiToken(part)) {
      return (
        <span
          key={`preview-emoji-${index}`}
          style={{
            display: 'inline-block',
            verticalAlign: '-0.2em',
            margin: '0 0.04em',
          }}
        >
          <EmojiGlyph emoji={part} size={18} />
        </span>
      )
    }

    return <span key={`preview-text-${index}`}>{part}</span>
  })
}

interface ContactItemProps {
  item: ChatListItem
  isActive: boolean
  typingLabel?: string
  onClick: () => void
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void
}

export default function ContactItem({ item, isActive, typingLabel, onClick, onContextMenu }: ContactItemProps) {
  const hasUnread = item.unread > 0
  const mentionCount = item.chat.mentionCount ?? 0
  const hasMention = mentionCount > 0

  return (
    <button
      type="button"
      className="messenger-contact"
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        width: 'calc(100% - 20px)',
        maxWidth: 'calc(100% - 20px)',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: 'var(--contact-avatar, 54px) minmax(0, 1fr) auto',
        gridTemplateRows: 'minmax(20px, auto) minmax(20px, auto)',
        columnGap: 'var(--contact-gap, 14px)',
        rowGap: 3,
        alignItems: 'center',
        minHeight: 'var(--contact-height, 84px)',
        margin: '2px 10px',
        padding: 'var(--contact-padding, 13px 12px)',
        cursor: 'pointer',
        background: isActive ? '#EAF3FF' : 'transparent',
        border: '1px solid transparent',
        borderRadius: 12,
        textAlign: 'left',
        position: 'relative',
        boxShadow: isActive ? 'inset 0 0 0 1px rgba(47, 75, 226, 0.03)' : 'none',
        transition: 'background-color 0.16s ease, box-shadow 0.16s ease',
        fontFamily: '"Manrope", sans-serif',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      <div className="messenger-contact__avatar" style={{ gridRow: '1 / span 2' }}>
        <MessengerAvatar initials={item.avatar} imageUrl={item.avatarUrl} size={54} seed={item.seed} online={item.online} />
      </div>
      <div
        style={{
          alignSelf: 'end',
          fontSize: 'var(--contact-title-size, 16px)',
          fontWeight: hasUnread || isActive ? 700 : 600,
          color: '#0F172A',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
          lineHeight: '20px',
        }}
      >
        {item.title}
      </div>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          justifySelf: 'end',
          justifyContent: 'flex-end',
          whiteSpace: 'nowrap',
          alignSelf: 'end',
          minHeight: 20,
        }}
      >
        {item.chat.isPinned ? (
          <PinnedIcon
            size={13}
            color={isActive ? '#6675C5' : '#94A3B8'}
            style={{ opacity: 0.94 }}
          />
        ) : null}
        {item.chat.isMuted ? (
          <span title={mt('contactItem.t00')}>
            <MS name="notifications_off" size={14} color={isActive ? '#6675C5' : '#94A3B8'} />
          </span>
        ) : null}
        <div
          style={{
            fontSize: 11.5,
            color: isActive || hasUnread ? '#2458D3' : '#94A3B8',
            fontWeight: isActive || hasUnread ? 650 : 500,
            letterSpacing: 0,
            lineHeight: '20px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {item.time}
        </div>
      </div>
      <div
        style={{
          alignSelf: 'start',
          fontSize: 14,
          color: typingLabel ? '#2458D3' : isActive ? '#596985' : '#64748B',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          fontStyle: typingLabel ? 'italic' : 'normal',
          fontWeight: typingLabel ? 550 : 400,
          lineHeight: '20px',
          letterSpacing: 0,
        }}
      >
        {typingLabel ?? renderPreviewText(item.subtitle)}
      </div>
      {hasUnread || hasMention ? (
        <span
          style={{
            justifySelf: 'end',
            alignSelf: 'start',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 5,
            minHeight: 20,
          }}
        >
          {hasMention ? (
            <span
              title={mt('contactItem.t01')}
              style={{
                boxSizing: 'border-box',
                fontSize: 10.5,
                fontWeight: 700,
                lineHeight: '20px',
                background: isActive ? '#FFFFFF' : '#EEF2FF',
                color: '#4338CA',
                borderRadius: 999,
                padding: '0 6px',
                minWidth: 20,
                textAlign: 'center',
                boxShadow: isActive ? '0 1px 3px rgba(47, 75, 226, 0.08)' : 'none',
              }}
            >
              @{mentionCount > 99 ? '99+' : mentionCount}
            </span>
          ) : null}
          {hasUnread ? (
            <span
              style={{
                boxSizing: 'border-box',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: '20px',
                background: '#2458D3',
                color: '#FFFFFF',
                borderRadius: 999,
                padding: '0 6px',
                minWidth: 20,
                textAlign: 'center',
                boxShadow: isActive ? '0 2px 5px rgba(47, 75, 226, 0.2)' : 'none',
              }}
            >
              {item.unread > 99 ? '99+' : item.unread}
            </span>
          ) : null}
        </span>
      ) : (
        <span style={{ minHeight: 20 }} />
      )}
    </button>
  )
}
