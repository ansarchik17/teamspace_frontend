import MS from '../../../shared/ui/MaterialSymbol'
import { C } from '../../pages/dashboard/model/constants'
import MessengerAvatar from './MessengerAvatar'
import type { ChatSearchResultItem } from './types'
import type { ChatAttachmentStats, ChatAttachmentTypeFilter } from '../../../domain/entities/Chat'
import { getInitials, getSeed } from './utils'
import { mt } from './messengerText'

const MARK_SPLIT_REGEX = /(⟦.*?⟧)/g

const ATTACHMENT_TYPE_FILTERS: Array<{ value: ChatAttachmentTypeFilter; label: string }> = [
  { value: 'all', get label() { return mt('chatSearchPanel.t00') } },
  { value: 'image', get label() { return mt('chatSearchPanel.t01') } },
  { value: 'video', get label() { return mt('chatSearchPanel.t02') } },
  { value: 'file', get label() { return mt('chatSearchPanel.t03') } },
  { value: 'audio', get label() { return mt('chatSearchPanel.t04') } },
  { value: 'voice', get label() { return mt('chatSearchPanel.t05') } },
]

const getTypeBadgeConfig = (item: ChatSearchResultItem): { icon: string; label: string } | null => {
  if (!item.typeLabel) {
    return null
  }

  switch (item.view.kind) {
    case 'image':
      return { icon: 'image', label: item.typeLabel }
    case 'video':
    case 'video_message':
      return { icon: 'videocam', label: item.typeLabel }
    case 'audio':
    case 'voice':
      return { icon: 'mic', label: item.typeLabel }
    case 'file':
      return { icon: 'folder', label: item.typeLabel }
    default:
      return { icon: 'description', label: item.typeLabel }
  }
}

export function SearchSnippet({ item }: { item: ChatSearchResultItem }) {
  if (!item.highlightedSnippet) {
    return <span>{item.snippetText}</span>
  }

  const parts = item.highlightedSnippet.split(MARK_SPLIT_REGEX)

  return (
    <>
      {parts.map((part, index) => {
        if (!part) {
          return null
        }

        if (part.startsWith('⟦') && part.endsWith('⟧')) {
          return (
            <mark
              key={`search-mark-${index}`}
              style={{
                background: '#DCEBFF',
                color: C.blueDark,
                padding: '0 2px',
                borderRadius: 4,
                fontWeight: 700,
              }}
            >
              {part.slice(1, -1)}
            </mark>
          )
        }

        return <span key={`search-text-${index}`}>{part}</span>
      })}
    </>
  )
}

interface ChatSearchPanelProps {
  query: string
  resultCount: number
  results: ChatSearchResultItem[]
  isLoading: boolean
  error: string
  info: string
  selectedResultId: string | null
  attachmentType: ChatAttachmentTypeFilter
  attachmentStats: ChatAttachmentStats | null
  onChangeAttachmentType: (value: ChatAttachmentTypeFilter) => void
  onChangeQuery: (value: string) => void
  onClose: () => void
  embedded?: boolean
  onSelectResult: (item: ChatSearchResultItem) => void
}

