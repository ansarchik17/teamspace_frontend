import type { AskDataCard, AskDataSource } from './api/types'

export const safeDataCardHref = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.startsWith('/web/') || /[\\\r\n]/.test(value)) return undefined
  const base = 'https://workspace.invalid'
  try {
    const parsed = new URL(value, base)
    return parsed.origin === base && parsed.pathname.startsWith('/web/') ? value : undefined
  } catch { return undefined }
}

export const safeExternalSourceHref = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || /[\\\r\n]/.test(value)) return undefined
  try {
    const parsed = new URL(value)
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined
  } catch { return undefined }
}

export const normalizeDataCards = (value: unknown): AskDataCard[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is AskDataCard =>
    item && typeof item.id === 'string' && typeof item.source_id === 'string' &&
    typeof item.title === 'string' && typeof item.service === 'string',
  ).slice(0, 12).map((item) => ({
    id: item.id, source_id: item.source_id, title: item.title, service: item.service,
    status: typeof item.status === 'string' ? item.status : undefined,
    due_at: typeof item.due_at === 'string' ? item.due_at : undefined,
    href: safeDataCardHref(item.href), empty: item.empty === true,
    external_url: safeExternalSourceHref(item.external_url),
    confirmation: item.confirmation && typeof item.confirmation.token === 'string' &&
      /^[0-9a-f-]{36}$/i.test(item.confirmation.token) && typeof item.confirmation.expires_at === 'string' &&
      Number.isFinite(Date.parse(item.confirmation.expires_at))
      ? { token: item.confirmation.token, expires_at: item.confirmation.expires_at } : undefined,
    fields: Array.isArray(item.fields) ? item.fields.filter((field) =>
      field && typeof field.label === 'string' && typeof field.value === 'string',
    ).slice(0, 20) : [],
  }))
}

export const normalizeDataSources = (value: unknown): AskDataSource[] =>
  Array.isArray(value) ? value.filter((source): source is AskDataSource =>
    source && typeof source.id === 'string' && typeof source.dataset === 'string' &&
    typeof source.title === 'string' && typeof source.status === 'string' && typeof source.retrieved_at === 'string',
  ) : []

const statusLabels: Record<string, string> = {
  pending: 'Ожидает действия', new: 'Новое', draft: 'Черновик', registered: 'Зарегистрирован',
  in_progress: 'В работе', overdue: 'Просрочено', completed: 'Завершено', done: 'Завершено',
  cancelled: 'Отменено', canceled: 'Отменено', closed: 'Закрыто', archived: 'В архиве',
  on_approval: 'На согласовании', approval: 'На согласовании', approved: 'Согласовано',
  on_signing: 'На подписи', signing: 'На подписи', signed: 'Подписано', rejected: 'Отклонено',
  waiting_for_signature: 'Ожидает подписи', sent_for_registration: 'Отправлен на регистрацию',
  in_execution: 'На исполнении', in_review: 'На рассмотрении', executed: 'Исполнено',
  revision: 'На доработке', on_execution: 'На исполнении', execution: 'На исполнении',
  open: 'Открыто', active: 'Активно', waiting: 'Ожидает ответа', resolved: 'Решено',
  sent: 'Отправлено', received: 'Получено', not_started: 'Не начато', enrolled: 'Назначено',
}

export const dataCardStatus = (value?: string): string => {
  if (!value) return ''
  return statusLabels[value.toLowerCase()] || (/^[A-Za-z_\d-]+$/.test(value) ? 'Статус уточняется в сервисе' : value)
}

export const dataSourceStatus = (source: AskDataSource): string => {
  if (source.status === 'ok') return source.truncated ? 'Проверена часть данных' : 'Проверено'
  if (source.status === 'forbidden') return 'Нет доступа'
  if (source.status === 'not_found') return 'Не найдено'
  if (source.status === 'not_ready') return 'Обработка ещё идёт'
  if (source.status === 'too_large') return 'Нужно уточнить запрос'
  return 'Не удалось проверить'
}

const sourceMarkers = /\s*(?:\[\s*S\d+(?:\s*[,;]\s*S\d+)*\s*\]|【\s*S\d+(?:\s*[,;]\s*S\d+)*\s*】)/g
const internalAnswerText = /personal_context|read_user_data|presentation_cards|card_ids|source_id|invalid_request|available_actions|executor_id|current_user_id|\bHTTP\s*[1-5]\d{2}\b|\/api\/v\d+\/|["`«](?:assignments|documents|items|results|params|dataset|todo|pending)["`»]|\b(?:status|mine|page|limit|offset)\s*=/i

// Old replies also pass through the public presentation boundary. Their
// technical narrative cannot be repaired from source metadata alone.
export const presentAssistantText = (text: string, sources: AskDataSource[], cards: AskDataCard[]) => {
  const footerAt = text.search(/\n\nИсточники проверки:\s*\n/i)
  const body = footerAt >= 0 ? text.slice(0, footerAt) : text
  const legacyFooter = footerAt >= 0 ? text.slice(footerAt).replace(sourceMarkers, '').trim() : ''
  const normalized = body.replace(/\\_/g, '_')
  let jsonEnvelope = false
  if (normalized.trimStart().startsWith('{') || normalized.trimStart().startsWith('[')) {
    try { jsonEnvelope = typeof JSON.parse(normalized) === 'object' } catch { /* Ordinary Markdown stays unchanged. */ }
  }
  const internal = jsonEnvelope || /^\s*```json/i.test(normalized) || internalAnswerText.test(normalized) || sources.some((source) =>
    source.dataset.includes('_') && normalized.toLowerCase().includes(source.dataset.toLowerCase()),
  )
  if (internal) return {
    text: cards.length ? 'Результаты проверки показаны в карточках ниже.' : 'Этот ответ нужно проверить заново. Повторите вопрос, чтобы получить актуальные данные.',
    legacyFooter: '', needsRetry: !cards.length,
  }
  const clean = (sources.length || legacyFooter ? body.replace(sourceMarkers, '') : body).trim()
  return { text: clean || (cards.length ? 'Результаты проверки показаны в карточках ниже.' : 'Повторите вопрос, чтобы получить актуальные данные.'), legacyFooter, needsRetry: !clean && !cards.length }
}

export const userFacingChatError = (error: unknown): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('нет доступа к этому чату')) return 'У вас нет доступа к этому чату.'
  if (message.includes('сессия') || message.includes('войдите')) return 'Войдите в Workspace, чтобы продолжить.'
  if (message.includes('много запросов')) return 'Сейчас поступает много запросов. Попробуйте ещё раз через минуту.'
  if (message.includes('проверка занимает') || message.includes('timeout')) return 'Проверка занимает больше времени, чем обычно. Попробуйте ещё раз.'
  if (message.includes('файл слишком большой')) return 'Файл слишком большой. Выберите файл размером до 50 МБ.'
  return 'Не получилось получить ответ. Попробуйте ещё раз.'
}
