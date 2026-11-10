import { useState, useEffect, useRef } from 'react'
import type { ChannelView, ChannelMember, ChannelRole, UpdateChannelInput } from '../../../domain/entities/Channel'
import type { UserDirectoryUser } from '../../../infrastructure/repositories/HttpUserDirectoryRepository'
import MS from '../../../shared/ui/MaterialSymbol'
import { C } from '../../pages/dashboard/model/constants'
import MessengerAvatar from './MessengerAvatar'
import type { ChatListItem } from './types'
import { getInitials, getSeed } from './utils'
import AvatarLightbox from './AvatarLightbox'
import { mt } from './messengerText'

interface ChannelProfileModalProps {
  isOpen: boolean
  onClose: () => void
  activeChat: ChatListItem | null
  currentUserId: number | null
  channelView: ChannelView | null
  channelAdmins: ChannelMember[]
  channelMembers: ChannelMember[]
  memberCount: number
  isAdmin: boolean
  isOwner: boolean
  isSubscribed: boolean
  onSubscribe: () => void
  onUnsubscribe: () => void
  directoryUsers: UserDirectoryUser[]
  isSearchingUsers: boolean
  userSearchError: string
  onLoadDirectoryUsers: () => void
  onAddMembers: (userIds: number[]) => void
  onRemoveMember: (userId: number) => void
  onUpdateMemberRole: (userId: number, role: ChannelRole) => void
  onOpenUserProfile: (userId: number) => void
  onLoadMoreMembers?: () => void
  isLoadingMembers?: boolean
  isLoadingAdmins?: boolean
  onUpdateChannel: (input: UpdateChannelInput) => void
  onUpdateAvatar: (file: File) => Promise<void>
  membersError?: string
  isMuted?: boolean
  muteBusy?: boolean
  onToggleMute?: () => void
}

