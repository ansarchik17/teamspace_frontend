import type { ProfileStats } from '../../domain/entities/ProfileStats'
import type { ProfileHr } from '../../domain/entities/ProfileHr'
import type { ProfileUser } from '../../domain/entities/ProfileUser'
import type { SaveE2eeKeyBackupInput } from '../../domain/entities/WebE2eeBootstrap'
import {
  availabilityStatuses,
  type AvailabilityStatus,
  type ChangePasswordRequest,
  type ChangePasswordResponse,
  type CurrentProfile,
  type UpdateAvatarRequest,
  type UpdateStatusRequest,
  type UpdateStatusResponse,
} from '../../domain/entities/profile-settings/ProfileSettingsModels'
import type {
  CreateEducationInput,
  CreateLicenseCertificationInput,
  EducationListResponse,
  LicenseCertificationListResponse,
  UpdateEducationInput,
  UpdateLicenseCertificationInput,
  UserEducationItem,
  UserLicenseCertificationItem,
} from '../../domain/entities/profile-settings/ProfileSectionsModels'
import type {
  CreateUserPayload,
  UpdateUserPayload,
  MinistryAdminItem,
  AlemContact,
  AlemContactDirectory,
  ContactAnalyticsQuery,
  ContactAnalyticsResponse,
  HrFilterField,
  HrUsersListParams,
} from '../../domain/entities/AlemContact'
import type { ProfileRepository, ManagementVacation } from '../../domain/repositories/ProfileRepository'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { normalizeBackendAssetUrl, resolveProfileAssetUrl } from '../http/normalizeBackendAssetUrl'

interface CurrentProfileDto {
  id: number
  keycloak_id?: string
  iin?: string
  email: string
  username?: string
  first_name?: string
  last_name?: string
  full_name?: string
  avatar_url?: string
  bio?: string
  position?: string
  is_active?: boolean
  availability_status?: string | null
  full_name_local?: string
  is_first_login?: boolean
  last_login_at?: string
  last_seen_at?: string
  created_at?: string
  role?: string
  organization_id?: string | null
  team_id?: string | null
  manager_id?: number | null
  ministry_id?: number | null
  state_body_id?: number | null
  department_id?: number | null
  division_id?: number | null
  is_support?: boolean
  can_view_full_drive_activity?: boolean
  can_view_full_drive_activity_by_position?: boolean
  can_view_full_drive_activity_effective?: boolean
}

interface ProfileStatsDto {
  target_user_id: number
  period: string
  review_count: number
  avg_data_fluency: number
  avg_project_management: number
  avg_digital_proficiency: number
  avg_crisis_communication: number
  avg_service_design_thinking: number
}

interface HrProfileDto {
  name_go?: string
  doc_type?: string
  job_name?: string
  sub_name?: string
  last_order_date?: string
  last_order_number?: string
}

interface HrSearchItemDto {
  hr_profile?: HrProfileDto | null
}

interface HrSearchResponseDto {
  items?: HrSearchItemDto[]
}

interface HrProfileListDto {
  id?: number
  user_id?: number
  person_code?: string
  badge_code?: string
  iin?: string
  last_name?: string
  first_name?: string
  middle_name?: string
  doc_type?: string
  person_status?: string
  last_order_number?: string
  last_order_date?: string
  last_begin_date?: string
  first_begin_date?: string
  absence_status?: string
  absence_order_number?: string
  card_type?: string
  bin?: string
  name_go?: string
  job_name?: string
  job_uid?: string
  sub_name?: string
  sub_uid?: string
  created_at?: string
  updated_at?: string
}

interface HrListItemDto {
  user: CurrentProfileDto
  hr_profile?: HrProfileListDto | null
}

interface HrListResponseDto {
  count?: number
  items?: HrListItemDto[]
  limit?: number
  offset?: number
  pages?: number
  query?: string
  total?: number
  next_cursor?: string
}

interface UserEducationItemDto {
  id: number
  user_id: number
  school_name?: string
  school_avatar_url?: string | null
  school_avatar_object_name?: string | null
  degree?: string | null
  field_of_study?: string
  start_date?: string
  end_date?: string | null
  created_at?: string
  updated_at?: string
}

interface EducationListResponseDto {
  user_id: number
  count: number
  items?: UserEducationItemDto[]
}

