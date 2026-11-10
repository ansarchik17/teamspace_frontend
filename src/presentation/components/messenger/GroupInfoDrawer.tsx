import { useEffect, useMemo, useState } from 'react'
import type { ChatGroupDetails, ChatGroupMember } from '../../../domain/entities/Chat'
import { createPortal } from 'react-dom'
import type { UserDirectoryUser } from '../../../infrastructure/repositories/HttpUserDirectoryRepository'
import type { CalendarEvent, CreateCalendarEventPayload } from '../../../domain/entities/CalendarEvent'
import MS from '../../../shared/ui/MaterialSymbol'
import { C } from '../../pages/dashboard/model/constants'
import MessengerAvatar from './MessengerAvatar'
import type { ChatListItem, GroupSharedAttachmentItem } from './types'
import { getInitials, getSeed } from './utils'
import { mt } from './messengerText'
import { formatDate } from '../../../shared/i18n'

interface GroupInfoDrawerProps {
  isOpen: boolean
  onClose: () => void
  activeChat: ChatListItem | null
  currentUserId: number | null
  groupDetails: ChatGroupDetails | null
  groupMembers: ChatGroupMember[]
  groupMembersError: string
  groupMembersActionError: string
  isGroupMembersUpdating: boolean
  directoryUsers: UserDirectoryUser[]
  isSearchingUsers: boolean
  userSearchError: string
  onLoadDirectoryUsers: () => void
  onAddGroupMember: (userId: number) => void
  onOpenUserProfile: (userId: number) => void
  onRemoveGroupMember: (userId: number) => void
  onUpdateGroupMemberRole: (userId: number, role: 'member' | 'admin') => void
  onLeaveGroup: () => void
  onEditGroup?: () => void
  variant?: 'group' | 'personal'
  subtitle?: string
  peerUserId?: number | null
  isMuted?: boolean
  muteBusy?: boolean
  onToggleMute?: () => void
  onCall?: () => void
  events: CalendarEvent[]
  eventsError: string
  eventsLoading: boolean
  isCreatingEvent: boolean
  onCreateEvent: (payload: CreateCalendarEventPayload) => Promise<void> | void
  attachments: GroupSharedAttachmentItem[]
  onOpenAttachment: (attachment: GroupSharedAttachmentItem) => void
  onGoToMessage?: (messageId: string) => void
}

const toDateInputValue = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toTimeInputValue = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

const formatEventDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDate(date, { day: '2-digit', month: 'short' })
}

const formatEventTimeRange = (start: string, end: string): string => {
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return ''
  return `${formatDate(startDate, { hour: '2-digit', minute: '2-digit' })} - ${formatDate(endDate, { hour: '2-digit', minute: '2-digit' })}`
}

const formatGroupCreatedAt = (value?: string | null): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDate(date, { day: '2-digit', month: '2-digit', year: 'numeric' })
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

const formatAttachmentDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDate(date, { day: '2-digit', month: 'short' })
}

const formatAttachmentTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDate(date, { hour: '2-digit', minute: '2-digit' })
}

