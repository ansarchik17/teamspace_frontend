import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardTask } from '../../../domain/entities/board/BoardModels'
import type { PendingAssignmentCommand } from '../../../domain/entities/AssignmentCompletion'
import { canCompleteWithAccess, canStartNewAssignmentCommand, createAssignmentCommand, projectionCaughtUp, validCompletionReceipt } from '../../../application/use-cases/assignments/assignmentPolicy'
import { HttpBoardRepository } from '../../../infrastructure/repositories/HttpBoardRepository'
import { HttpAccessRepository, type CurrentApplicationAccess } from '../../../infrastructure/repositories/HttpAccessRepository'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { AssignmentCommandJournal } from '../../../infrastructure/storage/AssignmentCommandJournal'
import { AUTH_SESSION_CLEARED_EVENT } from '../../../shared/auth/authSessionEvents'
import { createAuthController } from '../../auth/createAuthController'

export type AssignmentErrorKey = 'errors.load' | 'errors.unknown' | 'errors.conflict' | 'errors.denied' | 'errors.reauth' | 'errors.invalid'
const errorKey = (error: unknown, loading = false): AssignmentErrorKey => {
  if (error instanceof HttpError) {
    if (error.status === 409) return 'errors.conflict'
    if (error.status === 403 || error.status === 404) return 'errors.denied'
    if (error.status === 401) return 'errors.reauth'
    if (error.status === 400 || error.status === 422) return 'errors.invalid'
  }
  return loading ? 'errors.load' : 'errors.unknown'
}