interface UserLicenseCertificationItemDto {
  id: number
  user_id: number
  name?: string
  issuing_organization?: string
  skill_name?: string
  avatar_url?: string | null
  avatar_object_name?: string | null
  issue_date?: string
  expiration_date?: string | null
  attachment_object_name?: string | null
  attachment_file_name?: string | null
  attachment_content_type?: string | null
  attachment_size_bytes?: number | null
  attachment_download_url?: string | null
  created_at?: string
  updated_at?: string
}

interface LicenseCertificationListResponseDto {
  user_id: number
  count: number
  items?: UserLicenseCertificationItemDto[]
}

interface UploadedFileDto {
  object_name: string
  url: string
  filename: string
  size: number
  type: string
}

interface UpdateStatusResponseDto {
  message?: string
  status?: string
}

interface ChangePasswordResponseDto {
  message?: string
}

interface SaveE2eeBackupRequestDto {
  encrypted_private_key: string
  salt: string
  iv: string
  kdf_algorithm: string
  kdf_params: {
    iterations?: number
    hash?: string
    key_length?: number
    memory?: number
    memory_kib?: number
    parallelism?: number
    passes?: number
  }
  version: number
  backup_key_type: string
  backup_key_format: string
  backup_key_scope: string
  backup_format_version: number
  cipher_algorithm: string
  cipher_tag_embedded: boolean
  aad_mode: string
  password_processing: string
}

const isAvailabilityStatus = (value: unknown): value is AvailabilityStatus =>
  typeof value === 'string' && availabilityStatuses.includes(value as AvailabilityStatus)

const toSaveE2eeBackupRequestDto = (input: SaveE2eeKeyBackupInput): SaveE2eeBackupRequestDto => ({
  encrypted_private_key: input.encryptedPrivateKey,
  salt: input.salt,
  iv: input.iv,
  kdf_algorithm: input.kdfAlgorithm,
  kdf_params: {
    iterations: input.kdfParams.iterations,
    hash: input.kdfParams.hash,
    key_length: input.kdfParams.keyLength,
    memory: input.kdfParams.memory,
    memory_kib: input.kdfParams.memoryKiB,
    parallelism: input.kdfParams.parallelism,
    passes: input.kdfParams.passes,
  },
  version: input.version,
  backup_key_type: input.backupKeyType,
  backup_key_format: input.backupKeyFormat,
  backup_key_scope: input.backupKeyScope,
  backup_format_version: input.backupFormatVersion,
  cipher_algorithm: input.cipherAlgorithm,
  cipher_tag_embedded: input.cipherTagEmbedded,
  aad_mode: input.aadMode,
  password_processing: input.passwordProcessing,
})

const toCurrentProfile = (dto: CurrentProfileDto): CurrentProfile => ({
  id: dto.id,
  keycloakId: dto.keycloak_id ?? '',
  iin: dto.iin ?? '',
  email: dto.email ?? '',
  username: dto.username ?? '',
  firstName: dto.first_name ?? '',
  lastName: dto.last_name ?? '',
  fullName: dto.full_name ?? '',
  avatarUrl: normalizeBackendAssetUrl(dto.avatar_url) ?? '',
  bio: dto.bio ?? '',
  position: dto.position ?? '',
  isActive: Boolean(dto.is_active),
  availabilityStatus: isAvailabilityStatus(dto.availability_status) ? dto.availability_status : null,
  fullNameLocal: dto.full_name_local ?? '',
  isFirstLogin: Boolean(dto.is_first_login),
  lastLoginAt: dto.last_login_at ?? '',
  lastSeenAt: dto.last_seen_at ?? '',
  createdAt: dto.created_at ?? '',
  role: dto.role ?? '',
  ministryId: typeof dto.ministry_id === 'number' ? dto.ministry_id : null,
  stateBodyId: typeof dto.state_body_id === 'number' ? dto.state_body_id : null,
  departmentId: typeof dto.department_id === 'number' ? dto.department_id : null,
  divisionId: typeof dto.division_id === 'number' ? dto.division_id : null,
  isSupport: Boolean(dto.is_support),
  canViewFullDriveActivity: Boolean(dto.can_view_full_drive_activity),
  canViewFullDriveActivityByPosition: Boolean(dto.can_view_full_drive_activity_by_position),
  canViewFullDriveActivityEffective: Boolean(dto.can_view_full_drive_activity_effective),
})

