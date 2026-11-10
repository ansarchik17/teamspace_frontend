import type { ProfileStats } from '../entities/ProfileStats'
import type { ProfileHr } from '../entities/ProfileHr'
import type { ProfileUser } from '../entities/ProfileUser'
import type {
  ChangePasswordRequest,
  ChangePasswordResponse,
  CurrentProfile,
  UpdateAvatarRequest,
  UpdateStatusRequest,
  UpdateStatusResponse,
} from '../entities/profile-settings/ProfileSettingsModels'
import type {
  CreateEducationInput,
  CreateLicenseCertificationInput,
  EducationListResponse,
  LicenseCertificationListResponse,
  UpdateEducationInput,
  UpdateLicenseCertificationInput,
  UserEducationItem,
  UserLicenseCertificationItem,
} from '../entities/profile-settings/ProfileSectionsModels'
import type { AlemContact, AlemContactDirectory, ContactAnalyticsQuery, ContactAnalyticsResponse, HrFilterField, HrUsersListParams, CreateUserPayload, UpdateUserPayload, MinistryAdminItem } from '../entities/AlemContact'

export interface ProfileRepository {
  getMe(): Promise<CurrentProfile>
  getMyProfile(): Promise<ProfileUser>
  getHrProfileByIin(iin: string): Promise<ProfileHr | null>
  getMyStats(): Promise<ProfileStats>
  getMyEducations(): Promise<EducationListResponse>
  getMyLicenseCertifications(): Promise<LicenseCertificationListResponse>
  createEducation(payload: CreateEducationInput): Promise<UserEducationItem>
  createLicenseCertification(payload: CreateLicenseCertificationInput): Promise<UserLicenseCertificationItem>
  updateEducation(id: number, payload: UpdateEducationInput): Promise<UserEducationItem>
  updateLicenseCertification(
    id: number,
    payload: UpdateLicenseCertificationInput,
  ): Promise<UserLicenseCertificationItem>
  deleteEducation(id: number): Promise<void>
  deleteLicenseCertification(id: number): Promise<void>
  updateStatus(payload: UpdateStatusRequest): Promise<UpdateStatusResponse>
  updateAvatar(payload: UpdateAvatarRequest): Promise<CurrentProfile>
  updateEmail(email: string): Promise<CurrentProfile>
  changePassword(payload: ChangePasswordRequest): Promise<ChangePasswordResponse>
  /** Справочник сотрудников HR: `GET /api/v1/users/hr` */
  listHrUsers(params?: HrUsersListParams): Promise<AlemContactDirectory>
  /** Варианты для фильтров: `GET /api/v1/users/hr/filters/{field}` */
  listHrFilterValues(field: HrFilterField): Promise<string[]>
  getContactAnalytics(params?: ContactAnalyticsQuery): Promise<ContactAnalyticsResponse>
  checkMinistryAnalyticsAccess(ministryId: number): Promise<boolean>
  trackSectionVisit(section: string, path?: string): Promise<void>
  getStateBodies(ministryId: number): Promise<{ id: number; name: string }[]>
  getDepartments(stateBodyId: number): Promise<{ id: number; name: string }[]>
  getDivisions(params: { departmentId?: number; stateBodyId?: number }): Promise<{ id: number; name: string }[]>
  getManagementVacations(): Promise<ManagementVacation[]>
  createUser(payload: CreateUserPayload): Promise<AlemContact>
  getUserForEdit(id: number): Promise<AlemContact>
  updateUser(id: number, payload: UpdateUserPayload): Promise<AlemContact>
  deleteUser(id: number): Promise<void>
  listMinistryAdmins(): Promise<MinistryAdminItem[]>
  assignMinistryAdmin(ministryId: number, userId: number): Promise<void>
  revokeMinistryAdmin(ministryId: number): Promise<void>
}

export interface ManagementVacation {
  user_id: number
  first_name: string
  last_name: string
  avatar_url?: string
  position: string
  begin_date?: string
  end_date?: string
}
