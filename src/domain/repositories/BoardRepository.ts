import type {
  Board,
  BoardBackground,
  BoardComment,
  BoardChecklistItem,
  BoardDetails,
  BoardHistory,
  BoardLabel,
  BoardSprint,
  BoardTask,
  BoardUser,
  BoardWorklog,
  CreateBoardTaskPayload,
  KanbanFilteredBoardParams,
  KanbanTaskSearchParams,
  OrgAccessCheck,
  OrgAccessUser,
  OrgKanbanStats,
  UpdateBoardTaskPayload,
  BoardStats,
  BoardGoal,
  BoardProject,
} from '../entities/board/BoardModels'
import type { AssignmentCommand, AssignmentCompletion } from '../entities/AssignmentCompletion'

export interface BoardRepository {
  listBoards(): Promise<Board[]>
  getBoard(boardId: string): Promise<BoardDetails>
  getFilteredBoard(params: KanbanFilteredBoardParams): Promise<BoardDetails>
  createBoard(name: string): Promise<Board>
  updateBoard(boardId: string, name: string): Promise<Board>
  deleteBoard(boardId: string): Promise<void>

  uploadBoardBackgroundImage(boardId: string, file: File): Promise<BoardBackground>
  deleteBoardBackgroundImage(boardId: string): Promise<BoardBackground>
  setBoardBackgroundPreset(boardId: string, presetId: string): Promise<BoardBackground>
  getBoardBackgroundImageDownloadUrl(boardId: string): string
  downloadBoardBackgroundImage(boardId: string): Promise<Blob>

  listBoardLabels(boardId: string): Promise<BoardLabel[]>
  createBoardLabel(boardId: string, payload: { name: string; color: string }): Promise<BoardLabel>
  deleteBoardLabel(labelId: string): Promise<void>

  createColumn(boardId: string, name: string, key?: string): Promise<void>
  updateColumn(columnId: string, name: string, key?: string): Promise<void>
  deleteColumn(columnId: string): Promise<void>
  moveColumn(columnId: string, newPosition: number): Promise<void>

  createTask(payload: CreateBoardTaskPayload): Promise<BoardTask>
  listMyTodoTasks(): Promise<BoardTask[]>
  listMyDocumentologAssignments(signal?: AbortSignal): Promise<BoardTask[]>
  completeDocumentologAssignment(taskId: string, command: AssignmentCommand, signal?: AbortSignal): Promise<AssignmentCompletion>
  searchTasks(params: KanbanTaskSearchParams): Promise<BoardTask[]>
  getTask(taskId: string): Promise<BoardTask>
  updateTask(taskId: string, payload: UpdateBoardTaskPayload): Promise<void>
  deleteTask(taskId: string): Promise<void>
  moveTask(taskId: string, toColumnId: string): Promise<void>
  updateTaskStatus(taskId: string, status: string): Promise<BoardTask>

  uploadKanbanFile(file: File): Promise<{ fileId: string; downloadUrl: string; fileName: string }>
  attachExistingFile(taskId: string, fileId: string): Promise<void>

  createSprint(boardId: string, payload: { name: string; goalId?: string; projectId?: string; status?: string; startDate?: string; endDate?: string }): Promise<BoardSprint>
  updateSprint(boardId: string, sprintId: string, payload: { name: string; goalId?: string; projectId?: string; status?: string; startDate?: string; endDate?: string }): Promise<BoardSprint>
  deleteSprint(boardId: string, sprintId: string): Promise<void>
  listSprints(): Promise<BoardSprint[]>

  createGoal(boardId: string, payload: { name: string; description?: string }): Promise<BoardGoal>
  updateGoal(boardId: string, goalId: string, payload: { name: string; description?: string }): Promise<BoardGoal>
  deleteGoal(boardId: string, goalId: string): Promise<void>
  listMyGoals(): Promise<BoardGoal[]>
  createProject(boardId: string, payload: { name: string; description?: string; goalId?: string; status?: string }): Promise<BoardProject>
  updateProject(boardId: string, projectId: string, payload: { name: string; description?: string; goalId?: string; status?: string }): Promise<BoardProject>
  deleteProject(boardId: string, projectId: string): Promise<void>

  listUsers(): Promise<BoardUser[]>
  listUsersPage(params?: { limit?: number; offset?: number; search?: string }): Promise<{ items: BoardUser[]; total: number }>
  getUserDetails(userId: number): Promise<BoardUser>

  addMembers(boardId: string, members: Array<{ userId: number; role?: string; teamRole?: string }>): Promise<void>
  removeMember(boardId: string, userId: number): Promise<void>
  updateMemberRole(boardId: string, userId: number, role: string): Promise<void>
  updateMemberTeamRole(boardId: string, userId: number, teamRole: string): Promise<void>

  uploadTaskFile(taskId: string, file: File): Promise<void>
  deleteTaskFile(taskId: string, fileId: string): Promise<void>
  getTaskFileDownloadUrl(taskId: string, fileId: string): string

  listTaskComments(taskId: string): Promise<BoardComment[]>
  createTaskComment(taskId: string, payload: { content: string; attachmentUrl?: string }): Promise<BoardComment>
  createTaskCommentPhoto(taskId: string, payload: { file: File; content?: string }): Promise<BoardComment>
  downloadAttachmentByUrl(url: string): Promise<Blob>
  updateComment(commentId: string, content: string): Promise<void>
  deleteComment(commentId: string): Promise<void>

  listTaskChecklistItems(taskId: string): Promise<BoardChecklistItem[]>
  createTaskChecklistItem(taskId: string, payload: { text: string; completed?: boolean; position?: number }): Promise<BoardChecklistItem>
  updateTaskChecklistItem(taskId: string, itemId: string, payload: { text?: string; completed?: boolean }): Promise<BoardChecklistItem>
  deleteTaskChecklistItem(taskId: string, itemId: string): Promise<void>

  addTaskLabel(taskId: string, labelId: string): Promise<void>
  removeTaskLabel(taskId: string, labelId: string): Promise<void>

  addWorklog(taskId: string, payload: { timeSpentSec: number; comment?: string; startedAt?: string }): Promise<void>
  listWorklogs(taskId: string): Promise<BoardWorklog[]>
  getTaskHistory(taskId: string): Promise<BoardHistory[]>

  getOrgStats(stateBodyId: number): Promise<OrgKanbanStats>
  getOrgStatsAccessCheck(stateBodyId: number): Promise<OrgAccessCheck>
  listOrgStatsAccessUsers(stateBodyId: number): Promise<OrgAccessUser[]>
  grantOrgStatsAccess(stateBodyId: number, userId: number): Promise<void>
  revokeOrgStatsAccess(stateBodyId: number, userId: number): Promise<void>

  listOrgKanbanAccessUsers(stateBodyId: number): Promise<OrgAccessUser[]>
  grantOrgKanbanAccess(stateBodyId: number, userId: number): Promise<void>
  revokeOrgKanbanAccess(stateBodyId: number, userId: number): Promise<void>

  getBoardStats(boardId: string, params?: { dateFrom?: string; dateTo?: string }): Promise<BoardStats>
  getMultiBoardStats(boardIds?: string[], params?: { dateFrom?: string; dateTo?: string }): Promise<BoardStats>
}
