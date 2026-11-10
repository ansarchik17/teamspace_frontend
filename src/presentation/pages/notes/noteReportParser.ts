import { nt } from './notesText'
export type NoteLineChart = {
  kind: 'line'
  title: string
  data: { name: string; value: number }[]
}

export type NotePieChart = {
  kind: 'pie'
  title: string
  data: { name: string; value: number }[]
}

export type NoteBarChart = {
  kind: 'bar'
  title: string
  data: { name: string; value: number }[]
}

export type NoteDataTable = {
  kind: 'table'
  title: string
  columns: string[]
  rows: string[][]
}

export type NoteVisualization = NoteLineChart | NotePieChart | NoteBarChart | NoteDataTable

const MONTHS: { key: string; label: string }[] = [
  { key: 'январ', get label() { return nt('report.t01') } }, // i18n-ignore
  { key: 'феврал', get label() { return nt('report.t03') } }, // i18n-ignore
  { key: 'март', get label() { return nt('report.t05') } }, // i18n-ignore
  { key: 'апрел', get label() { return nt('report.t07') } }, // i18n-ignore
  { key: 'май', get label() { return nt('report.t09') } }, // i18n-ignore
  { key: 'мая', get label() { return nt('report.t09') } }, // i18n-ignore
  { key: 'июн', get label() { return nt('report.t12') } }, // i18n-ignore
  { key: 'июл', get label() { return nt('report.t14') } }, // i18n-ignore
  { key: 'август', get label() { return nt('report.t16') } }, // i18n-ignore
  { key: 'сентябр', get label() { return nt('report.t18') } }, // i18n-ignore
  { key: 'октябр', get label() { return nt('report.t20') } }, // i18n-ignore
  { key: 'ноябр', get label() { return nt('report.t22') } }, // i18n-ignore
  { key: 'декабр', get label() { return nt('report.t24') } }, // i18n-ignore
]

const parseIntNumber = (raw: string) => {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

const parseMoney = (raw: string) => parseIntNumber(raw.replace(/[$€₸]/g, ''))

const cleanSectionTitle = (title: string) =>
  title.replace(/\([^)]*\)/g, '').replace(/\*+/g, '').trim()

const splitSections = (text: string) => {
  const sections: { title: string; body: string }[] = []
  let current: { title: string; body: string } | null = null

  for (const line of text.split('\n')) {
    const match = line.match(/^#{1,3}\s+(.+)/)
    if (match) {
      if (current) sections.push(current)
      current = { title: match[1].trim(), body: '' }
      continue
    }
    if (current) current.body += `${line}\n`
  }
  if (current) sections.push(current)
  return sections
}

const detectKind = (title: string, body: string): NoteVisualization['kind'] | null => {
  const titleLower = title.toLowerCase()
  const t = `${title} ${body.slice(0, 180)}`.toLowerCase()
  if (/таблиц|kpi|финансов|техническ.*метрик/.test(t)) return 'table' // i18n-ignore
  if (/линейн|line chart|динамик|timeline|mau|аудитор/.test(t)) return 'line' // i18n-ignore
  if (/кругов|pie chart|дол[ия]|структур.*трафик/.test(t)) return 'pie' // i18n-ignore
  if (/столбч|bar chart|гистограм|регион|город|сделок/.test(t) && !/kpi|метрик|latency|uptime/.test(titleLower)) return 'bar' // i18n-ignore
  return null
}

const extractLineSeries = (body: string) => {
  const data: { name: string; value: number }[] = []
  const lower = body.toLowerCase()

  for (const month of MONTHS) {
    const idx = lower.indexOf(month.key)
    if (idx === -1) continue
    const slice = body.slice(idx, idx + 120)
    const numberMatch = slice.match(/(\d[\d\s]{0,10}\d|\d+)/)
    if (!numberMatch) continue
    const value = parseIntNumber(numberMatch[1])
    if (value <= 0) continue
    if (!data.some((item) => item.name === month.label)) {
      data.push({ name: month.label, value })
    }
  }

  return data
}

const extractPercentSeries = (body: string) => {
  const data: { name: string; value: number }[] = []
  const regex = /([A-Za-zА-Яа-яЁё()/.-]{2,40}?)\s*(?:—|-|:)?\s*(?:составил[аи]?|принос(?:ит|ят)|дал[аи]?|дают|составили)?\s*(\d+(?:[.,]\d+)?)\s*%/gi // i18n-ignore
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    let name = match[1]
      .replace(/^\*+\s*/, '')
      .replace(/\*+$/, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (/^(social|direct|seo|email|cpc)$/i.test(name)) name = name.toUpperCase() === 'SEO' ? 'SEO' : name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
    const value = parseIntNumber(match[2])
    if (!name || value <= 0 || value > 100) continue
    if (!data.some((item) => item.name === name)) data.push({ name, value })
  }
  return data
}

const extractBarSeries = (body: string) => {
  const data: { name: string; value: number }[] = []
  const regex =
    /(?:^|[.\n]\s*)([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)?|прочие\s+регионы)\s*(?:занимает[^.\n]{0,40}?|—|-|:)?\s*(\d[\d\s]{0,10}\d|\d+)/gi // i18n-ignore
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    const name = match[1].trim()
    const value = parseIntNumber(match[2])
    if (!name || value <= 0) continue
    if (/^(январ|феврал|март|апрел|май|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(name)) continue // i18n-ignore
    if (!data.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      data.push({ name, value })
    }
  }
  return data
}

const extractFinancialTable = (body: string): NoteDataTable | null => {
  const rows: string[][] = []
  const regex =
    /\*\s*\*\*([^:*]+):\*\*[^$]*?(\$[\d,]+)[^$]*?(?:расход[^$]*?)?(\$[\d,]+)[^$]*?(?:прибыл[^$]*?)?(\$[\d,]+)/gi // i18n-ignore
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    rows.push([
      match[1].trim(),
      match[2],
      match[3].replace(/,$/, ''),
      match[4],
    ])
  }
  if (rows.length === 0) return null
  return {
    kind: 'table',
    title: nt('report.t25'),
    columns: [nt('report.t26'), nt('report.t27'), nt('report.t28'), nt('report.t29')],
    rows,
  }
}