export function useAssignments() {
  const dependencies = useMemo(() => {
    const { authController, sessionStore } = createAuthController()
    return { authController, repository: new HttpBoardRepository(sessionStore), access: new HttpAccessRepository(sessionStore) }
  }, [])
  const [tasks, setTasks] = useState<BoardTask[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<AssignmentErrorKey | null>(null)
  const [commandError, setCommandError] = useState<AssignmentErrorKey | null>(null)
  const [access, setAccess] = useState<CurrentApplicationAccess | null>(null)
  const [scope, setScope] = useState('')
  const [commands, setCommands] = useState<Record<string, PendingAssignmentCommand>>({})
  const [sending, setSending] = useState<string | null>(null)
  const live = useRef(false)
  const userId = useRef<number | null>(null)
  const scopeRef = useRef('')
  const commandsRef = useRef<Record<string, PendingAssignmentCommand>>({})
  const journal = useRef<AssignmentCommandJournal | null>(null)
  const reads = useRef<AbortController | null>(null)
  const writes = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const busy = useRef(false)

  const publish = useCallback((next: Record<string, PendingAssignmentCommand>) => {
    commandsRef.current = next
    journal.current?.write(next)
    if (live.current) setCommands(next)
  }, [])

  const refresh = useCallback(async () => {
    reads.current?.abort()
    const controller = new AbortController()
    reads.current = controller
    const id = ++sequence.current
    setRefreshing(true)
    try {
      const employee = userId.current ?? (await dependencies.authController.refreshIfExpiringSoon()).userId
      if (!employee) throw new HttpError('User session required', 401)
      const policy = await dependencies.access.current('odo', controller.signal)
      if (!policy.active || !policy.organization_id) throw new HttpError('ODO access denied', 403)
      if (!live.current || controller.signal.aborted || id !== sequence.current) return
      userId.current = employee
      const owner = `${employee}:${policy.organization_id}`
      if (scopeRef.current !== owner) {
        writes.current?.abort()
        setTasks([])
        busy.current = false
        setSending(null)
        journal.current = new AssignmentCommandJournal(employee, policy.organization_id)
        scopeRef.current = owner
        setScope(owner)
        publish(journal.current.read())
        setCommandError(null)
      }
      if (!canCompleteWithAccess(policy)) {
        writes.current?.abort(); busy.current=false; setSending(null)
        publish(Object.fromEntries(Object.entries(commandsRef.current).map(([key, entry]) => [key, entry.phase==='pending' ? {...entry,phase:'uncertain' as const} : entry])))
      }
      setAccess(policy)
      const items = await dependencies.repository.listMyDocumentologAssignments(controller.signal)
      if (!live.current || controller.signal.aborted || id !== sequence.current) return
      const remaining = { ...commandsRef.current }
      for (const item of items) if (remaining[item.id] && projectionCaughtUp(item, remaining[item.id])) delete remaining[item.id]
      publish(remaining)
      setTasks(items)
      setAccess(policy)
      setLoadError(null)
    } catch (error) {
      if (!live.current || controller.signal.aborted || id !== sequence.current) return
      setLoadError(errorKey(error, true))
      if (error instanceof HttpError && [401, 403, 404].includes(error.status)) {
        writes.current?.abort(); busy.current=false; setSending(null)
        publish(Object.fromEntries(Object.entries(commandsRef.current).map(([key, entry]) => [key,entry.phase==='pending' ? {...entry,phase:'uncertain' as const}:entry])))
        setTasks([]); setAccess(null)
      }
    } finally {
      if (live.current && id === sequence.current) { setLoading(false); setRefreshing(false) }
    }
  }, [dependencies, publish])

  useEffect(() => {
    live.current = true
    void refresh()
    const clear = () => {
      sequence.current++
      reads.current?.abort(); writes.current?.abort()
      scopeRef.current = ''; journal.current = null; userId.current = null
      commandsRef.current = {}; busy.current = false
      setTasks([]); setCommands({}); setScope(''); setAccess(null); setSending(null); setLoadError('errors.reauth')
    }
    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, clear)
    return () => { live.current = false; reads.current?.abort(); writes.current?.abort(); window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, clear) }
  }, [refresh])

  const awaiting = Object.values(commands).some(entry => ['confirmed', 'uncertain', 'pending'].includes(entry.phase))
  useEffect(() => {
    const fastUntil = Date.now() + 60000
    let lastPoll = 0
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || (Date.now() > fastUntil && Date.now() - lastPoll < 30000)) return
      lastPoll = Date.now()
      void refresh()
    }, awaiting ? 3000 : 30000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    return () => { clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [awaiting, refresh])

  const allowed = !loadError && canCompleteWithAccess(access)
  const complete = useCallback(async (task: BoardTask, result: string) => {
    if (busy.current || !allowed || !scopeRef.current) return
    const latest = tasks.find(item => item.id===task.id && item.sourceAssignmentId===task.sourceAssignmentId && item.sourceDocumentId===task.sourceDocumentId && item.sourceOrganizationId===task.sourceOrganizationId)
    if (!latest) {setCommandError('errors.denied');void refresh();return}
    const previous = commandsRef.current[task.id]
    if (previous?.phase === 'confirmed' || previous?.phase === 'conflict') return
    let command
    try {command = previous?.phase !== 'invalid' && previous ? previous.command : createAssignmentCommand(task, result)}
    catch {setCommandError('errors.invalid');return}
    if (!previous && latest.sourceRevision!==task.sourceRevision) {
      publish({...commandsRef.current,[task.id]:{taskId:task.id,assignmentId:task.sourceAssignmentId || '',command,phase:'conflict'}})
      setCommandError('errors.conflict');void refresh();return
    }
    if (previous && previous.assignmentId !== task.sourceAssignmentId) return
    const controller = new AbortController()
    writes.current = controller
    const owner = scopeRef.current
    busy.current = true; setSending(task.id); setCommandError(null)
    const pending: PendingAssignmentCommand = { taskId: task.id, assignmentId: task.sourceAssignmentId || '', command, phase: 'pending' }
    publish({ ...commandsRef.current, [task.id]: pending })
    try {
      const policy=await dependencies.access.current('odo',controller.signal)
      if (!live.current || controller.signal.aborted || owner!==scopeRef.current) return
      if (!canCompleteWithAccess(policy) || policy.organization_id!==task.sourceOrganizationId) throw new HttpError('Assignment completion access denied',403)
      const confirmation = await dependencies.repository.completeDocumentologAssignment(task.id, command, controller.signal)
      if (!live.current || owner !== scopeRef.current || controller.signal.aborted) return
      if (!validCompletionReceipt(confirmation, task, command)) throw new HttpError('Invalid command acknowledgement', 502, 'ODO_INVALID_RECEIPT')
      publish({ ...commandsRef.current, [task.id]: { ...pending, phase: 'confirmed', confirmedRevision: confirmation.receipt.revision } })
      void refresh()
    } catch (error) {
      if (!live.current || owner !== scopeRef.current || controller.signal.aborted) return
      const key = errorKey(error)
      const phase = key === 'errors.conflict' ? 'conflict' : key === 'errors.denied' ? 'denied' : key === 'errors.invalid' ? 'invalid' : 'uncertain'
      publish({ ...commandsRef.current, [task.id]: { ...pending, phase } })
      setCommandError(key)
      if (phase === 'conflict' || phase === 'denied') void refresh()
    } finally {
      if (live.current && owner === scopeRef.current && !controller.signal.aborted) { busy.current = false; setSending(null) }
    }
  }, [allowed, dependencies, publish, refresh, tasks])

  const startNew = useCallback((task: BoardTask) => {
    const entry = commandsRef.current[task.id]
    if (!allowed || busy.current || !canStartNewAssignmentCommand(task,entry)) return
    const next = { ...commandsRef.current }; delete next[task.id]; publish(next); setCommandError(null)
  }, [allowed, publish])
  return { tasks, loading, refreshing, loadError, commandError, commands, sending, allowed, scope, refresh, complete, startNew, clearCommandError: () => setCommandError(null) }
}
