import { EPS_API_TOKEN, EPS_APP_BASE, resolveEpsMailboxEmail } from '../../shared/config/epsConfig'

interface EpsUnreadEmailDto {
  id: string
  from?: Array<{ name?: string; email?: string }>
  subject?: string
  receivedAt?: string
  hasAttachment?: boolean
}

interface EpsUnreadResponseDto {
  username?: string
  mailbox?: string
  unreadTotal?: number
  returned?: number
  emails?: EpsUnreadEmailDto[]
  error?: string
}

export interface EpsUnreadEmail {
  id: string
  subject: string
  fromName: string
  fromEmail: string
  receivedAt: string
  hasAttachment: boolean
}

export interface EpsUnreadMailbox {
  mailboxEmail: string
  unreadTotal: number
  emails: EpsUnreadEmail[]
}

const mapUnreadEmail = (dto: EpsUnreadEmailDto): EpsUnreadEmail => {
  const sender = dto.from?.[0]
  return {
    id: dto.id,
    subject: dto.subject?.trim() || 'Без темы',
    fromName: sender?.name?.trim() || sender?.email?.trim() || 'Неизвестный отправитель',
    fromEmail: sender?.email?.trim() || '',
    receivedAt: dto.receivedAt ?? '',
    hasAttachment: Boolean(dto.hasAttachment),
  }
}

export async function getEpsUnreadMailbox(
  workspaceEmail: string | null | undefined,
  limit = 10,
): Promise<EpsUnreadMailbox | null> {
  const mailboxEmail = resolveEpsMailboxEmail(workspaceEmail)
  if (!mailboxEmail) {
    return null
  }

  const response = await fetch(
    `${EPS_APP_BASE}/api/v1/users/${encodeURIComponent(mailboxEmail)}/unread?limit=${limit}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${EPS_API_TOKEN}`,
      },
    },
  )

  const data = (await response.json().catch(() => null)) as EpsUnreadResponseDto | null
  if (!response.ok || !data || data.error) {
    return null
  }

  return {
    mailboxEmail: data.username ?? mailboxEmail,
    unreadTotal: data.unreadTotal ?? 0,
    emails: (data.emails ?? []).map(mapUnreadEmail),
  }
}
