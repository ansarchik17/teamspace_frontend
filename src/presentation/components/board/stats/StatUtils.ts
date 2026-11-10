import { bt } from '../boardText'
export const getScoreColor = (score: number): string => {
  if (score >= 85) return '#10B981'
  if (score >= 65) return '#2458D3'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
}

export const formatHours = (seconds: number): string => {
  if (!seconds || seconds <= 0) return bt('time.zero')
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return minutes ? bt('time.hoursMinutes', { hours, minutes }) : bt('time.hours', { hours })
}
