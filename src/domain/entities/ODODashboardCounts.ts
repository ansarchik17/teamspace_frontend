export type ODOMetric = 'approvals' | 'signing'
export type ODOCount = { value: number | null; state: 'loading' | 'ready' | 'denied' | 'unavailable' }
export type ODODashboardCounts = Record<ODOMetric, ODOCount>

export const emptyODOCounts = (state: ODOCount['state']): ODODashboardCounts => ({
  approvals: { value: null, state },
  signing: { value: null, state },
})
