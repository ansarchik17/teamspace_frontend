export type WorkTab = 'boards' | 'assignments' | 'ai' | 'stats'

export const WORK_TABS: readonly WorkTab[] = ['boards', 'assignments', 'ai', 'stats']

export const workTabFromSearch = (search: string): WorkTab => {
  const value = new URLSearchParams(search).get('tab')
  return WORK_TABS.find((tab) => tab === value) ?? 'boards'
}

export const workTabPath = (tab: WorkTab) => (tab === 'boards' ? '/board' : `/board?tab=${tab}`)

export type PinnedBoard = { id: string; name: string }

export const PINNED_BOARDS_KEY = 'superapp.pinned_board_names'
export const PINNED_BOARDS_CHANGED = 'superapp:pinned-boards'

export const readPinnedBoards = (): PinnedBoard[] => {
  try {
    const value = JSON.parse(window.localStorage.getItem(PINNED_BOARDS_KEY) || '[]') as unknown
    return Array.isArray(value)
      ? value.filter((item): item is PinnedBoard => Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string')
      : []
  } catch {
    return []
  }
}
