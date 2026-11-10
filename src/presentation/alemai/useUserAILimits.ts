import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UserAILimits } from '../../domain/entities/UserAILimits'
import {
  UserAILimitsSyncCoordinator,
  type LimitsSyncState,
} from '../../infrastructure/services/UserAILimitsSyncCoordinator'

export interface UseUserAILimitsResult {
  limits: UserAILimits | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

/**
 * React-хук для получения и синхронизации персональных ИИ-лимитов текущего пользователя.
 * - Подключается к общему UserAILimitsSyncCoordinator;
 * - Дедуплицирует запросы между всеми компонентами на странице;
 * - Автоматически обновляет лимиты около серверных границ периодов (через сетевое чтение);
 * - Обновляет данные при возвращении во вкладку (с кулдауном против шторма запросов);
 * - Синхронизирует состояние между открытыми вкладками;
 * - Изолирует сессии: при смене пользователя очищает данные и отменяет запросы прежней сессии.
 */
export function useUserAILimits(): UseUserAILimitsResult {
  const coordinator = useMemo(() => UserAILimitsSyncCoordinator.getInstance(), [])
  const [state, setState] = useState<LimitsSyncState>(() => coordinator.getState())

  useEffect(() => {
    return coordinator.subscribe((nextState) => {
      setState(nextState)
    })
  }, [coordinator])

  const refetch = useCallback(async () => {
    await coordinator.refresh({ force: true, reason: 'manual_refetch' })
  }, [coordinator])

  return {
    limits: state.limits,
    loading: state.loading,
    error: state.error,
    refetch,
  }
}