export default function ChatSearchPanel({
  query,
  resultCount,
  results,
  isLoading,
  error,
  info,
  selectedResultId,
  attachmentType,
  attachmentStats,
  onChangeAttachmentType,
  onChangeQuery,
  onClose,
  embedded = false,
  onSelectResult,
}: ChatSearchPanelProps) {
  const normalizedQuery = query.trim()
  const isFilterActive = attachmentType !== 'all'
  const isReadyToSearch = normalizedQuery.length >= 2 || isFilterActive

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        maxHeight: '75%',
        borderBottom: `1px solid ${C.borderLight}`,
        background: '#FFFFFF',
        boxShadow: '0 10px 24px rgba(10,22,40,0.08)',
        overflow: 'hidden',
        zIndex: 6,
        display: 'flex',
        flexDirection: 'column',
      }}
      data-no-message-select="true"
    >
      {embedded ? null : (
      <div
        style={{
          padding: '10px 14px',
          background: '#FFFFFF',
          display: 'grid',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: 44,
            borderRadius: 16,
            border: `1px solid ${C.border}`,
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFF 100%)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
          }}
        >
          <MS name="search" size={16} color={C.inkMuted} />
          <input
            type="search"
            name="chat_message_search"
            autoComplete="off"
            value={query}
            onChange={(event) => onChangeQuery(event.target.value)}
            placeholder={mt('chatSearchPanel.t06')}
            autoFocus
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: C.ink,
              fontSize: 14,
              fontFamily: '"Manrope", sans-serif',
            }}
          />
        </div>
          {isReadyToSearch ? <span style={{ fontSize: 12, color: C.inkMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>{isLoading ? mt('chatSearchPanel.t07') : mt('search.found', { count: resultCount })}</span> : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={mt('chatSearchPanel.t08')}
            style={{ width: 36, height: 36, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <MS name="close" size={20} color={C.inkMuted} />
          </button>
        </div>

        <div role="group" aria-label={mt('chatSearchPanel.t09')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ATTACHMENT_TYPE_FILTERS.map((option) => {
            const selected = option.value === attachmentType
            const count = option.value === 'all' ? attachmentStats?.totalFiles : attachmentStats?.stats[option.value]
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChangeAttachmentType(option.value)}
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 999,
                  border: `1px solid ${selected ? C.blue : C.borderLight}`,
                  background: selected ? C.blue : '#FFFFFF',
                  color: selected ? '#FFFFFF' : C.inkMuted,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {option.label}
                {option.value !== 'all' && typeof count === 'number' ? ` ${count}` : ''}
              </button>
            )
          })}
        </div>

        {info ? (
          <div
            style={{
              borderRadius: 14,
              border: `1px solid ${C.borderLight}`,
              background: '#F7FAFF',
              color: C.inkMuted,
              fontSize: 12,
              lineHeight: 1.45,
              padding: '10px 12px',
            }}
          >
            {info}
          </div>
        ) : null}
      </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, display: isReadyToSearch || error ? 'grid' : 'none', gap: 10 }}>
        {error ? (
          <div
            style={{
              borderRadius: 16,
              border: `1px solid ${C.red}22`,
              background: '#FFF7F7',
              color: C.red,
              fontSize: 12,
              lineHeight: 1.5,
              padding: '12px 14px',
            }}
          >
            {error}
          </div>
        ) : null}

        {!error && !normalizedQuery && !isFilterActive ? (
          <div
            style={{
              margin: 'auto 0',
              display: 'grid',
              justifyItems: 'center',
              gap: 12,
              padding: '24px 18px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: 22,
                background: 'linear-gradient(135deg, #EEF4FF 0%, #E2ECFF 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MS name="search" size={28} color={C.blue} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>{mt('chatSearchPanel.t10')}</div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: C.inkMuted, maxWidth: 260 }}>
              {mt('chatSearchPanel.t11')}
            </div>
          </div>
        ) : null}

        {!error && normalizedQuery.length > 0 && normalizedQuery.length < 2 ? (
          <div
            style={{
              borderRadius: 16,
              border: `1px solid ${C.borderLight}`,
              background: '#FFFFFF',
              color: C.inkMuted,
              fontSize: 12,
              lineHeight: 1.5,
              padding: '12px 14px',
            }}
          >
            {mt('chatSearchPanel.t12')}
          </div>
        ) : null}

        {isLoading && isReadyToSearch
          ? Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`search-skeleton-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '46px minmax(0, 1fr)',
                  gap: 12,
                  alignItems: 'start',
                  padding: 12,
                  borderRadius: 18,
                  border: `1px solid ${C.borderLight}`,
                  background: '#FFFFFF',
                }}
              >
                <div style={{ width: 46, height: 46, borderRadius: 23, background: '#EEF3FA' }} />
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ width: '44%', height: 12, borderRadius: 999, background: '#EEF3FA' }} />
                    <div style={{ width: 52, height: 12, borderRadius: 999, background: '#EEF3FA' }} />
                  </div>
                  <div style={{ width: '100%', height: 12, borderRadius: 999, background: '#F3F6FB' }} />
                  <div style={{ width: '68%', height: 12, borderRadius: 999, background: '#F3F6FB' }} />
                </div>
              </div>
            ))
          : null}

        {!error && !isLoading && isReadyToSearch && results.length === 0 ? (
          <div
            style={{
              margin: 'auto 0',
              display: 'grid',
              justifyItems: 'center',
              gap: 10,
              padding: '24px 18px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 20,
                background: '#F5F8FD',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MS name="search" size={24} color={C.inkMuted} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{mt('chatSearchPanel.t13')}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: C.inkMuted, maxWidth: 260 }}>
              {mt('chatSearchPanel.t14')}
            </div>
          </div>
        ) : null}

        {!error &&
          !isLoading &&
          isReadyToSearch &&
          results.map((item) => {
            const isSelected = selectedResultId === item.raw.id
            const typeBadge = getTypeBadgeConfig(item)
            const avatarLabel = getInitials(item.senderLabel)
            const avatarUrl = item.raw.senderAvatar ?? null

            return (
              <button
                key={item.raw.id}
                type="button"
                onClick={() => onSelectResult(item)}
                style={{
                  width: '100%',
                  border: `1px solid ${isSelected ? `${C.blue}33` : C.borderLight}`,
                  background: isSelected ? 'linear-gradient(135deg, #EEF5FF 0%, #E3EEFF 100%)' : '#FFFFFF',
                  borderRadius: 18,
                  padding: 12,
                  display: 'grid',
                  gridTemplateColumns: '46px minmax(0, 1fr)',
                  gap: 12,
                  alignItems: 'start',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: isSelected ? '0 16px 34px rgba(47,75,226),0.14)' : '0 4px 14px rgba(10,22,40,0.04)',
                }}
              >
                <MessengerAvatar initials={avatarLabel} imageUrl={avatarUrl} size={46} seed={getSeed(item.senderLabel)} />
                <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: C.ink,
                        lineHeight: 1.25,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.senderLabel}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: isSelected ? '#5C83B4' : C.inkMuted,
                        fontWeight: 600,
                        flexShrink: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {item.timeLabel}
                    </div>
                  </div>

                  <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.chatName || mt('chatSearchPanel.t15')}
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: C.inkSub,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                    }}
                  >
                    <SearchSnippet item={item} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {typeBadge ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          height: 26,
                          borderRadius: 999,
                          padding: '0 10px',
                          background: '#EEF2FF',
                          color: C.inkMuted,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        <MS name={typeBadge.icon} size={13} color={C.inkMuted} />
                        {typeBadge.label}
                      </span>
                    ) : (
                      <span />
                    )}

                    {isSelected ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.blue,
                        }}
                      >
                        {mt('chatSearchPanel.t16')}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )
}
