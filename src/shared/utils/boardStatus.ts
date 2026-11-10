// The Kanban API still returns these legacy Russian statuses in task details.
export function normalizeBoardStatus(value?: string): string {
  const normalized = (value ?? '').trim().toUpperCase().replace(/[_-]+/g, ' ')
  if (['TODO', 'TO DO', 'К ВЫПОЛНЕНИЮ'].includes(normalized)) return 'TODO' // i18n-ignore
  if (['IN PROGRESS', 'В РАБОТЕ'].includes(normalized)) return 'IN_PROGRESS' // i18n-ignore
  if (['TEST', 'REVIEW', 'НА ПРОВЕРКЕ', 'В ПРОЦЕССЕ ПРОВЕРКИ', 'ПРОВЕРКА'].includes(normalized)) return 'TEST' // i18n-ignore
  if (['DONE', 'COMPLETED', 'ГОТОВО', 'ЗАВЕРШЕНО', 'ЗАВЕРШЕН'].includes(normalized)) return 'DONE' // i18n-ignore
  return normalized.replace(/ /g, '_')
}