const toProfileUser = (profile: CurrentProfile): ProfileUser => ({
  id: profile.id,
  uuid: profile.keycloakId,
  email: profile.email,
  firstName: profile.firstName,
  lastName: profile.lastName,
  username: profile.username,
  iin: profile.iin,
  ministryId: Number(profile.ministryId ?? 0),
  fullName: profile.fullName,
  isActive: profile.isActive,
  lastLoginAt: profile.lastLoginAt,
  createdAt: profile.createdAt,
  avatarUrl: profile.avatarUrl,
  isFirstLogin: profile.isFirstLogin,
  availabilityStatus: profile.availabilityStatus ?? '',
})

const toProfileStats = (dto: ProfileStatsDto): ProfileStats => ({
  targetUserId: Number(dto.target_user_id ?? 0),
  period: dto.period ?? 'month',
  reviewCount: Number(dto.review_count ?? 0),
  avgDataFluency: Number(dto.avg_data_fluency ?? 0),
  avgProjectManagement: Number(dto.avg_project_management ?? 0),
  avgDigitalProficiency: Number(dto.avg_digital_proficiency ?? 0),
  avgCrisisCommunication: Number(dto.avg_crisis_communication ?? 0),
  avgServiceDesignThinking: Number(dto.avg_service_design_thinking ?? 0),
})

const normalizeIsoDate = (value?: string): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toISOString().slice(0, 10)
}

const toProfileHr = (dto: HrProfileDto): ProfileHr => ({
  nameGo: dto.name_go ?? '',
  docType: dto.doc_type ?? '',
  jobName: dto.job_name ?? '',
  subName: dto.sub_name ?? '',
  lastOrderDate: normalizeIsoDate(dto.last_order_date),
  lastOrderNumber: dto.last_order_number ?? '',
})

const toUserEducationItem = (dto: UserEducationItemDto): UserEducationItem => ({
  id: Number(dto.id ?? 0),
  userId: Number(dto.user_id ?? 0),
  schoolName: dto.school_name ?? '',
  schoolAvatarUrl: resolveProfileAssetUrl(dto.school_avatar_url, dto.school_avatar_object_name),
  schoolAvatarObjectName: dto.school_avatar_object_name ?? null,
  degree: dto.degree ?? null,
  fieldOfStudy: dto.field_of_study ?? '',
  startDate: dto.start_date ?? '',
  endDate: dto.end_date ?? null,
  createdAt: dto.created_at ?? '',
  updatedAt: dto.updated_at ?? '',
})

const toEducationListResponse = (dto: EducationListResponseDto): EducationListResponse => ({
  userId: Number(dto.user_id ?? 0),
  count: Number(dto.count ?? dto.items?.length ?? 0),
  items: Array.isArray(dto.items) ? dto.items.map(toUserEducationItem) : [],
})

const toUserLicenseCertificationItem = (
  dto: UserLicenseCertificationItemDto,
): UserLicenseCertificationItem => ({
  id: Number(dto.id ?? 0),
  userId: Number(dto.user_id ?? 0),
  name: dto.name ?? '',
  issuingOrganization: dto.issuing_organization ?? '',
  skillName: dto.skill_name ?? '',
  avatarUrl: resolveProfileAssetUrl(dto.avatar_url, dto.avatar_object_name),
  avatarObjectName: dto.avatar_object_name ?? null,
  issueDate: dto.issue_date ?? '',
  expirationDate: dto.expiration_date ?? null,
  attachmentObjectName: dto.attachment_object_name ?? null,
  attachmentFileName: dto.attachment_file_name ?? null,
  attachmentContentType: dto.attachment_content_type ?? null,
  attachmentSizeBytes: typeof dto.attachment_size_bytes === 'number' ? dto.attachment_size_bytes : null,
  attachmentDownloadUrl: normalizeBackendAssetUrl(dto.attachment_download_url ?? null) ?? null,
  createdAt: dto.created_at ?? '',
  updatedAt: dto.updated_at ?? '',
})

const toLicenseCertificationListResponse = (
  dto: LicenseCertificationListResponseDto,
): LicenseCertificationListResponse => ({
  userId: Number(dto.user_id ?? 0),
  count: Number(dto.count ?? dto.items?.length ?? 0),
  items: Array.isArray(dto.items) ? dto.items.map(toUserLicenseCertificationItem) : [],
})

