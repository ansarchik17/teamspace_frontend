import { GROWY_BASE_URL } from '../../shared/config/growy'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'

interface UserEnrollmentDto {
  id: number
  training_program: number
  training_program_name?: string
  training_program_category_name?: string
  training_program_description?: string
  cover_image_url?: string
  progress?: number
  status?: string
  status_display?: string
  due_date?: string | null
}

interface MyUnfinishedResponseDto {
  assigned_count: number
  in_progress_count: number
  assigned: UserEnrollmentDto[]
  in_progress: UserEnrollmentDto[]
}

export interface UnfinishedTrainingProgram {
  id: number
  trainingProgramId: number
  title: string
  category: string
  description: string
  coverImageUrl: string | null
  progress: number
  status: string
  statusLabel: string
  dueDate: string | null
}

export { GROWY_BASE_URL } from '../../shared/config/growy'

export const getGrowyCourseUrl = (enrollmentId: number): string =>
  `${GROWY_BASE_URL}/user/courses/${enrollmentId}`

const mapEnrollment = (dto: UserEnrollmentDto): UnfinishedTrainingProgram => ({
  id: dto.id,
  trainingProgramId: dto.training_program,
  title: dto.training_program_name?.trim() || 'Без названия',
  category: dto.training_program_category_name?.trim() || '',
  description: dto.training_program_description?.trim() || '',
  coverImageUrl: dto.cover_image_url?.trim() || null,
  progress: Math.min(100, Math.max(0, dto.progress ?? 0)),
  status: dto.status || '',
  statusLabel: dto.status_display?.trim() || '',
  dueDate: dto.due_date ?? null,
})

export class HttpGrowyRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async getMyUnfinishedPrograms(): Promise<UnfinishedTrainingProgram[]> {
    const token = this.sessionStore.getTokens()?.accessToken
    if (!token) {
      return []
    }

    const response = await authorizedFetch(this.sessionStore, '/api/v1/growy/api/training-programs/my-unfinished/', {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Growy API error: ${response.status}`)
    }

    const data = (await response.json()) as MyUnfinishedResponseDto
    const inProgress = (data.in_progress || []).map(mapEnrollment)
    const assigned = (data.assigned || []).map(mapEnrollment)

    return [...inProgress, ...assigned]
  }
}
