import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatSharedMediaItem } from '../../../domain/entities/Chat'
import type { ChatRepository } from '../../../domain/repositories/ChatRepository'
import MS from '../../../shared/ui/MaterialSymbol'
import { mt } from './messengerText'
import { formatDate } from '../../../shared/i18n'

const PAGE_SIZE = 30

interface Props {
  chatId: string
  chatType: 'personal' | 'group'
  chatTitle: string
  repository: ChatRepository
  onClose: () => void
}

export default function SharedMediaDialog({ chatId, chatType, chatTitle, repository, onClose }: Props) {
  const [items, setItems] = useState<ChatSharedMediaItem[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    setItems([])
    setLoading(true)
    setError('')
    void repository.getSharedMedia(chatId, chatType, { limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (cancelled) return
        setItems(page.items)
        setTotal(page.total)
        setHasMore(page.hasMore)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : mt('sharedMediaDialog.t00'))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [chatId, chatType, repository, reload])

  const loadMore = async () => {
    if (loading || !hasMore) return
    setLoading(true)
    setError('')
    try {
      const page = await repository.getSharedMedia(chatId, chatType, { limit: PAGE_SIZE, offset: items.length })
      setItems((previous) => [...previous, ...page.items])
      setTotal(page.total)
      setHasMore(page.hasMore)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : mt('sharedMediaDialog.t00'))
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(10,22,40,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-label={mt('media.of', { name: chatTitle })} onClick={(event) => event.stopPropagation()} style={{ width: 'min(760px, 100%)', maxHeight: 'min(760px, 90vh)', overflow: 'auto', background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 24px 70px rgba(0,0,0,.2)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{mt('sharedMediaDialog.t01')}</h2>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 3 }}>{chatTitle} · {total}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={mt('sharedMediaDialog.t02')} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 6 }}><MS name="close" size={22} /></button>
        </header>
        {items.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 10 }}>
            {items.map((item) => (
              <a key={item.messageId} href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" title={`${item.senderName} · ${formatDate(item.sentAt, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`} style={{ display: 'block', aspectRatio: '1', overflow: 'hidden', borderRadius: 12, background: '#eef2f7', position: 'relative' }}>
                {item.type === 'image' ? <img src={item.attachmentUrl} alt={mt('media.photoFrom', { name: item.senderName })} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <video src={item.attachmentUrl} preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                {item.type === 'video' ? <span style={{ position: 'absolute', bottom: 8, right: 8, background: '#0009', color: '#fff', borderRadius: 6, padding: 3 }}><MS name="play_arrow" size={20} /></span> : null}
              </a>
            ))}
          </div>
        ) : !loading && !error ? <p style={{ color: '#64748b' }}>{mt('sharedMediaDialog.t03')}</p> : null}
        {error ? <p role="alert" style={{ color: '#dc2626' }}>{error} <button type="button" onClick={() => items.length ? void loadMore() : setReload((value) => value + 1)}>{mt('sharedMediaDialog.t04')}</button></p> : null}
        {loading ? <p style={{ color: '#64748b' }}>{mt('sharedMediaDialog.t05')}</p> : null}
        {hasMore && !loading ? <button type="button" onClick={() => void loadMore()} style={{ display: 'block', margin: '20px auto 0', padding: '9px 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>{mt('sharedMediaDialog.t06')}</button> : null}
      </section>
    </div>,
    document.body,
  )
}
