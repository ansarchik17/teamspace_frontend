import { useState, type CSSProperties } from 'react'
import type { ChatGroupMember } from '../../../domain/entities/Chat'
import type { UserDirectoryUser } from '../../../infrastructure/repositories/HttpUserDirectoryRepository'
import MS from '../../../shared/ui/MaterialSymbol'
import { C } from '../../pages/dashboard/model/constants'
import MessengerAvatar from './MessengerAvatar'
import type { ChatListItem } from './types'
import { getInitials, getSeed } from './utils'
import { mt } from './messengerText'

interface InfoPanelProps {
  activeChat: ChatListItem | null
  currentUserId: number | null
  activePeerId: number | null
  groupMembers: ChatGroupMember[]
  groupMembersError: string
  groupMembersActionError: string
  isGroupMembersUpdating: boolean
  directoryUsers: UserDirectoryUser[]
  isSearchingUsers: boolean
  userSearchError: string
  onLoadDirectoryUsers: () => void
  onAddGroupMember: (userId: number) => void
  onRemoveGroupMember: (userId: number) => void
  onUpdateGroupMemberRole: (userId: number, role: 'member' | 'admin') => void
  onLeaveGroup: () => void
  onOpenUserProfile: (userId: number) => void
  onClose: () => void
  isMobile?: boolean
  groupDescription?: string | null
  isMuted?: boolean
  muteBusy?: boolean
  onToggleMute?: () => void
}

const cardStyle: CSSProperties = {
  overflow: 'hidden',
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  background: C.surface,
  boxShadow: '0 8px 28px rgba(15, 30, 70, 0.045)',
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 800,
  color: C.ink,
  letterSpacing: '-0.01em',
}

const smallButtonStyle: CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.inkSub,
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

function getMemberRoleLabel(role: ChatGroupMember['role']) {
  if (role === 'owner') return mt('infoPanel.t00')
  if (role === 'admin') return mt('infoPanel.t01')
  return mt('infoPanel.t02')
}

