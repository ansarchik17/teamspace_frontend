import type { ChatSearchResultItem } from './types'
import { SearchSnippet } from './ChatSearchPanel'
import MS from '../../../shared/ui/MaterialSymbol'
import { C } from '../../pages/dashboard/model/constants'
import { mt } from './messengerText'

interface Props {
  results: ChatSearchResultItem[]
  totalCount: number
  hasMore: boolean
  isLoading: boolean
  error: string
  onSelect: (item: ChatSearchResultItem) => void
  onLoadMore: () => void
}

export default function GlobalMessageSearchResults({ results, totalCount, hasMore, isLoading, error, onSelect, onLoadMore }: Props) {
  const chats = new Map<string, { item: ChatSearchResultItem; count: number }>()
  for (const item of results) {
    const key = `${item.chatType}:${item.chatId}`
    const found = chats.get(key)
    if (found) found.count += 1
    else chats.set(key, { item, count: 1 })
  }

  return <section aria-label={mt('globalMessageSearchResults.t00')} style={{ borderTop: `1px solid ${C.borderLight}`, padding: '12px 12px 16px' }}>
    <div style={{ padding: '0 4px 10px', color: C.inkMuted, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {mt('common.messages')}{totalCount > 0 ? ` · ${totalCount}` : ''}
    </div>
    {error ? <div role="alert" style={{ padding: 10, color: C.red, fontSize: 12 }}>{error}</div> : null}
    {!error && isLoading && chats.size === 0 ? <div style={{ padding: 10, color: C.inkMuted, fontSize: 12 }}>{mt('globalMessageSearchResults.t01')}</div> : null}
    {!error && !isLoading && chats.size === 0 ? <div style={{ padding: 10, color: C.inkMuted, fontSize: 12 }}>{mt('globalMessageSearchResults.t02')}</div> : null}
    <div style={{ display: 'grid', gap: 6 }}>
      {[...chats.values()].map(({ item, count }) => <button key={`${item.chatType}:${item.chatId}`} type="button" onClick={() => onSelect(item)} style={{ width: '100%', padding: '10px 12px', borderRadius: 14, border: `1px solid ${C.borderLight}`, background: '#F7FAFF', display: 'grid', gap: 5, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <MS name={item.chatType === 'group' ? 'groups' : item.chatType === 'channel' ? 'campaign' : 'chat_bubble'} size={16} color={C.blue} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.ink, fontSize: 13, fontWeight: 800 }}>{item.chatName || mt('globalMessageSearchResults.t03')}</span>
          {count > 1 ? <span style={{ fontSize: 11, color: C.blue, flexShrink: 0 }}>+{count - 1}</span> : null}
        </span>
        <span style={{ fontSize: 11, color: C.blue, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.senderLabel} · {item.timeLabel}</span>
        <span style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{item.highlightedSnippet || item.snippetText ? <SearchSnippet item={item} /> : item.attachmentName || item.typeLabel || mt('globalMessageSearchResults.t04')}</span>
      </button>)}
    </div>
    {hasMore ? <button type="button" disabled={isLoading} onClick={onLoadMore} style={{ display: 'block', margin: '12px auto 0', padding: '8px 14px', borderRadius: 10, border: `1px solid ${C.borderLight}`, background: '#FFFFFF', color: C.blue, fontSize: 12, fontWeight: 800, cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.6 : 1 }}>{isLoading ? mt('globalMessageSearchResults.t05') : mt('globalMessageSearchResults.t06')}</button> : null}
  </section>
}
