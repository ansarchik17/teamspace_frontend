import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import type {
  ContactAnalyticsEmployeeItem,
  ContactAnalyticsQuery,
  ContactAnalyticsResponse,
  ContactAnalyticsVisitedSection,
} from '../../../domain/entities/AlemContact'
import type { ProfileRepository } from '../../../domain/repositories/ProfileRepository'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { ct } from './contactsText'
import { formatDate as formatSharedDate } from '../../../shared/i18n'

type AlemContactRatingsSectionProps = {
  profileRepository: ProfileRepository
  refreshKey?: number
  userRole?: string
}

type SelectOption = {
  value: string
  label: string
}

const palette = {
  ink: '#1A1F36',
  muted: '#6B7A99',
  line: '#E8ECF2',
  primary: '#2458D3',
  primarySoft: '#EEF2FF',
  cyanSoft: '#E0F2FE',
  amberSoft: '#FFF3E0',
}

const DEPT_COLORS = [
  '#2458D3', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#EF4444', // Red
  '#64748B', // Muted Slate
]

const numberFormatter = new Intl.NumberFormat('ru-RU')

function formatInt(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return formatSharedDate(parsed, { day: '2-digit', month: 'short' })
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return formatSharedDate(parsed, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sectionLabel(section: string): string {
  const labels: Record<string, string> = {
    workspace: 'Workspace',
    alemstore: 'Store',
    calendar: 'Calendar',
    calls_calendar: 'Calls',
    board: 'Board',
    alemai: 'AI',
    alem_rag: 'Team RAG',
    drive: 'Drive',
    notes: 'Notes',
    alem_contact: 'Contact',
    alem_contact_org_map: 'Org map',
    eps: 'EPS',
    profile: 'Profile',
    messenger: 'Messenger',
  }
  return labels[section] ?? section.replaceAll('_', ' ')
}

function buildOptions<T extends number | null | undefined>(
  items: ContactAnalyticsEmployeeItem[],
  getId: (item: ContactAnalyticsEmployeeItem) => T,
  getName: (item: ContactAnalyticsEmployeeItem) => string | null | undefined,
): SelectOption[] {
  const seen = new Map<number, string>()
  for (const item of items) {
    const id = getId(item)
    const name = getName(item)?.trim()
    if (typeof id !== 'number' || !name || seen.has(id)) {
      continue
    }
    seen.set(id, name)
  }
  return Array.from(seen.entries())
    .map(([id, label]) => ({ value: String(id), label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'ru'))
}

function metricTone(index: number): { badge: string; ring: string } {
  if (index === 0) {
    return { badge: 'bg-[#FFF7DB] text-[#8A5A00]', ring: 'ring-[#FFE59A]' }
  }
  if (index === 1) {
    return { badge: 'bg-[#EEF2FF] text-[#2458D3]', ring: 'ring-[#C7D2FE]' }
  }
  if (index === 2) {
    return { badge: 'bg-[#E0F2FE] text-[#0369A1]', ring: 'ring-[#BAE6FD]' }
  }
  return { badge: 'bg-[#F5F7FA] text-[#52627D]', ring: 'ring-[#E8ECF2]' }
}

function RatingSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-semibold text-[#8497B4]">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="h-11 w-full appearance-none rounded-xl border border-[#E8ECF2] bg-white px-3 pr-10 text-[13px] text-[#1A1F36] outline-none transition focus:border-[#2458D3] focus:ring-2 focus:ring-[#EEF2FF] disabled:cursor-not-allowed disabled:bg-[#F5F7FA]"
        >
          <option value="">{ct('ratings.t00')}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7A99]">
          <MaterialSymbol name="expand_more" size={18} color="currentColor" />
        </span>
      </div>
    </label>
  )
}

function SummaryCard({
  title,
  value,
  hint,
  icon,
  tint,
}: {
  title: string
  value: string
  hint: string
  icon: string
  tint: 'blue' | 'cyan' | 'amber'
}) {
  const tone =
    tint === 'cyan'
      ? { bg: palette.cyanSoft, color: '#0369A1' }
      : tint === 'amber'
        ? { bg: palette.amberSoft, color: '#B45309' }
        : { bg: palette.primarySoft, color: palette.primary }

  return (
    <div className="rounded-[16px] border border-[#E8ECF2] bg-white/90 px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8A96AE]">{title}</div>
          <div className="mt-2 text-[28px] font-bold tracking-tight text-[#1A1F36]">{value}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: tone.bg }}>
          <MaterialSymbol name={icon} size={20} color={tone.color} />
        </div>
      </div>
      <div className="mt-3 text-[12px] leading-5 text-[#6B7A99]">{hint}</div>
    </div>
  )
}

