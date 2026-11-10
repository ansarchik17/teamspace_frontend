import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinistryDirectoryUser, MinistryLeader, MinistryPortal, MinistryProfile, MinistryStructureItem } from '../../../domain/entities/MinistryPortal'
import { HttpMinistryRepository } from '../../../infrastructure/repositories/HttpMinistryRepository'
import { HttpPublicationRepository } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type { Publication } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type { CurrentProfile } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import CardShell from '../../../shared/ui/CardShell'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { PublicationCard } from './PublicationCard'

type MinistryTab = 'overview' | 'leaders' | 'employees' | 'structure' | 'publications' | 'contacts'

interface MinistryWorkspaceViewProps {
  ministryId: number
  ministryName: string
  ministryRepository: HttpMinistryRepository
  loadMinistryPublications: (params: { ministryId: number; type?: string; page?: number; limit?: number }) => Promise<Publication[]>
  onBackToFeed: () => void
  currentProfile: CurrentProfile | null
  currentUserId: number | null
  pubRepo: HttpPublicationRepository
  onShare: (pub: Publication) => Promise<void>
  onAcknowledge: (pub: Publication) => Promise<void>
  onEditPub: (pub: Publication) => void
  onDeletePub: (pubId: string) => Promise<void>
  onCommentCountChange: (pubId: string, diff: number) => void
  setPreviewImageUrl: (url: string | null) => void
  formatPubDate: (isoString: string) => string
  setToast: (msg: string) => void
  setAppError: (msg: string) => void
}

const formatDate = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

const getInitials = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'МИ'

const statusLabel = (status?: string | null) => {
  switch (status) {
    case 'vacation':
      return 'В отпуске'
    case 'sick':
      return 'На больничном'
    case 'offline':
      return 'Не в сети'
    default:
      return 'На работе'
  }
}

const statusTone = (status?: string | null) => {
  switch (status) {
    case 'vacation':
      return 'bg-[#FFF4E8] text-[#C66A14]'
    case 'sick':
      return 'bg-[#FEF2F2] text-[#DC2626]'
    case 'offline':
      return 'bg-[#F1F5F9] text-[#64748B]'
    default:
      return 'bg-[#EAFBF3] text-[#059669]'
  }
}

const WEEK_DAYS = [
  { key: 'mon', shortLabel: 'Пн', fullLabel: 'Понедельник' },
  { key: 'tue', shortLabel: 'Вт', fullLabel: 'Вторник' },
  { key: 'wed', shortLabel: 'Ср', fullLabel: 'Среда' },
  { key: 'thu', shortLabel: 'Чт', fullLabel: 'Четверг' },
  { key: 'fri', shortLabel: 'Пт', fullLabel: 'Пятница' },
  { key: 'sat', shortLabel: 'Сб', fullLabel: 'Суббота' },
  { key: 'sun', shortLabel: 'Вс', fullLabel: 'Воскресенье' },
] as const

type WeekDayKey = (typeof WEEK_DAYS)[number]['key']

interface WeeklyScheduleDay {
  day: WeekDayKey
  label: string
  title: string
  enabled: boolean
  start: string
  end: string
  lunchEnabled: boolean
  lunchStart: string
  lunchEnd: string
}

const createDefaultWeeklySchedule = (): WeeklyScheduleDay[] =>
  WEEK_DAYS.map((day, index) => ({
    day: day.key,
    label: day.shortLabel,
    title: day.fullLabel,
    enabled: index < 5,
    start: '09:00',
    end: '18:00',
    lunchEnabled: index < 5,
    lunchStart: '13:00',
    lunchEnd: '14:00',
  }))

const parseScheduleLine = (line: string) => {
  const match = line.match(/^(Пн|Вт|Ср|Чт|Пт|Сб|Вс):\s*(выходной|(\d{2}:\d{2})-(\d{2}:\d{2}))$/i)
  if (!match) return null
  return {
    label: match[1],
    enabled: match[2].toLowerCase() !== 'выходной',
    start: match[3] || '',
    end: match[4] || '',
  }
}

const parseWeeklySchedule = (workingHours?: string, lunchHours?: string): WeeklyScheduleDay[] => {
  const workingMap = new Map(
    (workingHours || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseScheduleLine(line))
      .filter((item): item is NonNullable<ReturnType<typeof parseScheduleLine>> => Boolean(item))
      .map((item) => [item.label, item]),
  )

  const lunchMap = new Map(
    (lunchHours || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseScheduleLine(line))
      .filter((item): item is NonNullable<ReturnType<typeof parseScheduleLine>> => Boolean(item))
      .map((item) => [item.label, item]),
  )

  return createDefaultWeeklySchedule().map((day) => {
    const working = workingMap.get(day.label)
    const lunch = lunchMap.get(day.label)

    if (!working && !lunch) return day

    return {
      ...day,
      enabled: working?.enabled ?? day.enabled,
      start: working?.start || day.start,
      end: working?.end || day.end,
      lunchEnabled: lunch?.enabled ?? false,
      lunchStart: lunch?.start || day.lunchStart,
      lunchEnd: lunch?.end || day.lunchEnd,
    }
  })
}