const resolveAttachmentIconName = (icon: GroupSharedAttachmentItem['icon']): string => {
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

const resolveAttachmentAccent = (icon: GroupSharedAttachmentItem['icon']): { color: string; background: string } => {
  switch (icon) {
    case 'pdf':
      return { color: '#F15B5D', background: '#FFF2F2' }
    case 'presentation':
      return { color: '#F59E0B', background: '#FFF7E8' }
    case 'excel':
      return { color: '#34C759', background: '#EFFCF3' }
    case 'word':
      return { color: '#2458D3', background: '#EEF4FF' }
    case 'archive':
      return { color: '#8B5CF6', background: '#F5F0FF' }
    case 'image':
      return { color: '#0EA5E9', background: '#EFF8FF' }
    case 'video':
      return { color: '#EC4899', background: '#FFF0F7' }
    case 'audio':
      return { color: '#14B8A6', background: '#ECFDF8' }
    default:
      return { color: '#94A3B8', background: '#F8FAFC' }
  }
}

const toAttachmentDisplayName = (rawName: string, kind?: string): string => {
  let name = (rawName || '').trim()
  const objectName = /[?&]object_name=([^&#]+)/.exec(name)?.[1]
  if (objectName) name = objectName
  try {
    name = decodeURIComponent(name)
  } catch {
    name = name.replace(/%2F/gi, '/')
  }
  name = name.split(/[?#]/)[0].split('/').filter(Boolean).pop() || ''
  if (!name || /^download$/i.test(name)) return kind === 'audio' ? mt('groupInfoDrawer.t00') : mt('groupInfoDrawer.t01')
  if (kind === 'audio' && /^\d{6,}[_-]/.test(name)) return mt('groupInfoDrawer.t02')
  return name
}

export default function GroupInfoDrawer({
  isOpen,
  onClose,
  activeChat,
  currentUserId,
  groupDetails,
  groupMembers,
  groupMembersError,
  groupMembersActionError,
  directoryUsers,
  isSearchingUsers,
  userSearchError,
  onLoadDirectoryUsers,
  onAddGroupMember,
  isGroupMembersUpdating,
  onOpenUserProfile,
  onRemoveGroupMember,
  onUpdateGroupMemberRole,
  onLeaveGroup,
  onEditGroup,
  variant = 'group',
  subtitle,
  peerUserId = null,
  isMuted = false,
  muteBusy = false,
  onToggleMute,
  onCall,
  events,
  eventsError,
  eventsLoading,
  isCreatingEvent,
  onCreateEvent,
  attachments,
  onOpenAttachment,
  onGoToMessage,
}: GroupInfoDrawerProps) {
  const now = useMemo(() => new Date(), [isOpen])
  const [activeTab, setActiveTab] = useState<'members' | 'media' | 'files' | 'events'>('members')
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dateValue, setDateValue] = useState(toDateInputValue(now))
  const [startTime, setStartTime] = useState(toTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0)))
  const [endTime, setEndTime] = useState(toTimeInputValue(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0)))
  const [location, setLocation] = useState('')
  const [isOnlineMeeting, setIsOnlineMeeting] = useState(true)
  const [formError, setFormError] = useState('')
  const [memberMenu, setMemberMenu] = useState<{ userId: number; x: number; y: number } | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<GroupSharedAttachmentItem | null>(null)
  const [removeMemberId, setRemoveMemberId] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('members')
      setIsAddMembersOpen(false)
      setShowCreateForm(false)
      setTitle('')
      setDescription('')
      setLocation('')
      setIsOnlineMeeting(true)
      setFormError('')
      setMemberMenu(null)
      setRemoveMemberId(null)
      setPreviewAttachment(null)
    }
  }, [isOpen])

  if (!isOpen || !activeChat) {
    return null
  }

  const isPersonal = variant === 'personal'
  const currentGroupMember = isPersonal ? null : groupMembers.find((member) => member.id === currentUserId) ?? null
  const canAddMembers = !isPersonal && (currentGroupMember?.role === 'owner' || currentGroupMember?.role === 'admin')
  const visibleTabs = isPersonal
    ? ([['media', mt('groupInfoDrawer.t03')], ['files', mt('groupInfoDrawer.t04')]] as const)
    : ([['members', mt('groupInfoDrawer.t05')], ['media', mt('groupInfoDrawer.t03')], ['files', mt('groupInfoDrawer.t04')], ['events', mt('groupInfoDrawer.t06')]] as const)
  const currentTab = visibleTabs.some(([value]) => value === activeTab) ? activeTab : visibleTabs[0][0]
  const existingMemberIds = new Set(groupMembers.map((member) => member.id))
  const memberSearchQuery = memberSearch.trim().toLowerCase()
  const availableUsers = directoryUsers
    .filter((user) => !existingMemberIds.has(user.id))
    .filter((user) => !memberSearchQuery || [user.fullName, user.username, user.email].filter(Boolean).join(' ').toLowerCase().includes(memberSearchQuery))
    .slice(0, 20)
  const menuMember = memberMenu ? groupMembers.find((member) => member.id === memberMenu.userId) : null
  const canChangeMenuRole = Boolean(menuMember && currentGroupMember?.role === 'owner' && menuMember.role !== 'owner' && menuMember.id !== currentUserId)
  const canRemoveMenuMember = Boolean(menuMember && menuMember.id !== currentUserId && menuMember.role !== 'owner' && (currentGroupMember?.role === 'owner' || (currentGroupMember?.role === 'admin' && menuMember.role === 'member')))
  const removeMember = removeMemberId === null ? null : groupMembers.find((member) => member.id === removeMemberId)
  const canConfirmRemoval = Boolean(removeMember && removeMember.id !== currentUserId && removeMember.role !== 'owner' && (currentGroupMember?.role === 'owner' || (currentGroupMember?.role === 'admin' && removeMember.role === 'member')))
  const mediaAttachments = attachments.filter((attachment) => attachment.kind === 'image' || attachment.kind === 'video')
  const fileAttachments = attachments.filter((attachment) => attachment.kind !== 'image' && attachment.kind !== 'video')

  const handleSubmit = async () => {
    setFormError('')
    if (!title.trim()) {
      setFormError(mt('groupInfoDrawer.t07'))
      return
    }

    const startIso = new Date(`${dateValue}T${startTime}:00`).toISOString()
    const endIso = new Date(`${dateValue}T${endTime}:00`).toISOString()
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setFormError(mt('groupInfoDrawer.t08'))
      return
    }

    await onCreateEvent({
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: startIso,
      endTime: endIso,
      isOnline: isOnlineMeeting,
      location: isOnlineMeeting ? mt('groupInfoDrawer.t09') : location.trim() || undefined,
      color: '#2458D3',
    })

    setShowCreateForm(false)
    setTitle('')
    setDescription('')
    setLocation('')
    setFormError('')
  }

  return (
    <>
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 620, background: 'transparent', display: 'flex', justifyContent: 'flex-end', padding: 12, boxSizing: 'border-box' }}
        onClick={onClose}
      >
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={isPersonal ? mt('groupInfoDrawer.t10') : mt('groupInfoDrawer.t11')}
          style={{ position: 'relative', width: 'clamp(300px, 44%, 400px)', maxWidth: '100%', minWidth: 0, flexShrink: 0, alignSelf: 'stretch', boxSizing: 'border-box', background: '#F5F7FB', border: '1px solid #E1E7F0', borderRadius: 20, boxShadow: '0 8px 28px rgba(10,22,40,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          onClick={(event) => event.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 6px', flexShrink: 0 }}>
            <button type="button" onClick={onClose} aria-label={mt('groupInfoDrawer.t12')} style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <MS name="close" size={24} color={C.ink} />
            </button>
            <div style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700, color: C.ink }}>{isPersonal ? mt('groupInfoDrawer.t10') : mt('groupInfoDrawer.t11')}</div>
            {canAddMembers && onEditGroup ? (
              <button type="button" onClick={onEditGroup} aria-label={mt('groupInfoDrawer.t13')} style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <MS name="edit" size={22} color={C.ink} />
              </button>
            ) : null}
          </div>

          <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', padding: '8px 12px 20px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignContent: 'start' }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 4, padding: '8px 0 12px', textAlign: 'center' }}>
              <MessengerAvatar initials={activeChat.avatar} imageUrl={activeChat.avatarUrl} size={96} seed={activeChat.seed} />
              <div style={{ marginTop: 12, maxWidth: '100%', fontSize: 20, fontWeight: 700, color: C.ink, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{activeChat.title}</div>
              <div style={{ fontSize: 15, color: C.inkMuted }}>{isPersonal ? subtitle : mt('common.members', { count: groupMembers.length })}</div>
              {isPersonal ? null : <div style={{ fontSize: 12, color: C.inkMuted }}>{mt('group.createdAt', { date: formatGroupCreatedAt(groupDetails?.createdAt) })}</div>}
              {groupDetails?.description ? <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: '#44556F', overflowWrap: 'anywhere' }}>{groupDetails.description}</div> : null}
            </div>

            <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #E5EAF3', padding: '4px 6px' }}>
              {onToggleMute ? (
                <button type="button" role="switch" aria-checked={!isMuted} disabled={muteBusy} onClick={onToggleMute} style={{ width: '100%', minHeight: 56, padding: '8px 10px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 16, cursor: muteBusy ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: muteBusy ? 0.7 : 1 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: C.red, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <MS name={isMuted ? 'notifications_off' : 'notifications'} size={19} color="#FFFFFF" />
                  </span>
                  <span style={{ flex: 1, fontSize: 16, color: C.ink }}>{mt('groupInfoDrawer.t14')}</span>
                  <span aria-hidden="true" style={{ width: 44, height: 26, borderRadius: 999, background: isMuted ? '#CBD5E1' : C.blue, position: 'relative', flexShrink: 0, transition: 'background 0.15s ease' }}>
                    <span style={{ position: 'absolute', top: 3, left: isMuted ? 3 : 21, width: 20, height: 20, borderRadius: 999, background: '#FFFFFF', transition: 'left 0.15s ease' }} />
                  </span>
                </button>
              ) : null}
              {isPersonal && typeof peerUserId === 'number' && peerUserId > 0 ? (
                <button type="button" onClick={() => onOpenUserProfile(peerUserId)} style={{ width: '100%', minHeight: 56, padding: '8px 10px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: C.inkMuted, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <MS name="person" size={19} color="#FFFFFF" />
                  </span>
                  <span style={{ flex: 1, fontSize: 16, color: C.ink }}>{mt('groupInfoDrawer.t15')}</span>
                </button>
              ) : null}
              {onCall ? (
                <button type="button" onClick={onCall} style={{ width: '100%', minHeight: 56, padding: '8px 10px', border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: C.blue, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <MS name="videocam" size={19} color="#FFFFFF" />
                  </span>
                  <span style={{ flex: 1, fontSize: 16, color: C.ink }}>{mt('groupInfoDrawer.t16')}</span>
                </button>
              ) : null}
            </div>

            <div role="tablist" aria-label={mt('groupInfoDrawer.t17')} style={{ display: 'flex', gap: 4, padding: 4, minHeight: 44, boxSizing: 'border-box', flexShrink: 0, flexWrap: 'wrap', minWidth: 0, borderRadius: 22, background: '#FFFFFF', border: '1px solid #E5EAF3', overflow: 'hidden' }}>
              {visibleTabs.map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={currentTab === value} onClick={() => setActiveTab(value)} style={{ flex: '1 1 auto', minWidth: 0, height: 34, padding: '0 10px', whiteSpace: 'nowrap', borderRadius: 999, border: 'none', background: currentTab === value ? '#EEF2FF' : 'transparent', color: currentTab === value ? C.blue : C.inkMuted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {label}
                </button>
              ))}
            </div>

            {currentTab === 'members' ? (
              <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #E5EAF3', padding: 8 }}>
              {canAddMembers && isAddMembersOpen ? (
                <div style={{ marginBottom: 14, padding: 12, borderRadius: 16, border: '1px solid #E5EAF3', background: '#F7F9FC' }}>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder={mt('groupInfoDrawer.t18')}
                    aria-label={mt('groupInfoDrawer.t19')}
                    style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 12, border: '1px solid #E5EAF3', background: '#FFFFFF', outline: 'none', fontSize: 14, color: C.ink, fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                  {userSearchError ? <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{userSearchError}</div> : null}
                  <div style={{ display: 'grid', gap: 6, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
                    {isSearchingUsers ? <div style={{ padding: 10, textAlign: 'center', color: C.inkMuted, fontSize: 13 }}>{mt('groupInfoDrawer.t20')}</div> : null}
                    {!isSearchingUsers && availableUsers.length === 0 ? <div style={{ padding: 10, textAlign: 'center', color: C.inkMuted, fontSize: 13 }}>{mt('groupInfoDrawer.t21')}</div> : null}
                    {availableUsers.map((user) => {
                      const title = user.fullName || user.username || `User ${user.id}`
                      return (
                        <button
                          key={user.id}
                          type="button"
                          disabled={isGroupMembersUpdating}
                          onClick={() => onAddGroupMember(user.id)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 12, border: '1px solid #E5EAF3', background: '#FFFFFF', cursor: isGroupMembersUpdating ? 'default' : 'pointer', opacity: isGroupMembersUpdating ? 0.68 : 1, textAlign: 'left', fontFamily: 'inherit' }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                            {user.email ? <span style={{ display: 'block', fontSize: 12, color: C.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</span> : null}
                          </span>
                          <MS name="add" size={18} color={C.blue} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {groupMembersError ? <div style={{ color: C.red, fontSize: 13 }}>{groupMembersError}</div> : null}
              {groupMembersActionError ? <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{groupMembersActionError}</div> : null}

              <div style={{ display: 'grid', gap: 2 }}>
                {groupMembers.map((member) => {
                  const title = member.fullName || member.username || `User ${member.id}`
                  const roleLabel = member.role === 'owner' ? mt('groupInfoDrawer.t22') : member.role === 'admin' ? mt('groupInfoDrawer.t23') : member.availabilityStatus || mt('groupInfoDrawer.t24')
                  const statusColor = member.availabilityStatus === 'online' ? '#22C55E' : member.availabilityStatus === 'busy' ? '#F59E0B' : '#CBD5E1'
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => onOpenUserProfile(member.id)}
                      onContextMenu={(event) => {
                        const canChangeRole = currentGroupMember?.role === 'owner' && member.role !== 'owner' && member.id !== currentUserId
                        const canRemove = member.id !== currentUserId && member.role !== 'owner' && (currentGroupMember?.role === 'owner' || (currentGroupMember?.role === 'admin' && member.role === 'member'))
                        if (!canChangeRole && !canRemove) return
                        event.preventDefault()
                        setMemberMenu({ userId: member.id, x: Math.max(12, Math.min(event.clientX, window.innerWidth - 260)), y: Math.max(12, Math.min(event.clientY, window.innerHeight - 140)) })
                      }}
                      style={{ padding: '8px 10px', borderRadius: 14, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      <MessengerAvatar initials={getInitials(title)} imageUrl={member.avatarUrl} size={44} seed={getSeed(title)} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: C.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{roleLabel}</div>
                      </div>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: statusColor, flexShrink: 0 }} />
                    </button>
                  )
                })}
              </div>
              </div>
            ) : null}

            {currentTab === 'media' ? (
              <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #E5EAF3', padding: 8 }}>
                {mediaAttachments.length === 0 ? <div style={{ padding: 8, fontSize: 14, color: C.inkMuted }}>{mt('groupInfoDrawer.t25')}</div> : null}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
                  {mediaAttachments.map((attachment) => (
                    <button key={attachment.id} type="button" onClick={() => setPreviewAttachment(attachment)} aria-label={attachment.name} style={{ aspectRatio: '1 / 1', padding: 0, border: 'none', borderRadius: 10, overflow: 'hidden', background: '#EEF2FF', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                      {attachment.kind === 'image' ? (
                        <img src={attachment.previewUrl || attachment.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <MS name="videocam" size={28} color={C.blue} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {currentTab === 'files' ? (
              <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #E5EAF3', padding: '8px 14px' }}>
              {fileAttachments.length === 0 ? <div style={{ padding: 8, fontSize: 14, color: C.inkMuted }}>{mt('groupInfoDrawer.t26')}</div> : null}

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                {fileAttachments.map((attachment) => {
                  const accent = resolveAttachmentAccent(attachment.icon)
                  const sizeLabel = formatAttachmentSize(attachment.size)
                  const timeLabel = formatAttachmentTime(attachment.createdAt)
                  const dateLabel = formatAttachmentDate(attachment.createdAt)
                  const meta = [sizeLabel, timeLabel || dateLabel].filter(Boolean).join(' • ')
                  return (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => setPreviewAttachment(attachment)}
                      style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px 0', border: 'none', background: 'transparent', display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      {attachment.kind === 'image' && attachment.previewUrl ? (
                        <img src={attachment.previewUrl} alt={attachment.name} style={{ width: 28, height: 28, borderRadius: 10, objectFit: 'cover', flexShrink: 0, background: '#EEF2FF', marginTop: 2 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: 10, background: accent.background, color: accent.color, display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2 }}>
                          <MS name={resolveAttachmentIconName(attachment.icon)} size={18} color="currentColor" />
                        </div>
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }} title={toAttachmentDisplayName(attachment.name, attachment.kind)}>{toAttachmentDisplayName(attachment.name, attachment.kind)}</div>
                        {meta ? <div style={{ marginTop: 2, fontSize: 11.5, fontWeight: 500, color: '#8A97AB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div> : null}
                      </div>
                    </button>
                  )
                })}
              </div>

              </div>
            ) : null}

            {currentTab === 'events' ? (
              <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #E5EAF3', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>{mt('groupInfoDrawer.t27')}</div>
                  <div style={{ marginTop: 4, fontSize: 12, color: C.inkMuted }}>{mt('groupInfoDrawer.t28')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateForm((prev) => !prev)}
                  style={{ height: 40, padding: '0 14px', borderRadius: 14, border: '1px solid #D9E2F3', background: showCreateForm ? '#EEF2FF' : '#FFFFFF', color: C.blue, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  <MS name={showCreateForm ? 'close' : 'event'} size={16} color="currentColor" />
                  {showCreateForm ? mt('groupInfoDrawer.t12') : mt('groupInfoDrawer.t29')}
                </button>
              </div>

              {showCreateForm ? (
                <div style={{ marginBottom: 14, padding: 14, borderRadius: 20, background: '#F7F9FD', border: '1px solid #E5EAF3', display: 'grid', gap: 12 }}>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={mt('groupInfoDrawer.t30')} style={{ height: 44, borderRadius: 14, border: '1px solid #D9E2F3', padding: '0 14px', fontSize: 14, outline: 'none' }} />
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={mt('groupInfoDrawer.t31')} rows={3} style={{ borderRadius: 14, border: '1px solid #D9E2F3', padding: '12px 14px', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} style={{ height: 44, borderRadius: 14, border: '1px solid #D9E2F3', padding: '0 14px', fontSize: 14, outline: 'none' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} style={{ height: 44, borderRadius: 14, border: '1px solid #D9E2F3', padding: '0 14px', fontSize: 14, outline: 'none' }} />
                      <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} style={{ height: 44, borderRadius: 14, border: '1px solid #D9E2F3', padding: '0 14px', fontSize: 14, outline: 'none' }} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700, color: C.ink }}>
                    <input type="checkbox" checked={isOnlineMeeting} onChange={(event) => setIsOnlineMeeting(event.target.checked)} />
                    {mt('groupInfoDrawer.t32')}
                  </label>
                  {!isOnlineMeeting ? (
                    <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder={mt('groupInfoDrawer.t33')} style={{ height: 44, borderRadius: 14, border: '1px solid #D9E2F3', padding: '0 14px', fontSize: 14, outline: 'none' }} />
                  ) : null}
                  <div style={{ fontSize: 12, color: C.inkMuted }}>{mt('groupInfoDrawer.t34')}</div>
                  {formError ? <div style={{ fontSize: 12, color: C.red }}>{formError}</div> : null}
                  <button type="button" disabled={isCreatingEvent} onClick={() => void handleSubmit()} style={{ height: 46, borderRadius: 16, border: 'none', background: 'linear-gradient(135deg, #2458D3 0%, #5B6CF7 100%)', color: '#FFFFFF', fontSize: 14, fontWeight: 800, cursor: 'pointer', opacity: isCreatingEvent ? 0.75 : 1 }}>
                    {isCreatingEvent ? mt('groupInfoDrawer.t35') : mt('groupInfoDrawer.t36')}
                  </button>
                </div>
              ) : null}

              {eventsError ? <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{eventsError}</div> : null}
              {eventsLoading ? <div style={{ fontSize: 13, color: C.inkMuted }}>{mt('groupInfoDrawer.t37')}</div> : null}
              {!eventsLoading && events.length === 0 ? <div style={{ fontSize: 13, color: C.inkMuted }}>{mt('groupInfoDrawer.t38')}</div> : null}

              <div style={{ display: 'grid', gap: 10 }}>
                {events.map((event) => (
                  <div key={event.id} style={{ display: 'grid', gridTemplateColumns: '58px minmax(0, 1fr)', gap: 12, alignItems: 'stretch', padding: '12px 14px', borderRadius: 18, border: '1px solid #E7ECF5', background: '#FBFCFE' }}>
                    <div style={{ borderRadius: 16, background: '#EEF2FF', color: C.blue, display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 800 }}>{formatEventDate(event.startTime)}</div>
                      <MS name="event" size={18} color="currentColor" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{event.title}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: C.inkMuted }}>{formatEventTimeRange(event.startTime, event.endTime)}</div>
                      <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: '#F3F6FB', fontSize: 11, fontWeight: 700, color: C.inkMuted }}>
                          <MS name={event.isOnline ? 'videocam' : 'location_on'} size={14} color="currentColor" />
                          {event.isOnline ? mt('groupInfoDrawer.t09') : event.location || mt('groupInfoDrawer.t39')}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: '#F3F6FB', fontSize: 11, fontWeight: 700, color: C.inkMuted }}>
                          <MS name="groups" size={14} color="currentColor" />
                          {mt('common.members', { count: event.attendeesCount })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            ) : null}

            {currentTab === 'members' ? (
              <>
            {currentGroupMember && currentGroupMember.role !== 'owner' ? (
              <button type="button" disabled={isGroupMembersUpdating} onClick={onLeaveGroup} style={{ height: 48, borderRadius: 18, border: '1px solid #F3C7CC', background: '#FFF5F5', color: C.red, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                {mt('groupInfoDrawer.t40')}
              </button>
            ) : null}
              </>
            ) : null}
          </div>

          {canAddMembers && currentTab === 'members' ? (
            <button
              type="button"
              aria-label={isAddMembersOpen ? mt('groupInfoDrawer.t41') : mt('groupInfoDrawer.t42')}
              onClick={() => {
                if (!isAddMembersOpen && directoryUsers.length === 0) onLoadDirectoryUsers()
                setIsAddMembersOpen((prev) => !prev)
              }}
              style={{ position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 999, border: 'none', background: C.blue, boxShadow: '0 10px 24px rgba(47,75,226,0.32)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            >
              <MS name={isAddMembersOpen ? 'close' : 'person_add'} size={24} color="#FFFFFF" />
            </button>
          ) : null}
        </aside>
      </div>
      {previewAttachment ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={previewAttachment.name}
          style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(10,16,28,0.88)', display: 'flex', flexDirection: 'column' }}
          onClick={() => setPreviewAttachment(null)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toAttachmentDisplayName(previewAttachment.name, previewAttachment.kind)}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[previewAttachment.senderLabel, formatAttachmentDate(previewAttachment.createdAt), formatAttachmentTime(previewAttachment.createdAt), formatAttachmentSize(previewAttachment.size)].filter(Boolean).join(' · ')}
              </div>
            </div>
            {onGoToMessage ? (
              <button type="button" onClick={() => { const messageId = previewAttachment.messageId; setPreviewAttachment(null); onGoToMessage(messageId) }} style={{ height: 38, padding: '0 14px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', flexShrink: 0 }}>
                <MS name="forum" size={17} color="#FFFFFF" />
                {mt('groupInfoDrawer.t43')}
              </button>
            ) : null}
            <button type="button" onClick={() => onOpenAttachment(previewAttachment)} style={{ height: 38, padding: '0 14px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', flexShrink: 0 }}>
              <MS name="download" size={17} color="#FFFFFF" />
              {mt('groupInfoDrawer.t44')}
            </button>
            <button type="button" onClick={() => setPreviewAttachment(null)} aria-label={mt('groupInfoDrawer.t12')} style={{ width: 38, height: 38, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.14)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <MS name="close" size={20} color="#FFFFFF" />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px 24px' }}>
            {previewAttachment.kind === 'image' ? (
              <img src={previewAttachment.url} alt={previewAttachment.name} onClick={(event) => event.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
            ) : previewAttachment.kind === 'video' ? (
              <video src={previewAttachment.url} controls onClick={(event) => event.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, background: '#000000' }} />
            ) : (
              <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(420px, 100%)', padding: 28, borderRadius: 20, background: '#FFFFFF', display: 'grid', justifyItems: 'center', gap: 12, textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, display: 'grid', placeItems: 'center', background: resolveAttachmentAccent(previewAttachment.icon).background, color: resolveAttachmentAccent(previewAttachment.icon).color }}>
                  <MS name={resolveAttachmentIconName(previewAttachment.icon)} size={36} color="currentColor" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, overflowWrap: 'anywhere' }}>{toAttachmentDisplayName(previewAttachment.name, previewAttachment.kind)}</div>
                <div style={{ fontSize: 13, color: C.inkMuted }}>{[previewAttachment.ext?.toUpperCase(), formatAttachmentSize(previewAttachment.size)].filter(Boolean).join(' · ')}</div>
                {previewAttachment.kind === 'audio' ? <audio src={previewAttachment.url} controls preload="none" style={{ width: '100%' }} /> : null}
              </div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
      {memberMenu && menuMember && (canChangeMenuRole || canRemoveMenuMember) ? createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200 }} onClick={() => setMemberMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMemberMenu(null) }}>
          <div role="menu" aria-label={mt('group.memberActions', { name: menuMember.fullName || menuMember.username || menuMember.id })} style={{ position: 'fixed', left: memberMenu.x, top: memberMenu.y, width: 240, padding: 6, borderRadius: 14, background: '#FFFFFF', border: '1px solid #E1E7F0', boxShadow: '0 18px 42px rgba(31,45,72,0.18)' }} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') setMemberMenu(null) }}>
            {canChangeMenuRole ? <button type="button" role="menuitem" disabled={isGroupMembersUpdating} onClick={() => { onUpdateGroupMemberRole(menuMember.id, menuMember.role === 'admin' ? 'member' : 'admin'); setMemberMenu(null) }} style={{ width: '100%', padding: '10px 12px', border: 0, borderRadius: 9, background: 'transparent', color: C.ink, fontSize: 13, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}>
              {menuMember.role === 'admin' ? mt('groupInfoDrawer.t45') : mt('groupInfoDrawer.t46')}
            </button> : null}
            {canRemoveMenuMember ? <button type="button" role="menuitem" disabled={isGroupMembersUpdating} onClick={() => { setRemoveMemberId(menuMember.id); setMemberMenu(null) }} style={{ width: '100%', padding: '10px 12px', border: 0, borderRadius: 9, background: 'transparent', color: C.red, fontSize: 13, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }}>
              {mt('groupInfoDrawer.t47')}
            </button> : null}
          </div>
        </div>, document.body,
      ) : null}
      {removeMember && canConfirmRemoval ? createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(10,22,40,0.42)', backdropFilter: 'blur(3px)' }} onClick={() => setRemoveMemberId(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="remove-group-member-title" aria-describedby="remove-group-member-description" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === 'Escape') setRemoveMemberId(null) }} onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 430, padding: 24, borderRadius: 22, background: '#FFFFFF', border: '1px solid #E5EAF3', boxShadow: '0 24px 64px rgba(10,22,40,0.22)', fontFamily: '"Manrope", sans-serif' }}>
            <div id="remove-group-member-title" style={{ fontSize: 20, fontWeight: 800, color: C.ink }}>{mt('groupInfoDrawer.t48')}</div>
            <div id="remove-group-member-description" style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5, color: C.inkMuted }}>{mt('group.removeConfirm', { name: removeMember.fullName || removeMember.username || mt('group.memberN', { id: removeMember.id }) })}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button type="button" onClick={() => setRemoveMemberId(null)} style={{ height: 42, padding: '0 18px', borderRadius: 11, border: '1px solid #E1E7F0', background: '#FFFFFF', color: C.inkMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{mt('groupInfoDrawer.t49')}</button>
              <button type="button" disabled={isGroupMembersUpdating} onClick={() => { onRemoveGroupMember(removeMember.id); setRemoveMemberId(null) }} style={{ height: 42, padding: '0 18px', borderRadius: 11, border: 'none', background: C.red, color: '#FFFFFF', fontSize: 13, fontWeight: 800, cursor: isGroupMembersUpdating ? 'default' : 'pointer', opacity: isGroupMembersUpdating ? 0.6 : 1 }}>{mt('groupInfoDrawer.t50')}</button>
            </div>
          </div>
        </div>, document.body,
      ) : null}
    </>
  )
}