export default function InfoPanel({
  activeChat,
  currentUserId,
  activePeerId,
  groupMembers,
  groupMembersError,
  groupMembersActionError,
  isGroupMembersUpdating,
  directoryUsers,
  isSearchingUsers,
  userSearchError,
  onLoadDirectoryUsers,
  onAddGroupMember,
  onRemoveGroupMember,
  onUpdateGroupMemberRole,
  onLeaveGroup,
  onOpenUserProfile,
  onClose,
  isMobile = false,
  groupDescription = null,
  isMuted = false,
  muteBusy = false,
  onToggleMute,
}: InfoPanelProps) {
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')

  if (!activeChat) {
    return null
  }

  const currentGroupMember = groupMembers.find((member) => member.id === currentUserId) ?? null
  const canManageGroupMembers = activeChat.chat.type === 'group' && (currentGroupMember?.role === 'owner' || currentGroupMember?.role === 'admin')
  const existingMemberIds = new Set(groupMembers.map((member) => member.id))
  const availableUsers = directoryUsers
    .filter((user) => !existingMemberIds.has(user.id))
    .filter((user) => {
      const query = memberSearch.trim().toLowerCase()
      if (!query) {
        return true
      }

      return [user.fullName, user.username, user.email].filter(Boolean).join(' ').toLowerCase().includes(query)
    })
    .slice(0, 8)

  const detailRows = [
    {
      icon: activeChat.chat.type === 'group' ? 'group' : 'person',
      label: mt('infoPanel.t03'),
      value: activeChat.chat.type === 'group' ? mt('infoPanel.t04') : mt('infoPanel.t05'),
    },
    {
      icon: 'badge',
      label: mt('infoPanel.t06'),
      value: String(activeChat.chat.id),
    },
    {
      icon: 'forum',
      label: mt('infoPanel.t07'),
      value: String(activeChat.chat.mentionCount ?? 0),
    },
  ]

  return (
    <aside
      aria-label={mt('infoPanel.t08')}
      style={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        background: C.surface,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          minHeight: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '0 20px',
          borderBottom: `1px solid ${C.borderLight}`,
          background: 'rgba(255, 255, 255, 0.96)',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>{mt('infoPanel.t08')}</div>
          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600, color: C.inkMuted }}>
            {activeChat.chat.type === 'group' ? mt('infoPanel.t09') : mt('infoPanel.t10')}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={mt('infoPanel.t11')}
          title={mt('infoPanel.t12')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 11,
            border: `1px solid ${C.borderLight}`,
            background: C.surfaceElevated,
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <MS name="close" size={19} color={C.inkSub} />
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#FBFCFE' }}>
        <section
          style={{
            padding: isMobile ? '20px 18px 18px' : '24px 22px 20px',
            textAlign: 'center',
            borderBottom: `1px solid ${C.borderLight}`,
            background: C.surface,
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              margin: '0 auto 12px',
              borderRadius: 30,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(145deg, #F8FAFF 0%, #EEF2FF 100%)',
              boxShadow: '0 12px 28px rgba(47, 75, 226, 0.12)',
            }}
          >
            <MessengerAvatar initials={activeChat.avatar} imageUrl={activeChat.avatarUrl} size={76} seed={activeChat.seed} online={activeChat.online} />
          </div>
          <div
            style={{
              maxWidth: 290,
              margin: '0 auto',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 18,
              fontWeight: 800,
              color: C.ink,
              letterSpacing: '-0.025em',
            }}
          >
            {activeChat.title}
          </div>
          <div
            style={{
              width: 'fit-content',
              margin: '7px auto 0',
              padding: '5px 9px',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: activeChat.online ? C.greenBg : C.surfaceElevated,
              color: activeChat.online ? C.green : C.inkMuted,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: activeChat.online ? C.green : C.inkFaint,
              }}
            />
            {activeChat.online ? mt('infoPanel.t13') : activeChat.chat.type === 'group' ? mt('common.members', { count: groupMembers.length }) : mt('infoPanel.t14')}
          </div>
          {activeChat.chat.type === 'group' && groupDescription ? (
            <div
              style={{
                marginTop: 16,
                fontSize: 12,
                fontWeight: 500,
                color: C.inkSub,
                lineHeight: 1.55,
                background: C.surfaceElevated,
                padding: '11px 13px',
                borderRadius: 13,
                textAlign: 'left',
                border: `1px solid ${C.borderLight}`,
              }}
            >
              {groupDescription}
            </div>
          ) : null}
        </section>

        <div style={{ padding: isMobile ? '16px 14px 24px' : '18px 16px 28px', display: 'grid', gap: 20 }}>
          {onToggleMute ? (
            <button
              type="button"
              disabled={muteBusy}
              onClick={onToggleMute}
              aria-pressed={!isMuted}
              style={{
                ...cardStyle,
                width: '100%',
                minHeight: 64,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                cursor: muteBusy ? 'default' : 'pointer',
                opacity: muteBusy ? 0.68 : 1,
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    display: 'grid',
                    placeItems: 'center',
                    background: isMuted ? C.surfaceElevated : C.blueSoft,
                    flexShrink: 0,
                  }}
                >
                  <MS name={isMuted ? 'notifications_off' : 'notifications'} size={20} color={isMuted ? C.inkMuted : C.blue} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: C.ink }}>{mt('infoPanel.t15')}</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 11, fontWeight: 500, color: C.inkMuted }}>
                    {isMuted ? mt('infoPanel.t16') : mt('infoPanel.t17')}
                  </span>
                </span>
              </span>
              <span
                aria-hidden="true"
                style={{
                  width: 38,
                  height: 22,
                  padding: 2,
                  borderRadius: 999,
                  display: 'flex',
                  justifyContent: isMuted ? 'flex-start' : 'flex-end',
                  background: isMuted ? C.border : C.blue,
                  transition: 'background 160ms ease',
                  flexShrink: 0,
                }}
              >
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 4px rgba(10, 22, 40, 0.2)' }} />
              </span>
            </button>
          ) : null}

          <section style={{ display: 'grid', gap: 9 }}>
            <h3 style={sectionTitleStyle}>{mt('infoPanel.t18')}</h3>
            <div style={cardStyle}>
              {detailRows.map((row, index) => (
                <div
                  key={row.label}
                  style={{
                    minHeight: 54,
                    padding: '9px 12px',
                    display: 'grid',
                    gridTemplateColumns: '34px minmax(0, 1fr)',
                    alignItems: 'center',
                    gap: 10,
                    borderBottom: index < detailRows.length - 1 || (activeChat.chat.type === 'personal' && activePeerId !== null) ? `1px solid ${C.borderLight}` : 'none',
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      display: 'grid',
                      placeItems: 'center',
                      background: C.blueSoft,
                    }}
                  >
                    <MS name={row.icon} size={18} color={C.blue} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: C.inkMuted }}>{row.label}</span>
                    <span
                      style={{
                        display: 'block',
                        marginTop: 2,
                        fontSize: 12,
                        fontWeight: 650,
                        color: C.ink,
                        lineHeight: 1.35,
                        wordBreak: row.label === mt('infoPanel.t06') ? 'break-all' : 'normal',
                      }}
                    >
                      {row.value}
                    </span>
                  </span>
                </div>
              ))}
              {activeChat.chat.type === 'personal' && activePeerId !== null ? (
                <button
                  type="button"
                  onClick={() => onOpenUserProfile(activePeerId)}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    padding: '0 12px',
                    border: 'none',
                    background: C.surface,
                    color: C.blue,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontSize: 12,
                    fontWeight: 800,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: C.blueSoft }}>
                      <MS name="person" size={18} color={C.blue} />
                    </span>
                    {activePeerId > 0 ? mt('infoPanel.t19') : mt('infoPanel.t20')}
                  </span>
                  <MS name="chevron_right" size={18} color={C.inkFaint} />
                </button>
              ) : null}
            </div>
          </section>

          {activeChat.chat.type === 'group' ? (
            <section style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <h3 style={sectionTitleStyle}>{mt('infoPanel.t21')}</h3>
                  <div style={{ marginTop: 3, fontSize: 11, fontWeight: 500, color: C.inkMuted }}>
                    {groupMembers.length > 0 ? mt('info.inGroup', { count: groupMembers.length }) : mt('infoPanel.t22')}
                  </div>
                </div>
                {canManageGroupMembers ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddMembersOpen((previousValue) => {
                        const nextValue = !previousValue
                        if (!previousValue && directoryUsers.length === 0) {
                          onLoadDirectoryUsers()
                        }
                        return nextValue
                      })
                    }}
                    aria-expanded={isAddMembersOpen}
                    style={{
                      ...smallButtonStyle,
                      borderColor: 'transparent',
                      background: C.blueSoft,
                      color: C.blue,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <MS name={isAddMembersOpen ? 'close' : 'person_add'} size={16} color={C.blue} />
                    {isAddMembersOpen ? mt('infoPanel.t12') : mt('infoPanel.t23')}
                  </button>
                ) : null}
              </div>

              {isAddMembersOpen ? (
                <div style={{ ...cardStyle, padding: 10, display: 'grid', gap: 8, background: C.surfaceElevated }}>
                  <div style={{ position: 'relative' }}>
                    <MS name="search" size={17} color={C.inkFaint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder={mt('infoPanel.t24')}
                      style={{
                        width: '100%',
                        height: 38,
                        borderRadius: 11,
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        padding: '0 12px 0 36px',
                        outline: 'none',
                        fontSize: 12,
                        color: C.ink,
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  {isSearchingUsers ? <div style={{ padding: '6px 4px', fontSize: 12, color: C.inkMuted }}>{mt('infoPanel.t25')}</div> : null}
                  {!isSearchingUsers && userSearchError ? <div style={{ padding: '6px 4px', fontSize: 12, color: C.red }}>{userSearchError}</div> : null}
                  {!isSearchingUsers && !userSearchError && availableUsers.length === 0 ? (
                    <div style={{ padding: '6px 4px', fontSize: 12, color: C.inkMuted }}>{mt('infoPanel.t26')}</div>
                  ) : null}
                  {!isSearchingUsers && !userSearchError
                    ? availableUsers.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          disabled={isGroupMembersUpdating}
                          onClick={() => onAddGroupMember(user.id)}
                          style={{
                            width: '100%',
                            minHeight: 48,
                            border: `1px solid ${C.borderLight}`,
                            background: C.surface,
                            borderRadius: 12,
                            padding: '7px 9px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            textAlign: 'left',
                            cursor: isGroupMembersUpdating ? 'default' : 'pointer',
                            opacity: isGroupMembersUpdating ? 0.68 : 1,
                            fontFamily: 'inherit',
                          }}
                        >
                          <MessengerAvatar
                            initials={getInitials(user.fullName || user.username)}
                            imageUrl={user.avatarUrl}
                            size={32}
                            seed={getSeed(user.fullName || user.username || String(user.id))}
                          />
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 12, fontWeight: 750, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {user.fullName || user.username || `User ${user.id}`}
                            </span>
                            <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: C.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {user.username ? `@${user.username}` : user.email}
                            </span>
                          </span>
                          <MS name="add" size={18} color={C.blue} />
                        </button>
                      ))
                    : null}
                </div>
              ) : null}

              {groupMembersError ? <div style={{ padding: '10px 12px', borderRadius: 11, background: C.redBg, fontSize: 12, color: C.red }}>{groupMembersError}</div> : null}
              {groupMembersActionError ? <div style={{ padding: '10px 12px', borderRadius: 11, background: C.redBg, fontSize: 12, color: C.red }}>{groupMembersActionError}</div> : null}

              <div style={{ display: 'grid', gap: 8 }}>
                {groupMembers.map((member) => {
                  const isCurrentUser = member.id === currentUserId
                  const canChangeThisRole = currentGroupMember?.role === 'owner' && !isCurrentUser && member.role !== 'owner'
                  const canRemoveThisMember = !isCurrentUser && member.role !== 'owner' && (currentGroupMember?.role === 'owner' || (currentGroupMember?.role === 'admin' && member.role === 'member'))
                  const canEditThisMember = canChangeThisRole || canRemoveThisMember
                  const title = member.fullName || member.username || `User ${member.id}`

                  return (
                    <div key={member.id} style={{ ...cardStyle, padding: '10px 11px', display: 'grid', gap: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <MessengerAvatar initials={getInitials(title)} imageUrl={null} size={36} seed={getSeed(title)} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 750, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                          <div style={{ marginTop: 2, fontSize: 11, color: C.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {member.username ? `@${member.username}` : member.email || `ID: ${member.id}`}
                          </div>
                        </div>
                        <div
                          style={{
                            padding: '4px 7px',
                            borderRadius: 999,
                            background: member.role === 'owner' || member.role === 'admin' ? C.blueSoft : C.surfaceElevated,
                            color: member.role === 'owner' || member.role === 'admin' ? C.blue : C.inkMuted,
                            fontSize: 9,
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {getMemberRoleLabel(member.role)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        <button type="button" onClick={() => onOpenUserProfile(member.id)} style={{ ...smallButtonStyle, flex: 1 }}>
                          {mt('infoPanel.t27')}
                        </button>
                        {canEditThisMember ? (
                          <>
                            {canChangeThisRole ? <button
                              type="button"
                              disabled={isGroupMembersUpdating}
                              onClick={() => onUpdateGroupMemberRole(member.id, member.role === 'admin' ? 'member' : 'admin')}
                              style={{ ...smallButtonStyle, flex: 1, opacity: isGroupMembersUpdating ? 0.68 : 1, cursor: isGroupMembersUpdating ? 'default' : 'pointer' }}
                            >
                              {member.role === 'admin' ? mt('infoPanel.t28') : mt('infoPanel.t29')}
                            </button> : null}
                            {canRemoveThisMember ? <button
                              type="button"
                              disabled={isGroupMembersUpdating}
                              onClick={() => onRemoveGroupMember(member.id)}
                              aria-label={mt('info.removeFromGroup', { name: title })}
                              title={mt('infoPanel.t30')}
                              style={{
                                ...smallButtonStyle,
                                width: 34,
                                padding: 0,
                                display: 'grid',
                                placeItems: 'center',
                                color: C.red,
                                background: C.redBg,
                                borderColor: 'transparent',
                                opacity: isGroupMembersUpdating ? 0.68 : 1,
                                cursor: isGroupMembersUpdating ? 'default' : 'pointer',
                              }}
                            >
                              <MS name="remove" size={17} color={C.red} />
                            </button> : null}
                          </>
                        ) : isCurrentUser && member.role !== 'owner' ? (
                          <button
                            type="button"
                            disabled={isGroupMembersUpdating}
                            onClick={onLeaveGroup}
                            style={{
                              ...smallButtonStyle,
                              flex: 1,
                              color: C.red,
                              background: C.redBg,
                              borderColor: 'transparent',
                              opacity: isGroupMembersUpdating ? 0.68 : 1,
                              cursor: isGroupMembersUpdating ? 'default' : 'pointer',
                            }}
                          >
                            {mt('infoPanel.t31')}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