const TelegramMenuRow = ({
  label,
  value,
  icon,
  iconBg,
  onClick,
}: {
  label: string
  value?: string | number
  icon: string
  iconBg?: string
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    className="telegram-menu-row"
    style={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      outline: 'none',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: iconBg || C.blue,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MS name={icon} size={18} color="#FFFFFF" />
      </div>
      <div style={{ fontSize: 14, color: C.ink, fontWeight: 500 }}>{label}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {value !== undefined && <span style={{ fontSize: 14, color: C.inkMuted, fontWeight: 500 }}>{value}</span>}
      <MS name="chevron_right" size={18} color={C.inkMuted} />
    </div>
  </button>
)

export default function ChannelProfileModal({
  isOpen,
  onClose,
  activeChat,
  currentUserId,
  channelView,
  channelAdmins,
  channelMembers,
  memberCount,
  isAdmin,
  isOwner,
  isSubscribed,
  onSubscribe,
  onUnsubscribe,
  directoryUsers,
  isSearchingUsers,
  userSearchError,
  onLoadDirectoryUsers,
  onAddMembers,
  onRemoveMember,
  onUpdateMemberRole,
  onOpenUserProfile,
  onLoadMoreMembers,
  isLoadingMembers,
  isLoadingAdmins,
  onUpdateChannel,
  onUpdateAvatar,
  membersError,
  isMuted = false,
  muteBusy = false,
  onToggleMute,
}: ChannelProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'admins' | 'subscribers'>('info')
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [zoomedAvatar, setZoomedAvatar] = useState<{
    imageUrl?: string | null
    initials: string
    seed: number
    title: string
  } | null>(null)
  const [avatarError, setAvatarError] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && channelView && !isEditing) {
      setEditName(channelView.name)
      setEditDescription(channelView.description || '')
      setEditUsername(channelView.username || '')
    }
  }, [isOpen, channelView, isEditing])

  useEffect(() => {
    if (isAddMembersOpen && directoryUsers.length === 0) {
      onLoadDirectoryUsers()
    }
  }, [isAddMembersOpen, onLoadDirectoryUsers, directoryUsers.length])

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('info')
      setIsAddMembersOpen(false)
      setMemberSearch('')
      setIsEditing(false)
      setZoomedAvatar(null)
      setLinkCopied(false)
    }
  }, [isOpen])

  if (!isOpen || !activeChat) {
    return null
  }

  const existingMemberIds = new Set([
    ...channelAdmins.map((m) => m.userId),
    ...channelMembers.map((m) => m.userId),
  ])

  const filteredAvailableUsers = directoryUsers
    .filter((user) => !existingMemberIds.has(user.id))
    .filter((user) => {
      const query = memberSearch.trim().toLowerCase()
      if (!query) return true
      return [user.fullName, user.username, user.email].filter(Boolean).join(' ').toLowerCase().includes(query)
    })

  const renderBackHeader = (title: string, onBack: () => void) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '100px 1fr 100px',
        alignItems: 'center',
        padding: '14px 18px',
        background: '#F1F3F6',
        borderBottom: `1px solid ${C.borderLight}`,
      }}
    >
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 'none',
          color: C.blue,
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          padding: 0,
          outline: 'none',
        }}
      >
        <MS name="chevron_left" size={24} color={C.blue} />
        <span>{mt('channelProfileModal.t00')}</span>
      </button>
      <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: C.ink }}>{title}</div>
      <div />
    </div>
  )

  const renderMainInfo = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 1. Telegram-style Header Navigation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '100px 1fr 100px',
          alignItems: 'center',
          padding: '14px 18px',
          background: '#F1F3F6',
          borderBottom: '1px solid #E8EDF2',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: C.blue,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            outline: 'none',
          }}
        >
          <MS name="chevron_left" size={24} color={C.blue} />
          <span>{mt('channelProfileModal.t00')}</span>
        </button>
        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 700, color: C.ink }}>{mt('channelProfileModal.t01')}</div>
        <div style={{ textAlign: 'right' }}>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  onUpdateChannel({
                    name: editName,
                    description: editDescription,
                    username: editUsername,
                  })
                  setIsEditing(false)
                } else {
                  setIsEditing(true)
                }
              }}
              disabled={isUploadingAvatar}
              style={{
                background: 'transparent',
                border: 'none',
                color: isUploadingAvatar ? C.inkMuted : C.blue,
                fontSize: 15,
                fontWeight: 600,
                cursor: isUploadingAvatar ? 'default' : 'pointer',
                padding: 0,
                outline: 'none',
              }}
            >
              {isEditing ? (isUploadingAvatar ? mt('channelProfileModal.t02') : mt('channelProfileModal.t03')) : mt('channelProfileModal.t04')}
            </button>
          )}
        </div>
      </div>

      {/* 2. Scrollable Info Area */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="custom-profile-scroll">
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        {/* Profile Header Block */}
        <div style={{ display: 'grid', justifyItems: 'center', padding: '24px 24px 16px', background: '#F1F3F6' }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              disabled={isEditing}
              onClick={() => {
                if (!isEditing) {
                  setZoomedAvatar({
                    imageUrl: activeChat.avatarUrl,
                    initials: activeChat.avatar,
                    seed: activeChat.seed,
                    title: activeChat.title,
                  })
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: isEditing ? 'default' : 'pointer',
                borderRadius: '50%',
                outline: 'none',
                transition: 'transform 0.2s ease',
              }}
              onMouseEnter={(e) => { if (!isEditing) e.currentTarget.style.transform = 'scale(1.03)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              <MessengerAvatar initials={activeChat.avatar} imageUrl={activeChat.avatarUrl} size={96} seed={activeChat.seed} />
            </button>
            
            {isEditing && (
              <button
                type="button"
                onClick={() => !isUploadingAvatar && avatarInputRef.current?.click()}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.4)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {isUploadingAvatar ? (
                  <span style={{ color: '#FFFFFF', fontSize: 12 }}>...</span>
                ) : (
                  <MS name="photo_camera" size={28} color="#FFFFFF" />
                )}
              </button>
            )}
            <input
              type="file"
              ref={avatarInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                
                setIsUploadingAvatar(true)
                setAvatarError('')
                
                try {
                  await onUpdateAvatar(file)
                } catch (err) {
                  setAvatarError(err instanceof Error ? err.message : mt('channelProfileModal.t05'))
                } finally {
                  setIsUploadingAvatar(false)
                  if (e.target) e.target.value = ''
                }
              }}
            />
          </div>
          {avatarError && <div style={{ color: '#FF3B30', fontSize: 13, marginTop: 8 }}>{avatarError}</div>}
          
          {isEditing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={mt('channelProfileModal.t06')}
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: C.ink,
                background: '#FFFFFF',
                border: `1px solid ${C.borderLight}`,
                borderRadius: 12,
                padding: '8px 12px',
                width: '90%',
                maxWidth: 320,
                textAlign: 'center',
                outline: 'none',
                marginTop: 14,
              }}
            />
          ) : (
            <h2 style={{ marginTop: 14, fontSize: 20, fontWeight: 700, color: C.ink, textAlign: 'center' }}>{activeChat.title}</h2>
          )}
          <p style={{ marginTop: 4, fontSize: 13, color: C.inkMuted, fontWeight: 500 }}>
            {mt('channel.subscribers', { count: memberCount })}
          </p>
          
          {membersError && (
            <div style={{ marginTop: 12, color: '#FF3B30', fontSize: 13, textAlign: 'center', background: '#FF3B3010', padding: '6px 12px', borderRadius: 8 }}>
              {membersError}
            </div>
          )}
        </div>

        {/* 3. Notifications row card */}
        {onToggleMute && isSubscribed ? (
          <div
            style={{
              borderRadius: 20,
              overflow: 'hidden',
              background: '#FFFFFF',
              margin: '0 16px 16px',
              boxShadow: '0 2px 8px rgba(10,22,40,0.01)',
              border: `1px solid ${C.borderLight}`,
            }}
          >
            <button
              type="button"
              disabled={muteBusy}
              onClick={onToggleMute}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                cursor: muteBusy ? 'default' : 'pointer',
                outline: 'none',
                opacity: muteBusy ? 0.75 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <MS name={isMuted ? 'notifications_off' : 'notifications'} size={20} color={isMuted ? C.inkMuted : C.blue} />
                <span style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>
                  {isMuted ? mt('channelProfileModal.t09') : mt('channelProfileModal.t10')}
                </span>
              </div>
              <span style={{ fontSize: 14, color: C.inkMuted, fontWeight: 500 }}>{isMuted ? mt('channelProfileModal.t11') : mt('channelProfileModal.t12')}</span>
            </button>
          </div>
        ) : null}

        {/* 4. Link & Description Block Card */}
        <div
          style={{
            borderRadius: 20,
            overflow: 'hidden',
            background: '#FFFFFF',
            margin: '0 16px 16px',
            boxShadow: '0 2px 8px rgba(10,22,40,0.01)',
            border: `1px solid ${C.borderLight}`,
          }}
        >
          {/* Link field */}
          <div style={{ padding: '12px 16px', textAlign: 'left' }}>
            <span style={{ fontSize: 11, color: C.blue, fontWeight: 600, textTransform: 'lowercase' }}>{mt('channelProfileModal.t13')}</span>
            {isEditing && channelView?.type === 'public' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
                <span style={{ color: C.inkMuted, fontSize: 14 }}>/web/messenger/@</span>
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="username"
                  style={{
                    fontSize: 14,
                    color: C.blue,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    flex: 1,
                    padding: '2px 0',
                  }}
                />
              </div>
            ) : (
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginTop: 4 }}
                onClick={() => {
                  const handle = channelView?.username
                  const link = `${window.location.origin}/web/messenger/${handle ? `@${handle.replace(/^@/, '')}` : channelView?.id}`
                  void navigator.clipboard.writeText(link)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                }}
                title={mt('channelProfileModal.t14')}
              >
                <span style={{ fontSize: 14, color: C.blue, fontWeight: 500, wordBreak: 'break-all', lineHeight: 1.4 }}>
                  {`${window.location.origin}/web/messenger/${channelView?.username ? `@${channelView.username.replace(/^@/, '')}` : channelView?.id}`}
                </span>
                <MS name={linkCopied ? 'check' : 'content_copy'} size={18} color={linkCopied ? C.green : C.blue} style={{ flexShrink: 0, marginLeft: 12 }} />
              </div>
            )}
          </div>
          
          {/* Description field */}
          {(channelView?.description || isEditing) && (
            <>
              <div style={{ height: 1, background: C.borderLight, margin: '0 16px' }} />
              <div style={{ padding: '12px 16px', textAlign: 'left' }}>
                <span style={{ fontSize: 11, color: C.inkMuted, fontWeight: 600, textTransform: 'lowercase' }}>{mt('channelProfileModal.t15')}</span>
                <div style={{ marginTop: 4 }}>
                  {isEditing ? (
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder={mt('channelProfileModal.t16')}
                      style={{
                        fontSize: 14,
                        color: C.ink,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        resize: 'none',
                        minHeight: 80,
                        fontFamily: 'inherit',
                        lineHeight: 1.4,
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: 14, color: C.ink, whiteSpace: 'pre-wrap', lineHeight: '1.4', fontWeight: 500 }}>{channelView?.description}</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 5. Admins & Subscribers Card */}
        {isAdmin && (
          <div
            style={{
              borderRadius: 20,
              overflow: 'hidden',
              background: '#FFFFFF',
              margin: '0 16px 16px',
              boxShadow: '0 2px 8px rgba(10,22,40,0.01)',
              border: `1px solid ${C.borderLight}`,
            }}
          >
            <TelegramMenuRow
              label={mt('channelProfileModal.t17')}
              value={channelAdmins.length}
              icon="security"
              iconBg="#34C759"
              onClick={() => setActiveTab('admins')}
            />
            <div style={{ height: 1, background: C.borderLight, margin: '0 16px' }} />
            <TelegramMenuRow
              label={mt('channelProfileModal.t18')}
              value={memberCount}
              icon="group"
              iconBg="#007AFF"
              onClick={() => setActiveTab('subscribers')}
            />
          </div>
        )}

        {/* 6. Leave / Subscribe Card button */}
        <div style={{ margin: 'auto 16px 32px 16px' }}>
          {!isSubscribed ? (
            <button
              type="button"
              onClick={onSubscribe}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 20,
                border: 'none',
                background: C.blue,
                color: '#FFFFFF',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(47,75,226),0.15)',
                transition: 'transform 0.15s ease',
                outline: 'none',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)' }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {mt('channelProfileModal.t19')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onUnsubscribe}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 20,
                background: '#FFFFFF',
                color: '#FF3B30',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(10,22,40,0.02)',
                border: `1px solid ${C.borderLight}`,
                transition: 'transform 0.15s ease',
                outline: 'none',
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)' }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {mt('channelProfileModal.t20')}
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
  )

  const renderLists = () => {
    const list = activeTab === 'admins' ? channelAdmins : channelMembers
    const tabTitle = activeTab === 'admins' ? mt('channelProfileModal.t17') : mt('channelProfileModal.t18')

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F1F3F6' }}>
        {renderBackHeader(tabTitle, () => setActiveTab('info'))}

        <div style={{ flex: 1, overflowY: 'auto' }} className="custom-profile-scroll">
          {membersError && (
            <div style={{ padding: '12px 16px', color: '#FF3B30', fontSize: 13, textAlign: 'center' }}>
              {membersError}
            </div>
          )}
          {/* Add member button for admins inside list view */}
          {isAdmin && activeTab === 'subscribers' && (
            <div style={{ padding: '16px' }}>
              <button
                type="button"
                onClick={() => setIsAddMembersOpen(true)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: '#FFFFFF',
                  borderRadius: 20,
                  border: `1px solid ${C.borderLight}`,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(10,22,40,0.01)',
                  outline: 'none',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: C.blue,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MS name="person_add" size={18} color="#FFFFFF" />
                </div>
                <span style={{ fontSize: 14, color: C.blue, fontWeight: 600 }}>{mt('channelProfileModal.t21')}</span>
              </button>
            </div>
          )}

          {/* Members list inside Telegram-style white rounded card */}
          {list.length > 0 && (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 20,
                overflow: 'hidden',
                margin: '0 16px 16px',
                border: `1px solid ${C.borderLight}`,
              }}
            >
              {list.map((member, index) => {
                const isMe = member.userId === currentUserId
                const canChangeRole = isOwner && !isMe && member.role !== 'owner'
                const canRemove = !isMe && member.role !== 'owner' && (isOwner || (isAdmin && member.role === 'subscriber'))

                return (
                  <div key={member.userId}>
                    {index > 0 && <div style={{ height: 1, background: C.borderLight, margin: '0 16px' }} />}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 16px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setZoomedAvatar({
                            imageUrl: member.userAvatar,
                            initials: getInitials(member.userFullName || 'U'),
                            seed: getSeed(String(member.userId)),
                            title: member.userFullName || mt('channelProfileModal.t22'),
                          })
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          borderRadius: '50%',
                          outline: 'none',
                          transition: 'transform 0.2s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
                      >
                        <MessengerAvatar initials={getInitials(member.userFullName || 'U')} imageUrl={member.userAvatar} size={38} seed={getSeed(String(member.userId))} />
                      </button>
                      
                      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => onOpenUserProfile(member.userId)}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {member.userFullName || mt('channelProfileModal.t22')} {isMe && mt('channelProfileModal.t23')}
                        </div>
                        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                          {member.role === 'owner' ? mt('channelProfileModal.t24') : member.role === 'admin' ? mt('channelProfileModal.t25') : mt('channelProfileModal.t26')}
                        </div>
                      </div>

                      {canChangeRole && (
                        <button
                          type="button"
                          onClick={() => {
                            const newRole = member.role === 'admin' ? 'subscriber' : 'admin'
                            onUpdateMemberRole(member.userId, newRole)
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: C.blue,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          {member.role === 'admin' ? mt('channelProfileModal.t27') : mt('channelProfileModal.t28')}
                        </button>
                      )}

                      {canRemove && (
                        <button
                          type="button"
                          onClick={() => onRemoveMember(member.userId)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#FF3B30',
                            padding: 6,
                            cursor: 'pointer',
                            outline: 'none',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <MS name="person_remove" size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {(activeTab === 'subscribers' ? isLoadingMembers : isLoadingAdmins) && list.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: C.inkMuted, fontSize: 13 }}>{mt('channelProfileModal.t02')}</div>
          )}

          {activeTab === 'subscribers' && memberCount > list.length && onLoadMoreMembers && !isLoadingMembers && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button
                type="button"
                onClick={onLoadMoreMembers}
                style={{ background: 'transparent', border: 'none', color: C.blue, fontSize: 14, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
              >
                {mt('channelProfileModal.t29')}
              </button>
            </div>
          )}

          {activeTab === 'subscribers' && isLoadingMembers && list.length > 0 && (
            <div style={{ padding: 12, textAlign: 'center', color: C.inkMuted, fontSize: 13 }}>{mt('channelProfileModal.t02')}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes scaleUp {
          from {
            transform: scale(0.96);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-scale-up {
          animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .custom-profile-scroll::-webkit-scrollbar {
          width: 5px;
        }
        .custom-profile-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-profile-scroll::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 99px;
        }
        .custom-profile-scroll::-webkit-scrollbar-thumb:hover {
          background: #CBD5E1;
        }
        .telegram-menu-row {
          transition: background-color 0.2s ease;
        }
        .telegram-menu-row:hover {
          background-color: #F8FAFC !important;
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 560,
          background: 'rgba(10,22,40,0.18)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={onClose}
      >
        <div
          style={{
            width: 580,
            maxWidth: 'calc(100vw - 24px)',
            height: 'min(90vh, 840px)',
            background: '#F1F3F6',
            borderRadius: 24,
            boxShadow: '0 28px 80px rgba(10,22,40,0.16)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
          className="animate-scale-up"
          onClick={(event) => event.stopPropagation()}
        >
          {activeTab === 'info' ? renderMainInfo() : renderLists()}

          {/* Add Members Modal Overlay */}
          {isAddMembersOpen && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: '#F1F3F6',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  background: '#F1F3F6',
                  borderBottom: `1px solid ${C.borderLight}`,
                }}
              >
                <button
                  onClick={() => setIsAddMembersOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: C.blue, fontSize: 15, fontWeight: 600, cursor: 'pointer', outline: 'none' }}
                >
                  {mt('channelProfileModal.t30')}
                </button>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{mt('channelProfileModal.t31')}</span>
                <div style={{ width: 60 }} />
              </div>

              {/* Search bar inside Telegram-style white card wrapper */}
              <div style={{ padding: '16px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#FFFFFF',
                    borderRadius: 14,
                    padding: '8px 12px',
                    border: `1px solid ${C.borderLight}`,
                  }}
                >
                  <MS name="search" size={18} color={C.inkMuted} />
                  <input
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder={mt('channelProfileModal.t32')}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                      color: C.ink,
                    }}
                  />
                </div>
              </div>

              {/* User search list inside card container */}
              <div style={{ flex: 1, overflowY: 'auto' }} className="custom-profile-scroll">
                {userSearchError && (
                  <div style={{ padding: 16, textAlign: 'center', color: '#FF3B30', fontSize: 13, fontWeight: 600 }}>{userSearchError}</div>
                )}
                {isSearchingUsers ? (
                  <div style={{ padding: 20, textAlign: 'center', color: C.inkMuted, fontSize: 13 }}>{mt('channelProfileModal.t02')}</div>
                ) : filteredAvailableUsers.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: C.inkMuted, fontSize: 13 }}>{mt('channelProfileModal.t33')}</div>
                ) : (
                  <div
                    style={{
                      background: '#FFFFFF',
                      borderRadius: 20,
                      overflow: 'hidden',
                      margin: '0 16px 16px',
                      border: `1px solid ${C.borderLight}`,
                    }}
                  >
                    {filteredAvailableUsers.map((user, idx) => (
                      <div key={user.id}>
                        {idx > 0 && <div style={{ height: 1, background: C.borderLight, margin: '0 16px' }} />}
                        <button
                          type="button"
                          onClick={() => {
                            onAddMembers([user.id])
                            setIsAddMembersOpen(false)
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 16px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            outline: 'none',
                          }}
                        >
                          <MessengerAvatar initials={getInitials(user.fullName)} imageUrl={user.avatarUrl} size={38} seed={getSeed(String(user.id))} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.fullName}</div>
                          </div>
                          <MS name="add_circle" size={20} color={C.blue} style={{ flexShrink: 0 }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <AvatarLightbox
            isOpen={zoomedAvatar !== null}
            imageUrl={zoomedAvatar?.imageUrl}
            initials={zoomedAvatar?.initials ?? ''}
            seed={zoomedAvatar?.seed ?? 0}
            title={zoomedAvatar?.title ?? ''}
            onClose={() => setZoomedAvatar(null)}
          />
        </div>
      </div>
    </>
  )
}