export class HttpProfileRepository implements ProfileRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async getMe(): Promise<CurrentProfile> {
    const response = await this.authorizedFetch('/api/v1/auth/me')
    const data = (await response.json()) as CurrentProfileDto
    return toCurrentProfile(data)
  }

  async getMyProfile(): Promise<ProfileUser> {
    const profile = await this.getMe()
    return toProfileUser(profile)
  }

  async getHrProfileByIin(iin: string): Promise<ProfileHr | null> {
    if (!iin.trim()) return null

    const response = await this.authorizedFetch(`/api/v1/users/hr?q=${encodeURIComponent(iin)}`)
    const data = (await response.json()) as HrSearchResponseDto
    const item = Array.isArray(data.items) ? data.items[0] : undefined
    if (!item?.hr_profile) return null
    return toProfileHr(item.hr_profile)
  }

  private static parseHrFilterResponsePayload(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw
        .map((x) => (x == null ? '' : String(x).trim()))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'ru'))
    }
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>
      for (const key of ['items', 'values', 'data', 'results'] as const) {
        const arr = o[key]
        if (Array.isArray(arr)) return HttpProfileRepository.parseHrFilterResponsePayload(arr)
      }
    }
    return []
  }

  async listHrFilterValues(field: HrFilterField): Promise<string[]> {
    const response = await this.authorizedFetch(`/api/v1/users/hr/filters/${field}`)
    const data = (await response.json()) as unknown
    return HttpProfileRepository.parseHrFilterResponsePayload(data)
  }

  async listHrUsers(params?: HrUsersListParams): Promise<AlemContactDirectory> {
    const limit = params?.limit ?? 20
    const offset = params?.offset ?? 0
    const q = params?.q?.trim() ?? ''
    const qs = new URLSearchParams()
    qs.set('limit', String(limit))
    qs.set('offset', String(offset))
    if (q) qs.set('q', q)
    const setFilter = (key: string, value: string | undefined) => {
      const t = value?.trim()
      if (t) qs.set(key, t)
    }
    setFilter('job_name', params?.job_name)
    setFilter('sub_name', params?.sub_name)
    setFilter('name_go', params?.name_go)
    setFilter('person_status', params?.person_status)
    setFilter('iin', params?.iin)
    setFilter('cursor', params?.cursor)
    const response = await this.authorizedFetch(`/api/v1/users/hr?${qs.toString()}`)
    const data = (await response.json()) as HrListResponseDto
    const items = Array.isArray(data.items) ? data.items : []
    const contacts = items.map((row) => HttpProfileRepository.mapHrListRow(row))
    const resLimit = typeof data.limit === 'number' ? data.limit : limit
    const resOffset = typeof data.offset === 'number' ? data.offset : offset
    const page = resLimit > 0 ? Math.floor(resOffset / resLimit) : 0
    return {
      meta: {
        source: 'api/v1/users/hr',
        generated_at: new Date().toISOString(),
        count: contacts.length,
        total: typeof data.total === 'number' ? data.total : undefined,
        page,
        page_size: resLimit,
        pages: typeof data.pages === 'number' ? data.pages : undefined,
        limit: resLimit,
        offset: resOffset,
        next_cursor: data.next_cursor,
      },
      contacts,
    }
  }

  /** Фамилия Имя Отчество — приоритет у частей из HR, а не у укороченного user.full_name. */
  private static buildHrPersonFullName(u: CurrentProfileDto, h?: HrProfileListDto | null): string {
    const last = (h?.last_name ?? u.last_name)?.trim() ?? ''
    const first = (h?.first_name ?? u.first_name)?.trim() ?? ''
    const middle = h?.middle_name?.trim() ?? ''
    const fromParts = [last, first, middle].filter((part) => part.length > 0).join(' ')
    if (fromParts) {
      return fromParts
    }
    const fromUserFull = u.full_name?.trim()
    if (fromUserFull) {
      return fromUserFull
    }
    return [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
  }

  private static mapHrListRow(item: HrListItemDto): AlemContact {
    const u = item.user
    const h = item.hr_profile
    const avatarRaw = u.avatar_url ?? null
    return {
      id: u.id,
      keycloak_id: typeof u.keycloak_id === 'string' ? u.keycloak_id : '',
      iin: u.iin ?? h?.iin ?? null,
      email: u.email,
      username: u.username ?? '',
      full_name: HttpProfileRepository.buildHrPersonFullName(u, h),
      first_name: u.first_name ?? h?.first_name ?? null,
      last_name: u.last_name ?? h?.last_name ?? null,
      middle_name: h?.middle_name ?? null,
      position: u.position ?? h?.job_name ?? null,
      avatar_url: normalizeBackendAssetUrl(avatarRaw) ?? avatarRaw,
      is_active: Boolean(u.is_active),
      role: u.role ?? 'user',
      organization_id: u.organization_id ?? null,
      team_id: u.team_id ?? null,
      manager_id: u.manager_id ?? null,
      availability_status: u.availability_status ?? null,
      ministry_id: u.ministry_id ?? null,
      state_body_id: u.state_body_id ?? null,
      department_id: u.department_id ?? null,
      division_id: u.division_id ?? null,
      organization: h?.name_go ?? null,
      department_unit: h?.sub_name ?? null,
      job_uid: h?.job_uid ?? null,
      sub_uid: h?.sub_uid ?? null,
      job_name: h?.job_name ?? null,
      person_code: h?.person_code ?? null,
      person_status: h?.person_status ?? null,
      absence_status: h?.absence_status || null,
      card_type: h?.card_type ?? null,
      bin: h?.bin ?? null,
      badge_code: h?.badge_code || null,
      last_order_number: h?.last_order_number || null,
      last_order_date: h?.last_order_date ?? null,
      last_begin_date: h?.last_begin_date ?? null,
      first_begin_date: h?.first_begin_date ?? null,
      doc_type: h?.doc_type || null,
      hr_profile_id: typeof h?.id === 'number' ? h.id : null,
      user_created_at: u.created_at ?? new Date().toISOString(),
      hr_updated_at: h?.updated_at ?? null,
    }
  }

  async getMyStats(): Promise<ProfileStats> {
    const response = await this.authorizedFetch('/api/v1/reviews/my-stats')
    const data = (await response.json()) as ProfileStatsDto
    return toProfileStats(data)
  }

  async getMyEducations(): Promise<EducationListResponse> {
    const response = await this.authorizedFetch('/api/v1/users/profile/education')
    const data = (await response.json()) as EducationListResponseDto
    return toEducationListResponse(data)
  }

  async getMyLicenseCertifications(): Promise<LicenseCertificationListResponse> {
    const response = await this.authorizedFetch('/api/v1/users/profile/licenses-certifications')
    const data = (await response.json()) as LicenseCertificationListResponseDto
    return toLicenseCertificationListResponse(data)
  }

  async createEducation(payload: CreateEducationInput): Promise<UserEducationItem> {
    let uploadedAvatar: UploadedFileDto | null = null

    if (payload.avatarFile) {
      uploadedAvatar = await this.uploadFile(payload.avatarFile, 'image')
    }

    const response = await this.authorizedFetch('/api/v1/users/profile/education', {
      method: 'POST',
      body: JSON.stringify({
        school_name: payload.schoolName,
        school_avatar_url: uploadedAvatar?.url,
        degree: payload.degree?.trim() || undefined,
        field_of_study: payload.fieldOfStudy,
        start_date: payload.startDate,
        end_date: payload.endDate?.trim() || undefined,
      }),
    })

    return toUserEducationItem((await response.json()) as UserEducationItemDto)
  }

  async createLicenseCertification(
    payload: CreateLicenseCertificationInput,
  ): Promise<UserLicenseCertificationItem> {
    let uploadedFile: UploadedFileDto | null = null
    let uploadedAvatar: UploadedFileDto | null = null

    if (payload.avatarFile) {
      uploadedAvatar = await this.uploadFile(payload.avatarFile, 'image')
    }

    if (payload.attachmentFile) {
      uploadedFile = await this.uploadFile(payload.attachmentFile, 'document')
    }

    const response = await this.authorizedFetch('/api/v1/users/profile/licenses-certifications', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        issuing_organization: payload.issuingOrganization,
        skill_name: payload.skillName,
        avatar_url: uploadedAvatar?.url,
        issue_date: payload.issueDate,
        expiration_date: payload.expirationDate?.trim() || undefined,
        attachment_object_name: uploadedFile?.object_name,
        attachment_file_name: uploadedFile?.filename,
        attachment_content_type: payload.attachmentFile?.type || uploadedFile?.type,
        attachment_size_bytes: payload.attachmentFile?.size || uploadedFile?.size,
      }),
    })

    return toUserLicenseCertificationItem((await response.json()) as UserLicenseCertificationItemDto)
  }

  async updateEducation(id: number, payload: UpdateEducationInput): Promise<UserEducationItem> {
    let uploadedAvatar: UploadedFileDto | null = null

    if (payload.avatarFile) {
      uploadedAvatar = await this.uploadFile(payload.avatarFile, 'image')
    }

    const response = await this.authorizedFetch(`/api/v1/users/profile/education/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        school_name: payload.schoolName,
        school_avatar_url: uploadedAvatar?.url ?? (payload.removeAvatar ? '' : undefined),
        degree: payload.degree?.trim() || '',
        field_of_study: payload.fieldOfStudy,
        start_date: payload.startDate,
        end_date: payload.endDate?.trim() || '',
      }),
    })

    return toUserEducationItem((await response.json()) as UserEducationItemDto)
  }

  async updateLicenseCertification(
    id: number,
    payload: UpdateLicenseCertificationInput,
  ): Promise<UserLicenseCertificationItem> {
    let uploadedAvatar: UploadedFileDto | null = null
    let uploadedAttachment: UploadedFileDto | null = null

    if (payload.avatarFile) {
      uploadedAvatar = await this.uploadFile(payload.avatarFile, 'image')
    }

    if (payload.attachmentFile) {
      uploadedAttachment = await this.uploadFile(payload.attachmentFile, 'document')
    }

    const response = await this.authorizedFetch(`/api/v1/users/profile/licenses-certifications/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: payload.name,
        issuing_organization: payload.issuingOrganization,
        skill_name: payload.skillName,
        avatar_url: uploadedAvatar?.url ?? (payload.removeAvatar ? '' : undefined),
        issue_date: payload.issueDate,
        expiration_date: payload.expirationDate?.trim() || '',
        attachment_object_name:
          uploadedAttachment?.object_name ?? (payload.removeAttachment ? '' : undefined),
        attachment_file_name:
          uploadedAttachment?.filename ?? (payload.removeAttachment ? '' : undefined),
        attachment_content_type:
          (payload.attachmentFile?.type || uploadedAttachment?.type) ??
          (payload.removeAttachment ? '' : undefined),
        attachment_size_bytes:
          payload.attachmentFile?.size ?? uploadedAttachment?.size ?? (payload.removeAttachment ? null : undefined),
      }),
    })

    return toUserLicenseCertificationItem((await response.json()) as UserLicenseCertificationItemDto)
  }

  async deleteEducation(id: number): Promise<void> {
    await this.authorizedFetch(`/api/v1/users/profile/education/${id}`, {
      method: 'DELETE',
    })
  }

  async deleteLicenseCertification(id: number): Promise<void> {
    await this.authorizedFetch(`/api/v1/users/profile/licenses-certifications/${id}`, {
      method: 'DELETE',
    })
  }

  async updateStatus(payload: UpdateStatusRequest): Promise<UpdateStatusResponse> {
    const response = await this.authorizedFetch('/api/v1/users/status', {
      method: 'PUT',
      body: JSON.stringify({
        status: payload.status,
      }),
    })

    const data = (await response.json()) as UpdateStatusResponseDto
    return {
      message: data.message ?? '',
      status: isAvailabilityStatus(data.status) ? data.status : payload.status,
    }
  }

  async updateAvatar(payload: UpdateAvatarRequest): Promise<CurrentProfile> {
    let avatarUrl = payload.avatarUrl

    if (payload.avatarFile) {
      const formData = new FormData()
      formData.append('file', payload.avatarFile)
      formData.append('type', 'image')

      const uploadResponse = await this.authorizedFetch('/api/v1/files/upload', {
        method: 'POST',
        body: formData,
      })
      const uploadData = (await uploadResponse.json()) as { url: string }
      avatarUrl = uploadData.url
    }

    if (!avatarUrl) {
      throw new Error('Аватар не выбран.')
    }

    const response = await this.authorizedFetch('/api/v1/auth/me/avatar', {
      method: 'PUT',
      body: JSON.stringify({
        avatar_url: avatarUrl,
      }),
    })

    const data = (await response.json()) as CurrentProfileDto
    return toCurrentProfile(data)
  }

  async updateEmail(email: string): Promise<CurrentProfile> {
    const response = await this.authorizedFetch('/api/v1/auth/me/email', {
      method: 'PUT',
      body: JSON.stringify({ email }),
    })
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.message || 'Ошибка обновления email')
    }
    const data = (await response.json()) as CurrentProfileDto
    return toCurrentProfile(data)
  }

  async trackSectionVisit(section: string, path?: string): Promise<void> {
    await this.authorizedFetch('/api/v1/analytics/section-visits', {
      method: 'POST',
      body: JSON.stringify({
        section,
        path,
      }),
    })
  }

  async checkMinistryAnalyticsAccess(ministryId: number): Promise<boolean> {
    const response = await this.authorizedFetch(`/api/v1/analytics/ministry-access-check?ministry_id=${ministryId}`)
    const data = (await response.json().catch(() => ({}))) as { allowed?: unknown }
    return Boolean(data.allowed)
  }

  async getContactAnalytics(params?: ContactAnalyticsQuery): Promise<ContactAnalyticsResponse> {
    const qs = new URLSearchParams()
    const setNumber = (key: string, value: number | undefined) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        qs.set(key, String(value))
      }
    }
    const setText = (key: string, value: string | undefined) => {
      const normalized = value?.trim()
      if (normalized) {
        qs.set(key, normalized)
      }
    }

    setText('start_date', params?.start_date)
    setText('end_date', params?.end_date)
    setText('start_day', params?.start_day)
    setText('end_day', params?.end_day)
    setNumber('ministry_id', params?.ministry_id)
    setNumber('state_body_id', params?.state_body_id)
    setNumber('department_id', params?.department_id)
    setNumber('division_id', params?.division_id)
    setNumber('limit', params?.limit)
    setNumber('offset', params?.offset)

    const query = qs.toString()
    const response = await this.authorizedFetch(`/api/v1/analytics/ministry-rating${query ? `?${query}` : ''}`)
    const data = (await response.json()) as ContactAnalyticsResponse
    return {
      scope: data.scope ?? 'ministry',
      effective_ministry_id: data.effective_ministry_id ?? null,
      summary: {
        total_logins: Number(data.summary?.total_logins ?? 0),
        unique_users: Number(data.summary?.unique_users ?? 0),
        total_section_visits: Number(data.summary?.total_section_visits ?? 0),
      },
      section_totals: Array.isArray(data.section_totals) ? data.section_totals : [],
      ministry_ranking: Array.isArray(data.ministry_ranking) ? data.ministry_ranking : [],
      employee_ranking: Array.isArray(data.employee_ranking) ? data.employee_ranking : [],
      employee_total: Number(data.employee_total ?? 0),
      employee_limit: Number(data.employee_limit ?? params?.limit ?? 12),
      employee_offset: Number(data.employee_offset ?? params?.offset ?? 0),
    }
  }
  async changePassword(payload: ChangePasswordRequest): Promise<ChangePasswordResponse> {
    const response = await this.authorizedFetch('/api/v1/auth/password', {
      method: 'PUT',
      body: JSON.stringify({
        old_password: payload.oldPassword,
        new_password: payload.newPassword,
        ...(payload.e2eeBackup ? { e2ee_backup: toSaveE2eeBackupRequestDto(payload.e2eeBackup) } : {}),
      }),
    })

    const data = (await response.json()) as ChangePasswordResponseDto
    return {
      message: data.message ?? '',
    }
  }

  async getStateBodies(ministryId: number): Promise<{ id: number; name: string }[]> {
    const response = await this.authorizedFetch(`/api/v1/hierarchy/state-bodies?ministry_id=${ministryId}`)
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return data.map((item: any) => ({
      id: Number(item.id),
      name: String(item.name || ''),
    }))
  }

  async getDepartments(stateBodyId: number): Promise<{ id: number; name: string }[]> {
    const response = await this.authorizedFetch(`/api/v1/hierarchy/departments?state_body_id=${stateBodyId}`)
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return data.map((item: any) => ({
      id: Number(item.id),
      name: String(item.name || ''),
    }))
  }

  async getDivisions(params: { departmentId?: number; stateBodyId?: number }): Promise<{ id: number; name: string }[]> {
    const qs = new URLSearchParams()
    if (params.departmentId) qs.set('department_id', String(params.departmentId))
    if (params.stateBodyId) qs.set('state_body_id', String(params.stateBodyId))
    const query = qs.toString()
    const response = await this.authorizedFetch(`/api/v1/hierarchy/divisions${query ? `?${query}` : ''}`)
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return data.map((item: any) => ({
      id: Number(item.id),
      name: String(item.name || ''),
    }))
  }

  async getManagementVacations(): Promise<ManagementVacation[]> {
    return []
  }


  async createUser(payload: CreateUserPayload): Promise<AlemContact> {
    const response = await this.authorizedFetch('/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.message || errData.error || 'Failed to create user')
    }
    const data = await response.json()
    return {
      id: Number(data.id),
      keycloak_id: String(data.keycloak_id || ''),
      iin: data.iin || null,
      email: String(data.email || ''),
      username: String(data.username || ''),
      full_name: String(data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim()),
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      middle_name: null,
      position: data.position || data.position_name || null,
      avatar_url: normalizeBackendAssetUrl(data.avatar_url) || null,
      is_active: Boolean(data.is_active),
      role: String(data.role || 'user'),
      ministry_id: data.ministry_id ? Number(data.ministry_id) : null,
      state_body_id: data.state_body_id ? Number(data.state_body_id) : null,
      department_id: data.department_id ? Number(data.department_id) : null,
      division_id: data.division_id ? Number(data.division_id) : null,
      organization: data.organization_name || null,
      department_unit: data.department_name || null,
      job_uid: null,
      sub_uid: null,
      job_name: data.position_name || null,
      person_code: null,
      person_status: null,
      absence_status: null,
      card_type: null,
      bin: null,
      badge_code: null,
      last_order_number: null,
      last_order_date: null,
      last_begin_date: null,
      first_begin_date: null,
      doc_type: null,
      hr_profile_id: null,
      user_created_at: data.created_at || new Date().toISOString(),
      hr_updated_at: null,
    }
  }

  async getUserForEdit(id: number): Promise<AlemContact> {
    const response = await this.authorizedFetch(`/api/v1/users/${id}/details`)
    const data = (await response.json()) as CurrentProfileDto
    if (Number(data.id) !== id || typeof data.first_name !== 'string' || typeof data.last_name !== 'string' || typeof data.email !== 'string') {
      throw new Error('Не удалось получить полный профиль сотрудника. Сохранение заблокировано.')
    }
    return HttpProfileRepository.mapHrListRow({ user: data })
  }

  async updateUser(id: number, payload: UpdateUserPayload): Promise<AlemContact> {
    const response = await this.authorizedFetch(`/api/v1/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.message || errData.error || 'Failed to update user')
    }
    const data = await response.json()
    return {
      id: Number(data.id),
      keycloak_id: String(data.keycloak_id || ''),
      iin: data.iin || null,
      email: String(data.email || ''),
      username: String(data.username || ''),
      full_name: String(data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim()),
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      middle_name: null,
      position: data.position || data.position_name || null,
      avatar_url: normalizeBackendAssetUrl(data.avatar_url) || null,
      is_active: Boolean(data.is_active),
      role: String(data.role || 'user'),
      ministry_id: data.ministry_id ? Number(data.ministry_id) : null,
      state_body_id: data.state_body_id ? Number(data.state_body_id) : null,
      department_id: data.department_id ? Number(data.department_id) : null,
      division_id: data.division_id ? Number(data.division_id) : null,
      organization: data.organization_name || null,
      department_unit: data.department_name || null,
      job_uid: null,
      sub_uid: null,
      job_name: data.position_name || null,
      person_code: null,
      person_status: null,
      absence_status: null,
      card_type: null,
      bin: null,
      badge_code: null,
      last_order_number: null,
      last_order_date: null,
      last_begin_date: null,
      first_begin_date: null,
      doc_type: null,
      hr_profile_id: null,
      user_created_at: data.created_at || new Date().toISOString(),
      hr_updated_at: null,
    }
  }

  async deleteUser(id: number): Promise<void> {
    const response = await this.authorizedFetch(`/api/v1/users/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.message || errData.error || 'Failed to delete user')
    }
  }

  async listMinistryAdmins(): Promise<MinistryAdminItem[]> {
    const response = await this.authorizedFetch('/api/v1/ministries/admins')
    if (!response.ok) {
      throw new Error('Failed to load ministry admins')
    }
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return data.map((item: any) => ({
      id: Number(item.id),
      name: String(item.name || ''),
      admin_id: item.admin_id ? Number(item.admin_id) : null,
      admin_name: item.admin_name ? String(item.admin_name) : undefined,
    }))
  }

  async assignMinistryAdmin(_ministryId: number, _userId: number): Promise<void> {}

  async revokeMinistryAdmin(_ministryId: number): Promise<void> {}

  private async authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return authorizedFetch(this.sessionStore, path, init)
  }

  private async uploadFile(file: File, type: 'image' | 'document' | 'file'): Promise<UploadedFileDto> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)

    const response = await this.authorizedFetch('/api/v1/files/upload', {
      method: 'POST',
      body: formData,
    })

    const data = (await response.json()) as UploadedFileDto
    return {
      ...data,
      url: normalizeBackendAssetUrl(data.url) ?? data.url,
    }
  }
}