const extractKpiTable = (body: string): NoteDataTable | null => {
  const rows: string[][] = []
  const patterns = [
    /(?:средн(?:ее|яя)\s+)?(?:время\s+ответа[^.\n]{0,40}?|latency[^.\n]{0,20}?)\s*(\d+(?:[.,]\d+)?)\s*(мс|ms)/i, // i18n-ignore
    /(?:uptime|безотказной\s+работы)[^.\n]{0,40}?(\d+(?:[.,]\d+)?)\s*%/i, // i18n-ignore
    /(?:успешн(?:ых|ые)\s+транзакц|payment)[^.\n]{0,50}?(\d+(?:[.,]\d+)?)\s*%/i, // i18n-ignore
    /(?:критическ(?:их|ие)\s+инцидент|ошибок\s+5xx)[^.\n]{0,50}?(\d+)\s*(?:случа|раз)/i, // i18n-ignore
  ]
  const labels = ['Latency', 'Uptime', nt('report.t30'), nt('report.t31')]
  patterns.forEach((pattern, index) => {
    const match = body.match(pattern)
    if (!match) return
    rows.push([labels[index], `${match[1]}${match[2] ? ` ${match[2]}` : ''}`])
  })
  if (rows.length === 0) return null
  return {
    kind: 'table',
    title: nt('report.t32'),
    columns: [nt('report.t33'), nt('report.t34')],
    rows,
  }
}

export function parseReportVisualizations(text: string): NoteVisualization[] {
  const source = String(text || '').trim()
  if (!source) return []

  const sections = splitSections(source)
  const result: NoteVisualization[] = []

  for (const section of sections) {
    const title = cleanSectionTitle(section.title)
    const kind = detectKind(section.title, section.body)
    if (!kind) continue

    if (kind === 'line') {
      const data = extractLineSeries(section.body)
      if (data.length >= 2) result.push({ kind: 'line', title, data })
      continue
    }

    if (kind === 'pie') {
      const data = extractPercentSeries(section.body)
      if (data.length >= 2) result.push({ kind: 'pie', title, data })
      continue
    }

    if (kind === 'bar') {
      const data = extractBarSeries(section.body)
      if (data.length >= 2) result.push({ kind: 'bar', title, data })
      continue
    }

    if (kind === 'table') {
      const financial = extractFinancialTable(section.body)
      if (financial) {
        financial.title = title || financial.title
        result.push(financial)
      } else {
        const kpi = extractKpiTable(section.body)
        if (kpi) {
          kpi.title = title || kpi.title
          result.push(kpi)
        }
      }
      continue
    }
  }

  if (result.length > 0) return result

  const fallbackLine = extractLineSeries(source)
  if (fallbackLine.length >= 2) {
    result.push({ kind: 'line', title: nt('report.t35'), data: fallbackLine })
  }

  const fallbackPie = extractPercentSeries(source)
  if (fallbackPie.length >= 2) {
    result.push({ kind: 'pie', title: nt('report.t36'), data: fallbackPie })
  }

  const fallbackBar = extractBarSeries(source)
  if (fallbackBar.length >= 2) {
    result.push({ kind: 'bar', title: nt('report.t37'), data: fallbackBar })
  }

  const fallbackFinancial = extractFinancialTable(source)
  if (fallbackFinancial) result.push(fallbackFinancial)

  const fallbackKpi = extractKpiTable(source)
  if (fallbackKpi) result.push(fallbackKpi)

  return result
}

export function formatMoneyCell(value: string) {
  const amount = parseMoney(value)
  if (!amount) return value
  return `$${amount.toLocaleString('en-US')}`
}