function VisitedSectionRow({ item }: { item: ContactAnalyticsVisitedSection }) {
  const lastVisited = formatDateTime(item.last_visited_at)

  return (
    <div className="rounded-2xl border border-[#E8ECF2] bg-white px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#1A1F36]">{sectionLabel(item.section)}</div>
          <div className="mt-1 break-all text-[12px] text-[#6B7A99]">{item.route_path || ct('ratings.t01')}</div>
        </div>
        <div className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-semibold text-[#2458D3]">
          {formatInt(item.visits)}
        </div>
      </div>
      {lastVisited ? <div className="mt-2 text-[11px] text-[#8A96AE]">{ct('ratings.lastVisit', { value: lastVisited })}</div> : null}
    </div>
  )
}

function TopEmployeeRow({ item, index }: { item: ContactAnalyticsEmployeeItem; index: number }) {
  const tone = metricTone(index)
  const lastSeen = formatDate(item.last_seen_at)
  const lastLogin = formatDate(item.last_login_at)
  const orgLine = [item.state_body_name, item.department_name, item.division_name].filter(Boolean).join(' · ')
  const visitedSections = item.visited_sections ?? []
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-[18px] border border-[#E8ECF2] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] transition hover:border-[#D6E0F5] hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[15px] font-bold ring-1 ${tone.badge} ${tone.ring}`}>
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold text-[#1A1F36]">{item.full_name}</div>
              <div className="mt-1 truncate text-[13px] text-[#6B7A99]">{item.position || ct('ratings.t02')}</div>
            </div>
            <div className="rounded-full bg-[#EEF2FF] px-3 py-1 text-[12px] font-semibold text-[#2458D3]">
              Score {formatInt(item.activity_score)}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[#52627D]">
            {item.ministry_name ? (
              <span className="rounded-full bg-[#F5F7FA] px-2.5 py-1">{item.ministry_name}</span>
            ) : null}
            {orgLine ? <span className="rounded-full bg-[#F5F7FA] px-2.5 py-1">{orgLine}</span> : null}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9AA3B8]">{ct('ratings.t03')}</div>
              <div className="mt-1 text-[16px] font-bold text-[#1A1F36]">{formatInt(item.total_logins)}</div>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9AA3B8]">{ct('ratings.t04')}</div>
              <div className="mt-1 text-[16px] font-bold text-[#1A1F36]">{formatInt(item.total_section_visits)}</div>
            </div>
            <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9AA3B8]">{ct('ratings.t05')}</div>
              <div className="mt-1 text-[16px] font-bold text-[#1A1F36]">{formatInt(item.distinct_sections)}</div>
            </div>
          </div>

          {(lastSeen || lastLogin) ? (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#6B7A99]">
              {lastSeen ? <span>{ct('ratings.lastSeen', { value: lastSeen })}</span> : null}
              {lastLogin ? <span>{ct('ratings.lastLogin', { value: lastLogin })}</span> : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-[16px] border border-[#EEF2F7] bg-[#F8FAFC] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8A96AE]">{ct('ratings.t06')}</div>
                <div className="mt-1 text-[13px] text-[#52627D]">
                  {visitedSections.length > 0
                    ? visitedSections.slice(0, 3).map((section) => sectionLabel(section.section)).join(' · ')
                    : ct('ratings.t07')}
                </div>
              </div>
              {visitedSections.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setExpanded((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#D8E2F0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#2458D3] transition hover:bg-[#EEF2FF]"
                >
                  <MaterialSymbol name={expanded ? 'expand_less' : 'expand_more'} size={16} color="currentColor" />
                  {expanded ? ct('ratings.t08') : ct('ratings.t09')}
                </button>
              ) : null}
            </div>

            {expanded && visitedSections.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {visitedSections.map((section, sectionIndex) => (
                  <VisitedSectionRow
                    key={`${item.user_id}-${section.section}-${section.route_path ?? 'none'}-${sectionIndex}`}
                    item={section}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AlemContactRatingsSection({ profileRepository, refreshKey = 0, userRole }: AlemContactRatingsSectionProps) {
  const employeePageSize = 12
  const [analytics, setAnalytics] = useState<ContactAnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ministryId, setMinistryId] = useState('')
  const [stateBodyId, setStateBodyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [employeePage, setEmployeePage] = useState(0)

  const [stateBodies, setStateBodies] = useState<{ id: number; name: string }[]>([])
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([])
  const [divisions, setDivisions] = useState<{ id: number; name: string }[]>([])
  const [cachedMinistries, setCachedMinistries] = useState<any[]>([])
  const [ratingsScopeReady, setRatingsScopeReady] = useState(userRole === 'admin')
  const [breakdownStats, setBreakdownStats] = useState<{ name: string; score: number; activeUsers: number }[]>([])
  const [breakdownStatsLoading, setBreakdownStatsLoading] = useState(false)
  const [breakdownType, setBreakdownType] = useState<'department' | 'state_body' | null>(null)

  useEffect(() => {
    if (!ministryId && !stateBodyId) {
      setBreakdownStats([])
      setBreakdownType(null)
      return
    }

    let cancelled = false
    const run = async () => {
      setBreakdownStatsLoading(true)
      try {
        const query: ContactAnalyticsQuery = {
          limit: 150,
          offset: 0,
        }

        let type: 'department' | 'state_body' = 'department'
        if (stateBodyId) {
          query.state_body_id = Number(stateBodyId)
          type = 'department'
        } else if (ministryId) {
          query.ministry_id = Number(ministryId)
          type = 'state_body'
        }

        const data = await profileRepository.getContactAnalytics(query)
        if (cancelled) return

        const ranking = data.employee_ranking ?? []
        const map = new Map<string, { name: string; score: number; activeUsers: number }>()

        for (const item of ranking) {
          let key = ct('ratings.t10')
          if (type === 'department') {
            key = item.department_name?.trim() || ct('ratings.t11')
          } else {
            key = item.state_body_name?.trim() || ct('ratings.t12')
          }
          const existing = map.get(key) || { name: key, score: 0, activeUsers: 0 }
          existing.score += item.activity_score
          existing.activeUsers += 1
          map.set(key, existing)
        }

        const sorted = Array.from(map.values())
          .sort((a, b) => b.score - a.score)
        
        if (sorted.length > 7) {
          const top = sorted.slice(0, 6)
          const rest = sorted.slice(6)
          const othersScore = rest.reduce((sum, item) => sum + item.score, 0)
          const othersUsers = rest.reduce((sum, item) => sum + item.activeUsers, 0)
          const othersName = type === 'department' ? ct('ratings.t13') : ct('ratings.t14')
          top.push({ name: othersName, score: othersScore, activeUsers: othersUsers })
          setBreakdownStats(top)
        } else {
          setBreakdownStats(sorted)
        }
        setBreakdownType(type)
      } catch {
        if (!cancelled) {
          setBreakdownStats([])
          setBreakdownType(null)
        }
      } finally {
        if (!cancelled) setBreakdownStatsLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [stateBodyId, ministryId, profileRepository, refreshKey])

  const isAdmin = userRole === 'admin'

  useEffect(() => {
    if (isAdmin) {
      setRatingsScopeReady(true)
      return
    }

    let cancelled = false
    const run = async () => {
      try {
        const me = await profileRepository.getMe()
        if (cancelled) return

        if (typeof me.ministryId === 'number' && Number.isFinite(me.ministryId) && me.ministryId > 0) {
          setMinistryId((current) => current || String(me.ministryId))
        }
      } catch {
        if (!cancelled) {
          setError(ct('ratings.t15'))
        }
      } finally {
        if (!cancelled) {
          setRatingsScopeReady(true)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [isAdmin, profileRepository])

  const loadAnalytics = useCallback(async () => {
    if (!isAdmin && !ministryId) {
      return
    }

    setLoading(true)
    setError(null)
    try {
      const query: ContactAnalyticsQuery = {
        limit: employeePageSize,
        offset: employeePage * employeePageSize,
      }
      if (ministryId) query.ministry_id = Number(ministryId)
      if (stateBodyId) query.state_body_id = Number(stateBodyId)
      if (departmentId) query.department_id = Number(departmentId)
      if (divisionId) query.division_id = Number(divisionId)
      const data = await profileRepository.getContactAnalytics(query)
      setAnalytics(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : ct('ratings.t16'))
      setAnalytics(null)
    } finally {
      setLoading(false)
    }
  }, [isAdmin, ministryId, stateBodyId, departmentId, divisionId, employeePage, profileRepository])

  useEffect(() => {
    if (!ratingsScopeReady) {
      return
    }
    void loadAnalytics()
  }, [loadAnalytics, refreshKey, ratingsScopeReady])

  useEffect(() => {
    setEmployeePage(0)
  }, [ministryId, stateBodyId, departmentId, divisionId])

  useEffect(() => {
    if (analytics?.ministry_ranking && analytics.ministry_ranking.length > 0) {
      setCachedMinistries(prev => prev.length === 0 ? analytics.ministry_ranking : prev)
    }
  }, [analytics?.ministry_ranking])

  useEffect(() => {
    const currentMinistryId = ministryId ? Number(ministryId) : analytics?.effective_ministry_id
    if (currentMinistryId) {
      profileRepository.getStateBodies(currentMinistryId)
        .then(setStateBodies)
        .catch(() => setStateBodies([]))
    } else {
      setStateBodies([])
    }
  }, [ministryId, analytics?.effective_ministry_id, profileRepository])

  useEffect(() => {
    if (stateBodyId) {
      const sbid = Number(stateBodyId)
      Promise.all([
        profileRepository.getDepartments(sbid),
        profileRepository.getDivisions({ stateBodyId: sbid }),
      ]).then(([deps, divs]) => {
        setDepartments(deps)
        setDivisions(divs)
      }).catch(() => {
        setDepartments([])
        setDivisions([])
      })
    } else {
      setDepartments([])
      setDivisions([])
    }
  }, [stateBodyId, profileRepository])

  useEffect(() => {
    if (departmentId) {
      profileRepository.getDivisions({ departmentId: Number(departmentId) })
        .then(setDivisions)
        .catch(() => setDivisions([]))
    } else if (stateBodyId) {
      profileRepository.getDivisions({ stateBodyId: Number(stateBodyId) })
        .then(setDivisions)
        .catch(() => setDivisions([]))
    } else {
      setDivisions([])
    }
  }, [departmentId, stateBodyId, profileRepository])

  const employeeItems = analytics?.employee_ranking ?? []
  const sectionItems = analytics?.section_totals ?? []
  const ministryItems = analytics?.ministry_ranking ?? []
  const employeeTotal = analytics?.employee_total ?? 0
  const employeeLimit = analytics?.employee_limit ?? employeePageSize
  const employeeOffset = analytics?.employee_offset ?? employeePage * employeePageSize
  const employeePages = employeeLimit > 0 ? Math.max(1, Math.ceil(employeeTotal / employeeLimit)) : 1
  const canPrevEmployeePage = employeePage > 0
  const canNextEmployeePage = employeeOffset + employeeItems.length < employeeTotal

  const ministryOptions = useMemo(() => {
    const items = cachedMinistries.length > 0 ? cachedMinistries : (analytics?.ministry_ranking ?? [])
    return items.map(item => ({ value: String(item.ministry_id), label: item.ministry_name }))
  }, [cachedMinistries, analytics?.ministry_ranking])

  const stateBodyOptions = useMemo(() => {
    if (stateBodies.length > 0) {
      return stateBodies.map(item => ({ value: String(item.id), label: item.name }))
    }
    return buildOptions(employeeItems, (item) => item.state_body_id, (item) => item.state_body_name)
  }, [stateBodies, employeeItems])

  const departmentOptions = useMemo(() => {
    if (departments.length > 0) {
      return departments.map(item => ({ value: String(item.id), label: item.name }))
    }
    return buildOptions(employeeItems, (item) => item.department_id, (item) => item.department_name)
  }, [departments, employeeItems])

  const divisionOptions = useMemo(() => {
    if (divisions.length > 0) {
      return divisions.map(item => ({ value: String(item.id), label: item.name }))
    }
    return buildOptions(employeeItems, (item) => item.division_id, (item) => item.division_name)
  }, [divisions, employeeItems])

  const topSections = sectionItems.slice(0, 6)
  const sectionsChartData = useMemo(() => {
    return topSections.map((item) => ({
      name: sectionLabel(item.section),
      visits: item.visits,
      uniqueUsers: item.unique_users,
    }))
  }, [topSections])
  const ministryChartData = useMemo(() => {
    return ministryItems.slice(0, 5).map((item) => {
      let shortName = item.ministry_name || ct('ratings.t17')
      if (shortName.toLowerCase().startsWith('министерство ')) { // i18n-ignore
        shortName = shortName.slice(13)
      }
      if (shortName.length > 25) {
        shortName = shortName.slice(0, 22) + '...'
      }
      return {
        fullName: item.ministry_name,
        name: shortName,
        score: item.activity_score,
        activeUsers: item.active_users,
      }
    })
  }, [ministryItems])
  const scopeLabel =
    divisionOptions.find((option) => option.value === divisionId)?.label ||
    departmentOptions.find((option) => option.value === departmentId)?.label ||
    stateBodyOptions.find((option) => option.value === stateBodyId)?.label ||
    ministryItems[0]?.ministry_name ||
    ct('ratings.t19')

  return (
    <section className="rounded-[18px] border border-[#DDE6F3] bg-[radial-gradient(circle_at_top_left,rgba(47,75,226,0.10),transparent_32%),linear-gradient(180deg,#FFFFFF_0%,#F8FAFD_100%)] p-4 shadow-[0_16px_50px_rgba(15,23,42,0.06)] md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#EEF2FF] px-3 py-1 text-[12px] font-semibold text-[#2458D3]">
            <MaterialSymbol name="analytics" size={16} color="currentColor" />
            {ct('ratings.t20')}
          </div>
          <h2 className="mt-3 text-[24px] font-bold tracking-tight text-[#1A1F36]">{ct('ratings.t21')}</h2>
          <p className="mt-2 text-[14px] leading-6 text-[#6B7A99]">
            {ct('ratings.t22')}
            {ct('ratings.t23')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-[#E8ECF2] bg-white px-3 py-2 text-[12px] font-semibold text-[#52627D]">
            {ct('ratings.scope', { value: scopeLabel })}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryCard
          title={ct('ratings.t03')}
          value={formatInt(analytics?.summary.total_logins ?? 0)}
          hint={ct('ratings.t24')}
          icon="login"
          tint="blue"
        />
        <SummaryCard
          title={ct('ratings.t25')}
          value={formatInt(analytics?.summary.unique_users ?? 0)}
          hint={ct('ratings.t26')}
          icon="group"
          tint="cyan"
        />
        <SummaryCard
          title={ct('ratings.t27')}
          value={formatInt(analytics?.summary.total_section_visits ?? 0)}
          hint={ct('ratings.t28')}
          icon="apps"
          tint="amber"
        />
      </div>

      {isAdmin && (
        <div className="mt-5">
          <RatingSelect
            label={ct('ratings.t29')}
            value={ministryId}
            options={ministryOptions}
            disabled={loading}
            onChange={(value) => {
              setMinistryId(value)
              setStateBodyId('')
              setDepartmentId('')
              setDivisionId('')
            }}
          />
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <RatingSelect
          label={ct('ratings.t30')}
          value={stateBodyId}
          options={stateBodyOptions}
          disabled={loading}
          onChange={(value) => {
            setStateBodyId(value)
            setDepartmentId('')
            setDivisionId('')
          }}
        />
        <RatingSelect
          label={ct('ratings.t31')}
          value={departmentId}
          options={departmentOptions}
          disabled={loading}
          onChange={(value) => {
            setDepartmentId(value)
            setDivisionId('')
          }}
        />
        <RatingSelect
          label={ct('ratings.t32')}
          value={divisionId}
          options={divisionOptions}
          disabled={loading}
          onChange={setDivisionId}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(ministryId || stateBodyId || departmentId || divisionId) ? (
          <button
            type="button"
            onClick={() => {
              setMinistryId('')
              setStateBodyId('')
              setDepartmentId('')
              setDivisionId('')
            }}
            className="inline-flex items-center gap-2 rounded-full border border-[#E8ECF2] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#52627D] transition hover:bg-[#F5F7FA]"
          >
            <MaterialSymbol name="filter_alt_off" size={16} color="#6B7A99" />
            {ct('ratings.t33')}
          </button>
        ) : null}
        <div className="inline-flex items-center gap-2 rounded-full border border-[#E8ECF2] bg-white px-3 py-1.5 text-[12px] text-[#6B7A99]">
          <MaterialSymbol name="bar_chart_4_bars" size={16} color="#6B7A99" />
          {ct('ratings.t34')}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{error}</div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <div className="rounded-[18px] border border-[#E8ECF2] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#EEF2F7] pb-3">
            <div>
              <div className="text-[17px] font-bold text-[#1A1F36]">{ct('ratings.t35')}</div>
              <div className="mt-1 text-[12px] text-[#6B7A99]">{ct('ratings.t36')}</div>
            </div>
            <div className="rounded-full bg-[#F5F7FA] px-3 py-1 text-[12px] font-semibold text-[#52627D]">
              {ct('ratings.inResults', { count: formatInt(employeeItems.length) })}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={loading || !canPrevEmployeePage}
              onClick={() => setEmployeePage((value) => Math.max(0, value - 1))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E8ECF2] bg-white text-[#6B7A99] transition hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous employees page"
            >
              <MaterialSymbol name="chevron_left" size={18} color="currentColor" />
            </button>
            <div className="rounded-full bg-[#F5F7FA] px-3 py-1 text-[12px] font-semibold text-[#52627D]">
              {employeePage + 1} / {employeePages} · {formatInt(employeeTotal)}
            </div>
            <button
              type="button"
              disabled={loading || !canNextEmployeePage}
              onClick={() => setEmployeePage((value) => value + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#E8ECF2] bg-white text-[#6B7A99] transition hover:bg-[#F5F7FA] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next employees page"
            >
              <MaterialSymbol name="chevron_right" size={18} color="currentColor" />
            </button>
          </div>
          <div className="mt-4">
            {loading ? (
              <div className="rounded-[16px] border border-dashed border-[#D7DFEC] bg-[#FBFCFE] px-4 py-10 text-center text-[14px] text-[#6B7A99]">
                {ct('ratings.t37')}
              </div>
            ) : employeeItems.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[#D7DFEC] bg-[#FBFCFE] px-4 py-10 text-center text-[14px] text-[#6B7A99]">
                {ct('ratings.t38')}
              </div>
            ) : (
              <div className="space-y-3">
                {employeeItems.map((item, index) => (
                  <TopEmployeeRow key={item.user_id} item={item} index={index} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[18px] border border-[#E8ECF2] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF]">
                <MaterialSymbol name="analytics" size={18} color={palette.primary} />
              </div>
              <div>
                <div className="text-[16px] font-bold text-[#1A1F36]">{ct('ratings.t39')}</div>
                <div className="text-[12px] text-[#6B7A99]">{ct('ratings.t40')}</div>
              </div>
            </div>
            <div className="mt-4 min-h-[280px] w-full">
              {loading ? (
                <div className="text-[13px] text-[#6B7A99] py-10 text-center">{ct('ratings.t41')}</div>
              ) : sectionsChartData.length === 0 ? (
                <div className="text-[13px] text-[#6B7A99] py-10 text-center">{ct('ratings.t42')}</div>
              ) : (
                <div className="h-[280px] w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sectionsChartData}
                      layout="vertical"
                      margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={90}
                        tick={{ fill: '#4D6486', fontSize: 11, fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(238, 242, 255, 0.4)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="rounded-xl border border-[#DDE3EE] bg-white p-3 shadow-lg text-[12px] leading-relaxed">
                                <p className="font-bold text-[#0A1628] mb-1">{data.name}</p>
                                <p className="text-[#4D6486]">
                                  {ct('ratings.visits')} <span className="font-bold text-[#2458D3]">{formatInt(data.visits)}</span>
                                </p>
                                <p className="text-[#4D6486]">
                                  {ct('ratings.uniqueUsers')} <span className="font-bold text-[#0369A1]">{formatInt(data.uniqueUsers)}</span>
                                </p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="visits" radius={[0, 6, 6, 0]} barSize={14}>
                        {sectionsChartData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill="url(#gradVisits)" />
                        ))}
                      </Bar>
                      <defs>
                        <linearGradient id="gradVisits" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#2458D3" />
                          <stop offset="100%" stopColor="#4DBBF0" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {breakdownType && (
            <div className="rounded-[18px] border border-[#E8ECF2] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEF2FF]">
                  <MaterialSymbol name="donut_large" size={18} color="#2458D3" />
                </div>
                <div>
                  <div className="text-[16px] font-bold text-[#1A1F36]">
                    {breakdownType === 'department' ? ct('ratings.t43') : ct('ratings.t44')}
                  </div>
                  <div className="text-[12px] text-[#6B7A99]">
                    {breakdownType === 'department'
                      ? ct('ratings.t45')
                      : ct('ratings.t46')}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col items-center justify-center w-full">
                {breakdownStatsLoading ? (
                  <div className="text-[13px] text-[#6B7A99] py-10 text-center">
                    {breakdownType === 'department' ? ct('ratings.t47') : ct('ratings.t48')}
                  </div>
                ) : breakdownStats.length === 0 ? (
                  <div className="text-[13px] text-[#6B7A99] py-10 text-center">
                    {breakdownType === 'department'
                      ? ct('ratings.t49')
                      : ct('ratings.t50')}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 w-full text-xs">
                    {/* Centered Donut Chart Container */}
                    <div className="relative h-[170px] w-[170px] shrink-0 flex items-center justify-center">
                      <PieChart width={170} height={170}>
                        <Pie
                          data={breakdownStats}
                          cx={85}
                          cy={85}
                          innerRadius={55}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="score"
                        >
                          {breakdownStats.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload
                              return (
                                <div className="rounded-xl border border-[#DDE3EE] bg-white p-3 shadow-lg text-[12px] leading-relaxed max-w-[240px]">
                                  <p className="font-bold text-[#0A1628] mb-1 leading-snug">{data.name}</p>
                                  <p className="text-[#4D6486]">
                                    {ct('ratings.scoreLabel')} <span className="font-bold text-[#2458D3]">{formatInt(data.score)}</span>
                                  </p>
                                  <p className="text-[#4D6486]">
                                    {ct('ratings.inRating')} <span className="font-bold text-[#0369A1]">{formatInt(data.activeUsers)}</span>
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>

                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#8A96AE]">{ct('ratings.t51')}</span>
                        <span className="text-[18px] font-extrabold text-[#1A1F36] mt-0.5">
                          {formatInt(breakdownStats.reduce((sum, item) => sum + item.score, 0))}
                        </span>
                      </div>
                    </div>

                    {/* Vertical Legend List */}
                    <div className="w-full space-y-2 bg-[#FBFCFE] border border-[#EEF2F7] rounded-xl p-3">
                      {breakdownStats.map((item, index) => {
                        const totalScore = breakdownStats.reduce((sum, d) => sum + d.score, 0)
                        const pct = totalScore > 0 ? Math.round((item.score / totalScore) * 100) : 0
                        return (
                          <div key={item.name} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: DEPT_COLORS[index % DEPT_COLORS.length] }}
                              />
                              <span className="truncate font-semibold text-[#1A1F36] text-[11px]" title={item.name}>
                                {item.name}
                              </span>
                            </div>
                            <span className="shrink-0 font-bold text-[#6B7A99] text-[11px] tabular-nums">
                              {pct}%
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-[18px] border border-[#E8ECF2] bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E0F2FE]">
                <MaterialSymbol name="account_tree" size={18} color="#0369A1" />
              </div>
              <div>
                <div className="text-[16px] font-bold text-[#1A1F36]">{ct('ratings.t52')}</div>
                <div className="text-[12px] text-[#6B7A99]">{ct('ratings.t53')}</div>
              </div>
            </div>

            <div className="mt-4 min-h-[220px] w-full">
              {loading ? (
                <div className="text-[13px] text-[#6B7A99] py-8 text-center">{ct('ratings.t54')}</div>
              ) : ministryChartData.length === 0 ? (
                <div className="text-[13px] text-[#6B7A99] py-8 text-center">{ct('ratings.t55')}</div>
              ) : (
                <div className="h-[220px] w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ministryChartData}
                      layout="vertical"
                      margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={90}
                        tick={{ fill: '#4D6486', fontSize: 11, fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(240, 253, 244, 0.4)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload
                            return (
                              <div className="rounded-xl border border-[#DDE3EE] bg-white p-3 shadow-lg text-[12px] leading-relaxed max-w-[260px]">
                                <p className="font-bold text-[#0A1628] mb-1 leading-snug">{data.fullName}</p>
                                <p className="text-[#4D6486]">
                                  {ct('ratings.scoreLabel')} <span className="font-bold text-[#10B981]">{formatInt(data.score)}</span>
                                </p>
                                <p className="text-[#4D6486]">
                                  {ct('ratings.activeUsers')} <span className="font-bold text-[#0369A1]">{formatInt(data.activeUsers)}</span>
                                </p>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={12}>
                        {ministryChartData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill="url(#gradMinistry)" />
                        ))}
                      </Bar>
                      <defs>
                        <linearGradient id="gradMinistry" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#10B981" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                      </defs>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-[13px] text-[#6B7A99]">{ct('ratings.t56')}</div>
              ) : ministryItems.length === 0 ? (
                <div className="text-[13px] text-[#6B7A99]">{ct('ratings.t55')}</div>
              ) : (
                ministryItems.slice(0, 5).map((item, index) => (
                  <div key={`${item.ministry_id}-${index}`} className="rounded-[14px] border border-[#EEF2F7] bg-[#FBFCFE] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#1A1F36]">{item.ministry_name}</div>
                        <div className="mt-1 text-[12px] text-[#6B7A99]">{ct('ratings.activeUsers')} {formatInt(item.active_users)}</div>
                      </div>
                      <div className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-semibold text-[#2458D3]">
                        {formatInt(item.activity_score)}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-white px-2 py-2">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-[#9AA3B8]">{ct('ratings.t03')}</div>
                        <div className="mt-1 text-[13px] font-bold text-[#1A1F36]">{formatInt(item.total_logins)}</div>
                      </div>
                      <div className="rounded-xl bg-white px-2 py-2">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-[#9AA3B8]">{ct('ratings.t04')}</div>
                        <div className="mt-1 text-[13px] font-bold text-[#1A1F36]">{formatInt(item.total_section_visits)}</div>
                      </div>
                      <div className="rounded-xl bg-white px-2 py-2">
                        <div className="text-[10px] uppercase tracking-[0.08em] text-[#9AA3B8]">{ct('ratings.t05')}</div>
                        <div className="mt-1 text-[13px] font-bold text-[#1A1F36]">{formatInt(item.distinct_sections)}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