const formatWorkingHours = (schedule: WeeklyScheduleDay[]) =>
  schedule
    .map((day) => `${day.label}: ${day.enabled ? `${day.start}-${day.end}` : 'выходной'}`)
    .join('\n')

const formatLunchHours = (schedule: WeeklyScheduleDay[]) =>
  schedule
    .filter((day) => day.enabled)
    .map((day) => `${day.label}: ${day.lunchEnabled ? `${day.lunchStart}-${day.lunchEnd}` : 'выходной'}`)
    .join('\n')

const formatDayRange = (labels: string[]) => {
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels[0]} - ${labels[labels.length - 1]}`
}

const summarizeSchedule = (value?: string, mode: 'working' | 'lunch' = 'working') => {
  const lines = (value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseScheduleLine(line))
    .filter((item): item is NonNullable<ReturnType<typeof parseScheduleLine>> => Boolean(item))

  if (!lines.length) return ''

  const active = lines.filter((item) => item.enabled && item.start && item.end)
  if (!active.length) {
    return mode === 'lunch' ? '' : 'Выходной'
  }

  const groups = new Map<string, string[]>()
  active.forEach((item) => {
    const key = `${item.start}-${item.end}`
    const current = groups.get(key) || []
    current.push(item.label)
    groups.set(key, current)
  })

  const summary = Array.from(groups.entries())
    .map(([timeRange, labels]) => `${formatDayRange(labels)}: ${timeRange.replace('-', ' - ')}`)
    .join(', ')

  return mode === 'lunch' ? `Обед: ${summary}` : summary
}

interface StructureNode {
  stateBody: MinistryStructureItem
  departments: MinistryStructureItem[]
}

export default function MinistryWorkspaceView({
  ministryId,
  ministryName,
  ministryRepository,
  loadMinistryPublications,
  onBackToFeed,
  currentProfile,
  currentUserId,
  pubRepo,
  onShare,
  onAcknowledge,
  onEditPub,
  onDeletePub,
  onCommentCountChange,
  setPreviewImageUrl,
  formatPubDate,
  setToast,
  setAppError,
}: MinistryWorkspaceViewProps) {
  const [portal, setPortal] = useState<MinistryPortal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<MinistryTab>('overview')
  const [employees, setEmployees] = useState<MinistryDirectoryUser[]>([])
  const [employeesPage, setEmployeesPage] = useState(1)
  const [employeesTotal, setEmployeesTotal] = useState(0)
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [leaders, setLeaders] = useState<MinistryLeader[]>([])
  const [structure, setStructure] = useState<MinistryStructureItem[]>([])
  const [publications, setPublications] = useState<Publication[]>([])
  const [publicationsLoading, setPublicationsLoading] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [profileDraft, setProfileDraft] = useState<Partial<MinistryProfile>>({})
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [scheduleDraft, setScheduleDraft] = useState<WeeklyScheduleDay[]>(() => createDefaultWeeklySchedule())
  const [expandedStateBodies, setExpandedStateBodies] = useState<Set<number>>(new Set())
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    setActiveTab('overview')
    setEmployees([])
    setEmployeesPage(1)
    setEmployeesTotal(0)
    setPublications([])

    ministryRepository.getPortal(ministryId)
      .then((data) => {
        if (!mounted) return
        setPortal(data)
        setLeaders(data.leaders || [])
        setStructure(data.structure || [])
        setProfileDraft(data.profile || {})
        setScheduleDraft(parseWeeklySchedule(data.profile?.working_hours, data.profile?.lunch_hours))
      })
      .catch((err) => {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Не удалось загрузить страницу министерства')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [ministryId, ministryRepository])

  useEffect(() => {
    if (activeTab !== 'employees') return
    let mounted = true
    setEmployeesLoading(true)
    ministryRepository.getEmployees(ministryId, { page: employeesPage, limit: 24, q: employeeQuery.trim() || undefined })
      .then((data) => {
        if (!mounted) return
        setEmployees((prev) => (employeesPage === 1 ? data.items : [...prev, ...data.items]))
        setEmployeesTotal(data.total)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Не удалось загрузить сотрудников')
      })
      .finally(() => {
        if (mounted) setEmployeesLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [activeTab, employeeQuery, employeesPage, ministryId, ministryRepository])

  useEffect(() => {
    if (activeTab !== 'publications') return
    let mounted = true
    setPublicationsLoading(true)
    loadMinistryPublications({ ministryId, page: 1, limit: 20 })
      .then((items) => {
        if (mounted) setPublications(items)
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Не удалось загрузить публикации')
      })
      .finally(() => {
        if (mounted) setPublicationsLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [activeTab, loadMinistryPublications, ministryId])

  const statusSummary = useMemo(() => {
    const source = (portal?.leaders || leaders || [])
    return {
      online: source.filter((item) => !item.availability_status || item.availability_status === 'online').length,
      vacation: source.filter((item) => item.availability_status === 'vacation').length,
      sick: source.filter((item) => item.availability_status === 'sick').length,
    }
  }, [leaders, portal?.leaders])

  const structureTree = useMemo<StructureNode[]>(() => {
    const stateBodies = structure.filter((item) => item.type === 'state_body')
    const departmentsByParent = new Map<number, MinistryStructureItem[]>()

    structure
      .filter((item) => item.type === 'department' && item.parent_id)
      .forEach((item) => {
        const parentId = Number(item.parent_id)
        const current = departmentsByParent.get(parentId) || []
        current.push(item)
        departmentsByParent.set(parentId, current)
      })

    return stateBodies.map((stateBody) => ({
      stateBody,
      departments: (departmentsByParent.get(stateBody.id) || []).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    }))
  }, [structure])

  const structurePreview = useMemo(
    () =>
      structureTree.slice(0, 6).map(({ stateBody, departments }) => ({
        id: stateBody.id,
        name: stateBody.name,
        subtitle: departments.length
          ? `${departments.length} ${departments.length === 1 ? 'подразделение' : departments.length < 5 ? 'подразделения' : 'подразделений'}`
          : 'Без внутренних подразделений',
      })),
    [structureTree],
  )

  useEffect(() => {
    setExpandedStateBodies(new Set())
  }, [structureTree])

  const tabs: Array<{ id: MinistryTab; label: string }> = [
    { id: 'overview', label: 'Обзор' },
    { id: 'leaders', label: 'Руководство' },
    { id: 'employees', label: 'Сотрудники' },
    { id: 'structure', label: 'Структура' },
    { id: 'publications', label: 'Публикации' },
    { id: 'contacts', label: 'Контакты' },
  ]

  const handleProfileSave = async () => {
    setIsSavingProfile(true)
    setError(null)
    try {
      const updated = await ministryRepository.updateProfile(ministryId, {
        ...profileDraft,
        working_hours: formatWorkingHours(scheduleDraft),
        lunch_hours: formatLunchHours(scheduleDraft),
      })
      setPortal((prev) => (prev ? { ...prev, profile: updated } : prev))
      setProfileDraft(updated)
      setIsEditOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить профиль министерства')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploadingAvatar(true)
    setError(null)
    try {
      const uploaded = await ministryRepository.uploadFile(file, 'image')
      setProfileDraft((prev) => ({ ...prev, avatar_url: uploaded.url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить аватарку министерства')
    } finally {
      setIsUploadingAvatar(false)
      if (avatarInputRef.current) {
        avatarInputRef.current.value = ''
      }
    }
  }

  const toggleStateBody = (stateBodyID: number) => {
    setExpandedStateBodies((prev) => {
      const next = new Set(prev)
      if (next.has(stateBodyID)) {
        next.delete(stateBodyID)
      } else {
        next.add(stateBodyID)
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="lg:col-span-9">
        <div className="bg-white rounded-[28px] border border-[#ECEEF3] p-8 animate-pulse h-[420px]" />
      </div>
    )
  }

  if (error && !portal) {
    return (
      <div className="lg:col-span-9">
        <CardShell className="p-8 text-left">
          <div className="text-[18px] font-bold text-[#0A1628] mb-2">Не удалось открыть страницу министерства</div>
          <div className="text-[13px] text-[#64748B] mb-5">{error}</div>
          <button onClick={onBackToFeed} className="ts-button ts-button--primary h-10 px-4 rounded-xl bg-[#2458D3] text-white text-[13px] font-semibold">
            Вернуться в ленту
          </button>
        </CardShell>
      </div>
    )
  }

  const profile = portal?.profile
  const heroName = portal?.ministry.name || ministryName
  const heroSubtitle = profile?.official_label || 'Официальное ведомство'
  const orgType = profile?.organization_type || 'Государственная организация'
  const heroImage = profile?.avatar_url || undefined
  const aboutSummary = profile?.summary?.replace(/\s+/g, ' ').trim() || 'Описание пока не заполнено.'

  return (
    <div className="lg:col-span-9 space-y-6 text-left">
      <CardShell className="overflow-hidden border border-[#E6ECF7] shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
        <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#ffffff_0%,#f8fbff_38%,#eef4ff_100%)] px-6 py-6 md:px-8 md:py-7">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#2458D3]/8 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-32 w-40 bg-[linear-gradient(135deg,transparent_0%,rgba(47,75,226,0.06)_100%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              <div className="relative">
                <div className="absolute inset-0 rounded-[30px] bg-[linear-gradient(135deg,rgba(47,75,226,0.18),rgba(47,75,226,0.02))] blur-xl" />
                <div className="relative flex h-[96px] w-[96px] items-center justify-center overflow-hidden rounded-[30px] border border-white/80 bg-white p-3 shadow-[0_18px_45px_rgba(47,75,226,0.16)]">
                  {heroImage ? (
                    <img src={heroImage} alt={heroName} className="h-full w-full object-contain" />
                  ) : (
                    <GradientAvatar initials={getInitials(heroName)} size={96} borderRadius={30} seed={ministryId} />
                  )}
                </div>
              </div>
              <div className="max-w-[760px] pt-1">
                <div className="flex items-start gap-2 flex-wrap">
                  <h2 className="max-w-[760px] text-[30px] leading-[1.06] font-extrabold tracking-[-0.03em] text-[#0A1628] md:text-[34px]">
                    {heroName}
                  </h2>
                  {profile?.is_verified ? (
                    <span className="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF2FF] text-[#2458D3]">
                      <MaterialSymbol name="verified" size={16} color="currentColor" />
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2.5">
                  <span className="rounded-full border border-[#D8E4FF] bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-[#4F5F7B] shadow-[0_4px_12px_rgba(15,23,42,0.03)]">
                    {heroSubtitle}
                  </span>
                  <span className="rounded-full border border-[#D8E4FF] bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-[#4F5F7B] shadow-[0_4px_12px_rgba(15,23,42,0.03)]">
                    {orgType}
                  </span>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[12px] font-medium text-[#6B7A93] shadow-[0_4px_12px_rgba(15,23,42,0.03)]">
                  <MaterialSymbol name="schedule" size={14} color="#2458D3" />
                  <span>Обновлено {formatDate(profile?.updated_at || portal?.ministry.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-3 sm:flex-row xl:flex-col xl:items-stretch">
              <button
                onClick={onBackToFeed}
                className="h-12 rounded-2xl border border-[#DCE6F7] bg-white/95 px-5 text-[13px] font-semibold text-[#0A1628] shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:border-[#C8D6F2] hover:bg-white"
              >
                Все публикации
              </button>
              {portal?.can_edit ? (
                <button
                  onClick={() => {
                    setProfileDraft(profile || {})
                    setScheduleDraft(parseWeeklySchedule(profile?.working_hours, profile?.lunch_hours))
                    setIsEditOpen(true)
                  }}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#2458D3_0%,#3E5BFF_100%)] px-5 text-[13px] font-semibold text-white shadow-[0_16px_32px_rgba(47,75,226,0.28)] transition hover:shadow-[0_20px_40px_rgba(47,75,226,0.34)]"
                >
                  <MaterialSymbol name="edit" size={16} color="#fff" />
                  Редактировать
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </CardShell>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: 'Сотрудники', value: portal?.stats.employees_count ?? 0, icon: 'group' },
          { label: 'Структура', value: portal?.stats.departments_count ?? 0, icon: 'account_tree' },
          { label: 'Руководство', value: portal?.stats.leadership_count ?? 0, icon: 'badge' },
        ].map((item) => (
          <CardShell key={item.label} className="overflow-hidden border border-[#E6ECF7] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFDFF_100%)] p-5 shadow-[0_14px_32px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[linear-gradient(135deg,#EEF2FF_0%,#F7F9FF_100%)] text-[#2458D3] shadow-inner">
                <MaterialSymbol name={item.icon} size={20} color="currentColor" />
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-[#64748B]">{item.label}</div>
                <div className="mt-1 text-[34px] font-extrabold leading-none tracking-[-0.03em] text-[#0A1628]">{item.value}</div>
              </div>
            </div>
          </CardShell>
        ))}
      </div>

      <div className="flex border-b border-[#E6EBF4] overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                if (tab.id === 'employees') {
                  setEmployeesPage(1)
                }
              }}
              className={`relative px-4 py-3 text-[13px] font-semibold shrink-0 ${isActive ? 'text-[#2458D3]' : 'text-[#64748B]'}`}
            >
              {tab.label}
              {isActive ? <span className="absolute left-4 right-4 bottom-0 h-[2.5px] rounded-full bg-[#2458D3]" /> : null}
            </button>
          )
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[12.5px] text-[#B91C1C]">{error}</div>
      ) : null}

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 space-y-5">
            <CardShell className="p-5 md:p-6">
              <div className="text-[18px] font-bold text-[#0A1628] mb-3">О министерстве</div>
              <div className="max-w-none text-[13.5px] leading-6 text-[#5B6B88] whitespace-normal break-words">
                {aboutSummary}
              </div>
            </CardShell>

            <CardShell className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[18px] font-bold text-[#0A1628]">Руководство</div>
                <button onClick={() => setActiveTab('leaders')} className="text-[12px] font-semibold text-[#2458D3]">Смотреть всех</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(portal?.leaders || []).slice(0, 4).map((leader) => (
                  <div key={leader.user_id} className="rounded-2xl border border-[#ECF0F7] p-4 bg-[#FCFDFF]">
                    <div className="flex items-start gap-3">
                      <GradientAvatar initials={getInitials(leader.full_name)} src={leader.avatar_url} size={48} seed={leader.user_id} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-[#0A1628] leading-5">{leader.full_name}</div>
                        <div className="text-[12px] text-[#64748B] mt-1">{leader.position || 'Сотрудник'}</div>
                        <span className={`inline-flex mt-3 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${statusTone(leader.availability_status)}`}>
                          {statusLabel(leader.availability_status)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardShell>

            <CardShell className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[18px] font-bold text-[#0A1628]">Последние публикации</div>
                <button onClick={() => setActiveTab('publications')} className="text-[12px] font-semibold text-[#2458D3]">Все публикации</button>
              </div>
              <div className="space-y-3">
                {(portal?.latest_publications || []).slice(0, 5).map((pub: any) => (
                  <div key={pub.id} className="rounded-2xl border border-[#ECF0F7] px-4 py-3 hover:bg-[#FAFCFF] transition-colors">
                    <div className="text-[11px] font-semibold text-[#2458D3] uppercase tracking-[0.08em]">{pub.type}</div>
                    <div className="text-[14px] font-bold text-[#0A1628] mt-1">{pub.title}</div>
                    <div className="text-[12px] text-[#64748B] mt-2 line-clamp-2">{pub.content || 'Подробности внутри публикации.'}</div>
                    <div className="text-[11px] text-[#94A3B8] mt-2">{formatDate(pub.published_at)}</div>
                  </div>
                ))}
              </div>
            </CardShell>
          </div>

          <div className="xl:col-span-4 space-y-5">
            <CardShell className="p-6">
              <div className="text-[18px] font-bold text-[#0A1628] mb-4">Контактная информация</div>
              <div className="space-y-3 text-[13px] text-[#475569]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center text-[#2458D3] shrink-0">
                    <MaterialSymbol name="place" size={18} color="currentColor" />
                  </span>
                  <span>{profile?.address || 'Адрес не заполнен'}</span>
                </div>
                <div className="flex items-start gap-3"><MaterialSymbol name="call" size={16} color="#2458D3" /><span>{profile?.phone || 'Телефон не указан'}</span></div>
                <div className="flex items-start gap-3"><MaterialSymbol name="mail" size={16} color="#2458D3" /><span>{profile?.email || 'Email не указан'}</span></div>
                <div className="flex items-start gap-3">
                  <MaterialSymbol name="schedule" size={16} color="#2458D3" />
                  <div className="space-y-1">
                    <div>{summarizeSchedule(profile?.working_hours) || 'График не указан'}</div>
                    {summarizeSchedule(profile?.lunch_hours, 'lunch') ? (
                      <div className="text-[12px] text-[#7C8CA7]">{summarizeSchedule(profile?.lunch_hours, 'lunch')}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </CardShell>

            <CardShell className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[18px] font-bold text-[#0A1628]">Структура</div>
              </div>
              <div className="space-y-1.5">
                {structurePreview.map((item) => (
                  <button
                    key={`preview-${item.id}`}
                    type="button"
                    onClick={() => setActiveTab('structure')}
                    className="w-full rounded-2xl px-1 py-2 flex items-center justify-between gap-3 text-left transition hover:bg-[#F8FBFF]"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#F5F7FF] text-[#6C7B95] flex items-center justify-center shrink-0">
                        <MaterialSymbol name="account_balance" size={15} color="currentColor" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#0A1628] truncate">{item.name}</div>
                        <div className="text-[11px] text-[#94A3B8] mt-0.5 truncate">{item.subtitle}</div>
                      </div>
                    </div>
                    <MaterialSymbol name="chevron_right" size={18} color="#94A3B8" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('structure')}
                className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2458D3] hover:text-[#253CB1]"
              >
                <span>Смотреть всю структуру</span>
                <MaterialSymbol name="arrow_forward" size={14} color="currentColor" />
              </button>
            </CardShell>

            <CardShell className="p-6">
              <div className="text-[18px] font-bold text-[#0A1628] mb-4">Статусы руководства</div>
              <div className="space-y-3 text-[13px]">
                <div className="flex items-center justify-between"><span className="text-[#475569]">На работе</span><span className="font-semibold text-[#059669]">{statusSummary.online}</span></div>
                <div className="flex items-center justify-between"><span className="text-[#475569]">В отпуске</span><span className="font-semibold text-[#C66A14]">{statusSummary.vacation}</span></div>
                <div className="flex items-center justify-between"><span className="text-[#475569]">На больничном</span><span className="font-semibold text-[#DC2626]">{statusSummary.sick}</span></div>
              </div>
            </CardShell>
          </div>
        </div>
      ) : null}

      {activeTab === 'leaders' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {leaders.map((leader) => (
            <CardShell key={leader.user_id} className="p-5">
              <div className="flex items-start gap-3">
                <GradientAvatar initials={getInitials(leader.full_name)} src={leader.avatar_url} size={54} seed={leader.user_id} />
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-[#0A1628]">{leader.full_name}</div>
                  <div className="text-[12px] text-[#64748B] mt-1">{leader.position || 'Сотрудник'}</div>
                  <span className={`inline-flex mt-3 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${statusTone(leader.availability_status)}`}>
                    {statusLabel(leader.availability_status)}
                  </span>
                </div>
              </div>
            </CardShell>
          ))}
        </div>
      ) : null}

      {activeTab === 'employees' ? (
        <div className="space-y-4">
          <CardShell className="p-4">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div>
                <div className="text-[18px] font-bold text-[#0A1628]">Сотрудники министерства</div>
                <div className="text-[12px] text-[#64748B] mt-1">Найдено: {employeesTotal}</div>
              </div>
              <div className="flex gap-2">
                <input
                  value={employeeQuery}
                  onChange={(e) => {
                    setEmployeeQuery(e.target.value)
                    setEmployeesPage(1)
                  }}
                  placeholder="Поиск по имени или должности"
                  className="h-11 w-full md:w-[320px] rounded-2xl border border-[#D8E1F0] px-4 text-[13px] outline-none focus:border-[#2458D3]"
                />
              </div>
            </div>
          </CardShell>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {employees.map((employee) => (
              <CardShell key={employee.id} className="p-4">
                <div className="flex items-start gap-3">
                  <GradientAvatar initials={getInitials(employee.full_name)} src={employee.avatar_url} size={46} seed={employee.id} />
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-[#0A1628] leading-5">{employee.full_name}</div>
                    <div className="text-[12px] text-[#64748B] mt-1">{employee.position || 'Сотрудник'}</div>
                    <span className={`inline-flex mt-3 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${statusTone(employee.availability_status)}`}>
                      {statusLabel(employee.availability_status)}
                    </span>
                  </div>
                </div>
              </CardShell>
            ))}
          </div>

          {employeesLoading ? <div className="text-[12px] text-[#64748B]">Загрузка сотрудников...</div> : null}
          {!employeesLoading && employees.length < employeesTotal ? (
            <button
              onClick={() => setEmployeesPage((prev) => prev + 1)}
              className="h-11 px-5 rounded-2xl border border-[#D8E1F0] bg-white text-[#0A1628] text-[13px] font-semibold"
            >
              Показать еще
            </button>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'structure' ? (
        structureTree.length ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {structureTree.map(({ stateBody, departments }) => {
              const isExpanded = expandedStateBodies.has(stateBody.id)
              const visibleDepartments = isExpanded ? departments : departments.slice(0, 3)

              return (
              <CardShell key={`state-body-${stateBody.id}`} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F3F6FF] text-[#2458D3]">
                        <MaterialSymbol name="account_balance" size={20} color="currentColor" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[18px] font-bold leading-6 text-[#0A1628]">{stateBody.name}</div>
                        <div className="mt-1 text-[12px] text-[#64748B]">Подведомственный орган</div>
                      </div>
                    </div>
                    {stateBody.leader_name ? (
                      <div className="mt-4 text-[13px] text-[#475569]">
                        Руководитель: <span className="font-semibold text-[#2458D3]">{stateBody.leader_name}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {departments.length > 0 ? (
                      <div className="rounded-full bg-[#EEF2FF] px-3 py-1.5 text-[12px] font-semibold text-[#2458D3]">
                        {departments.length}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 border-t border-[#EDF2F7] pt-4">
                  <button
                    type="button"
                    onClick={() => toggleStateBody(stateBody.id)}
                    className="mb-3 flex w-full items-center justify-between gap-3 text-left"
                    aria-expanded={isExpanded}
                  >
                    <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                      {departments.length
                        ? `Внутренние подразделения: ${departments.length}`
                        : 'Внутренние подразделения отсутствуют'}
                    </div>
                    <span className="text-[11px] font-semibold text-[#2458D3]">
                      {isExpanded ? 'Скрыть' : departments.length > 3 ? 'Показать все' : 'Показать'}
                    </span>
                  </button>

                  {departments.length ? (
                    <div className="space-y-2.5">
                      {visibleDepartments.map((department) => (
                        <div
                          key={`department-${department.id}`}
                          className="rounded-2xl border border-[#ECF0F7] bg-[#FBFCFF] px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold leading-5 text-[#0A1628]">{department.name}</div>
                              <div className="mt-1 text-[12px] text-[#64748B]">Департамент</div>
                              {department.leader_name ? (
                                <div className="mt-2 text-[12px] text-[#475569]">
                                  Руководитель: <span className="font-medium text-[#2458D3]">{department.leader_name}</span>
                                </div>
                              ) : null}
                            </div>
                            {department.children_count > 0 ? (
                              <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#64748B] border border-[#E2E8F0]">
                                Управлений: {department.children_count}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {!departments.length ? (
                    <div className="rounded-2xl border border-dashed border-[#E2E8F0] bg-[#FBFCFF] px-4 py-3 text-[12px] text-[#94A3B8]">
                      Внутренние подразделения отсутствуют.
                    </div>
                  ) : null}
                </div>
              </CardShell>
            )})}
          </div>
        ) : (
          <CardShell className="p-8 text-center text-[#8497B4]">
            Структура министерства пока не заполнена.
          </CardShell>
        )
      ) : null}

      {activeTab === 'publications' ? (
        <div className="space-y-4">
          {publicationsLoading ? <div className="text-[12px] text-[#64748B]">Загрузка публикаций...</div> : null}
          {publications.map((pub) => (
            <PublicationCard
              key={pub.id}
              pub={pub}
              currentProfile={currentProfile}
              currentUserId={currentUserId}
              pubRepo={pubRepo}
              onShare={onShare}
              onAcknowledge={onAcknowledge}
              onEditPub={onEditPub}
              onDeletePub={onDeletePub}
              onCommentCountChange={onCommentCountChange}
              setPreviewImageUrl={setPreviewImageUrl}
              formatPubDate={formatPubDate}
              setError={setAppError}
              setToast={setToast}
            />
          ))}
          {!publicationsLoading && publications.length === 0 ? (
            <div className="bg-white rounded-3xl border border-[#ECEEF3] p-10 text-center text-[#8497B4]">
              Публикации министерства пока отсутствуют.
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'contacts' ? (
        <CardShell className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] text-[#475569]">
            <div><span className="text-[#94A3B8] block mb-1">Адрес</span>{profile?.address || 'Не указан'}</div>
            <div><span className="text-[#94A3B8] block mb-1">Телефон</span>{profile?.phone || 'Не указан'}</div>
            <div><span className="text-[#94A3B8] block mb-1">Email</span>{profile?.email || 'Не указан'}</div>
            <div><span className="text-[#94A3B8] block mb-1">Часы работы</span>{summarizeSchedule(profile?.working_hours) || 'Не указаны'}</div>
            <div><span className="text-[#94A3B8] block mb-1">Обед</span>{summarizeSchedule(profile?.lunch_hours, 'lunch') || 'Не указан'}</div>
          </div>
        </CardShell>
      ) : null}

      {isEditOpen ? (
        <div className="ts-legacy-backdrop fixed inset-0 z-[10050] bg-[#0F172A]/45 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="ts-legacy-dialog w-full max-w-[760px] rounded-[28px] bg-white border border-[#E6EBF4] shadow-[0_30px_80px_rgba(15,23,42,0.22)] overflow-hidden">
            <div className="px-6 py-5 border-b border-[#EDF2F7] flex items-center justify-between">
              <div>
                <div className="text-[22px] font-extrabold text-[#0A1628]">Редактирование министерства</div>
                <div className="text-[12px] text-[#64748B] mt-1">Изменения сохраняются в реальный профиль министерства.</div>
              </div>
              <button onClick={() => setIsEditOpen(false)} className="w-11 h-11 rounded-2xl border border-[#D8E1F0] text-[#64748B] flex items-center justify-center">
                <MaterialSymbol name="close" size={20} color="currentColor" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
              <div className="md:col-span-2 rounded-[24px] border border-[#E6EBF4] bg-[#F8FBFF] p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    {profileDraft.avatar_url ? (
                      <img
                        src={profileDraft.avatar_url}
                        alt={heroName}
                        className="h-20 w-20 rounded-[22px] border border-[#D8E1F0] object-contain bg-white p-2"
                      />
                    ) : (
                      <GradientAvatar initials={getInitials(heroName)} size={80} borderRadius={22} seed={ministryId} />
                    )}
                    <div>
                      <div className="text-[14px] font-bold text-[#0A1628]">Аватарка министерства</div>
                      <div className="mt-1 text-[12px] text-[#64748B]">
                        Загрузи фото, и ссылка подставится автоматически.
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="h-11 px-4 rounded-2xl border border-[#D8E1F0] bg-white text-[#0A1628] text-[13px] font-semibold disabled:opacity-60"
                    >
                      {isUploadingAvatar ? 'Загрузка...' : 'Загрузить фото'}
                    </button>
                    {profileDraft.avatar_url ? (
                      <button
                        type="button"
                        onClick={() => setProfileDraft((prev) => ({ ...prev, avatar_url: '' }))}
                        className="h-11 px-4 rounded-2xl border border-[#F3D1D1] bg-white text-[#B91C1C] text-[13px] font-semibold"
                      >
                        Убрать
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              {[
                ['official_label', 'Подзаголовок'],
                ['organization_type', 'Тип организации'],
                ['address', 'Адрес'],
                ['phone', 'Телефон'],
                ['email', 'Email'],
                ['avatar_url', 'Логотип URL'],
              ].map(([key, label]) => (
                key === 'avatar_url' ? null : (
                <label key={key} className="block">
                  <div className="text-[12px] font-semibold text-[#475569] mb-2">{label}</div>
                  <input
                    value={(profileDraft[key as keyof MinistryProfile] as string) || ''}
                    onChange={(e) => setProfileDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="h-11 w-full rounded-2xl border border-[#D8E1F0] px-4 text-[13px] outline-none focus:border-[#2458D3]"
                  />
                </label>
                )
              ))}
              <div className="md:col-span-2 rounded-[24px] border border-[#E6EBF4] bg-[#FBFCFF] p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-2xl bg-[#EEF2FF] text-[#2458D3] flex items-center justify-center">
                    <MaterialSymbol name="schedule" size={18} color="currentColor" />
                  </div>
                  <div>
                    <div className="text-[14px] font-bold text-[#0A1628]">Часы работы по дням недели</div>
                    <div className="text-[12px] text-[#64748B] mt-1">Для каждого дня можно отдельно выбрать рабочее время и обед.</div>
                  </div>
                </div>
                <div className="space-y-3">
                  {scheduleDraft.map((day, index) => (
                    <div key={day.day} className="rounded-[20px] border border-[#E6EBF4] bg-white p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-[#F3F6FF] text-[#2458D3] flex items-center justify-center text-[13px] font-extrabold">
                            {day.label}
                          </div>
                          <div>
                            <div className="text-[14px] font-bold text-[#0A1628]">{day.title}</div>
                            <label className="mt-1 inline-flex items-center gap-2 text-[12px] text-[#64748B]">
                              <input
                                type="checkbox"
                                checked={day.enabled}
                                onChange={(e) =>
                                  setScheduleDraft((prev) =>
                                    prev.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, enabled: e.target.checked, lunchEnabled: e.target.checked ? item.lunchEnabled : false }
                                        : item,
                                    ),
                                  )
                                }
                                className="h-4 w-4 rounded border-[#CBD5E1] text-[#2458D3] focus:ring-[#2458D3]"
                              />
                              Рабочий день
                            </label>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <label className="block">
                            <div className="mb-1 text-[11px] font-semibold text-[#94A3B8]">С</div>
                            <input
                              type="time"
                              value={day.start}
                              disabled={!day.enabled}
                              onChange={(e) =>
                                setScheduleDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, start: e.target.value } : item))
                              }
                              className="h-11 w-full rounded-2xl border border-[#D8E1F0] px-3 text-[13px] outline-none focus:border-[#2458D3] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                            />
                          </label>
                          <label className="block">
                            <div className="mb-1 text-[11px] font-semibold text-[#94A3B8]">До</div>
                            <input
                              type="time"
                              value={day.end}
                              disabled={!day.enabled}
                              onChange={(e) =>
                                setScheduleDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, end: e.target.value } : item))
                              }
                              className="h-11 w-full rounded-2xl border border-[#D8E1F0] px-3 text-[13px] outline-none focus:border-[#2458D3] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="mt-4 rounded-[18px] bg-[#F8FBFF] p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <label className="inline-flex items-center gap-2 text-[12px] text-[#64748B]">
                            <input
                              type="checkbox"
                              checked={day.lunchEnabled}
                              disabled={!day.enabled}
                              onChange={(e) =>
                                setScheduleDraft((prev) =>
                                  prev.map((item, itemIndex) => itemIndex === index ? { ...item, lunchEnabled: e.target.checked } : item),
                                )
                              }
                              className="h-4 w-4 rounded border-[#CBD5E1] text-[#2458D3] focus:ring-[#2458D3]"
                            />
                            Есть обеденный перерыв
                          </label>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold text-[#94A3B8]">Обед с</div>
                              <input
                                type="time"
                                value={day.lunchStart}
                                disabled={!day.enabled || !day.lunchEnabled}
                                onChange={(e) =>
                                  setScheduleDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, lunchStart: e.target.value } : item))
                                }
                                className="h-11 w-full rounded-2xl border border-[#D8E1F0] px-3 text-[13px] outline-none focus:border-[#2458D3] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-[11px] font-semibold text-[#94A3B8]">Обед до</div>
                              <input
                                type="time"
                                value={day.lunchEnd}
                                disabled={!day.enabled || !day.lunchEnabled}
                                onChange={(e) =>
                                  setScheduleDraft((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, lunchEnd: e.target.value } : item))
                                }
                                className="h-11 w-full rounded-2xl border border-[#D8E1F0] px-3 text-[13px] outline-none focus:border-[#2458D3] disabled:bg-[#F8FAFC] disabled:text-[#94A3B8]"
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <label className="md:col-span-2 block">
                <div className="text-[12px] font-semibold text-[#475569] mb-2">Описание</div>
                <textarea
                  value={profileDraft.summary || ''}
                  onChange={(e) => setProfileDraft((prev) => ({ ...prev, summary: e.target.value }))}
                  rows={6}
                  className="w-full rounded-2xl border border-[#D8E1F0] px-4 py-3 text-[13px] outline-none focus:border-[#2458D3] resize-none"
                />
              </label>
            </div>
            <div className="px-6 py-5 border-t border-[#EDF2F7] flex items-center justify-end gap-2">
              <button onClick={() => setIsEditOpen(false)} className="h-11 px-4 rounded-2xl border border-[#D8E1F0] text-[#0A1628] text-[13px] font-semibold">
                Отмена
              </button>
              <button onClick={handleProfileSave} disabled={isSavingProfile} className="ts-button ts-button--primary h-11 px-5 rounded-2xl bg-[#2458D3] text-white text-[13px] font-semibold disabled:opacity-60">
                {isSavingProfile ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
