/** Единая карточка сотрудника: учётная запись + кадровый профиль (справочник HR). */
export interface AlemContact {
  id: number
  keycloak_id: string
  iin: string | null
  email: string
  username: string
  full_name: string
  first_name: string | null
  last_name: string | null
  middle_name: string | null
  position: string | null
  avatar_url: string | null
  is_active: boolean
  role: string
  organization_id?: string | null
  team_id?: string | null
  manager_id?: number | null
  availability_status?: string | null
  ministry_id: number | null
  state_body_id: number | null
  department_id: number | null
  division_id: number | null
  /** Организация верхнего уровня (name_go) */
  organization: string | null
  /** Подразделение / управление (sub_name) */
  department_unit: string | null
  job_uid: string | null
  sub_uid: string | null
  job_name: string | null
  person_code: string | null
  person_status: string | null
  absence_status: string | null
  card_type: string | null
  bin: string | null
  badge_code: string | null
  last_order_number: string | null
  last_order_date: string | null
  last_begin_date: string | null
  first_begin_date: string | null
  doc_type: string | null
  hr_profile_id: number | null
  user_created_at: string
  hr_updated_at: string | null
}

export interface CreateUserPayload {
  email: string
  username: string
  password: string
  first_name: string
  last_name: string
  organization_id?: string
  team_id?: string
  manager_id?: number
  position?: string
  iin?: string
  role?: string
  ministry_id?: number
  state_body_id?: number
  department_id?: number
  division_id?: number
}

export interface UpdateUserPayload {
  email?: string
  username?: string
  password?: string
  first_name?: string
  last_name?: string
  organization_id?: string
  team_id?: string
  manager_id?: number
  position?: string
  iin?: string
  role?: string
  ministry_id?: number
  state_body_id?: number
  department_id?: number
  division_id?: number
  is_active?: boolean
}

export interface MinistryAdminItem {
  id: number
  name: string
  admin_id?: number | null
  admin_name?: string
}


/** Поля для `GET /api/v1/users/hr/filters/{field}` */
export const HR_FILTER_FIELDS = ['job_name', 'sub_name', 'name_go', 'person_status'] as const
export type HrFilterField = (typeof HR_FILTER_FIELDS)[number]

/** Параметры `GET /api/v1/users/hr` (пагинация, q, точечные фильтры) */
export interface HrUsersListParams {
  limit?: number
  offset?: number
  /** Глобальный поиск: email, логин, ФИО, ИИН, табельный, код, должность, подразделение, организация */
  q?: string
  job_name?: string
  sub_name?: string
  name_go?: string
  person_status?: string
  iin?: string
  cursor?: string
}

export interface AlemContactDirectoryMeta {
  source: string
  generated_at: string
  /** Записей в текущей странице ответа */
  count: number
  total?: number
  /** Страница запроса (0-based) */
  page?: number
  page_size?: number
  pages?: number
  limit?: number
  offset?: number
  next_cursor?: string
}

export interface AlemContactDirectory {
  meta: AlemContactDirectoryMeta
  contacts: AlemContact[]
}
export interface ContactAnalyticsSummary {
  total_logins: number
  unique_users: number
  total_section_visits: number
}

export interface ContactAnalyticsSectionTotal {
  section: string
  visits: number
  unique_users: number
}

export interface ContactAnalyticsMinistryRatingItem {
  ministry_id: number
  ministry_name: string
  active_users: number
  total_logins: number
  total_section_visits: number
  distinct_sections: number
  activity_score: number
}

export interface ContactAnalyticsVisitedSection {
  section: string
  route_path?: string | null
  visits: number
  last_visited_at?: string | null
}

export interface ContactAnalyticsEmployeeItem {
  user_id: number
  full_name: string
  position: string | null
  ministry_id: number | null
  ministry_name: string | null
  state_body_id: number | null
  state_body_name: string | null
  department_id: number | null
  department_name: string | null
  division_id: number | null
  division_name: string | null
  total_logins: number
  total_section_visits: number
  distinct_sections: number
  activity_score: number
  last_login_at: string | null
  last_seen_at: string | null
  visited_sections?: ContactAnalyticsVisitedSection[]
}

export interface ContactAnalyticsResponse {
  scope: string
  effective_ministry_id: number | null
  summary: ContactAnalyticsSummary
  section_totals: ContactAnalyticsSectionTotal[]
  ministry_ranking: ContactAnalyticsMinistryRatingItem[]
  employee_ranking: ContactAnalyticsEmployeeItem[]
  employee_total: number
  employee_limit: number
  employee_offset: number
}

export interface ContactAnalyticsQuery {
  start_date?: string
  end_date?: string
  start_day?: string
  end_day?: string
  ministry_id?: number
  state_body_id?: number
  department_id?: number
  division_id?: number
  limit?: number
  offset?: number
}
