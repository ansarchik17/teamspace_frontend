import { bid, type NoteBlock } from './noteDocumentUtils'

export type ParsedMarkdownNote = {
  title?: string
  blocks: NoteBlock[]
}

const HEADING_MARKS = {
  1: 'heading1',
  2: 'heading2',
  3: 'heading3',
} as const

export function looksLikeMarkdown(text: string): boolean {
  const source = String(text || '').trim()
  if (!source) return false
  if (/^#{1,3}\s/m.test(source)) return true
  if (/^[-*+]\s+/m.test(source)) return true
  if (/^\d+\.\s+/m.test(source)) return true
  if (/\*\*[^*\n]+\*\*/.test(source)) return true
  if (/^---+\s*$/m.test(source)) return true
  return false
}

const mergeRuns = (runs: { text: string; marks?: string[] }[]) => {
  const next: { text: string; marks?: string[] }[] = []
  for (const run of runs) {
    if (!run.text) continue
    const prev = next[next.length - 1]
    if (prev && JSON.stringify(prev.marks ?? []) === JSON.stringify(run.marks ?? [])) {
      prev.text += run.text
    } else {
      next.push({ text: run.text, marks: run.marks ? [...run.marks] : undefined })
    }
  }
  return next.length ? next : [{ text: '' }]
}

const addMarkToRuns = (runs: { text: string; marks?: string[] }[], mark: string) =>
  runs.map((run) => ({
    ...run,
    marks: [...new Set([...(run.marks ?? []), mark])],
  }))

export function parseInlineMarkdown(text: string): { text: string; marks?: string[] }[] {
  const source = String(text || '')
  if (!source) return [{ text: '' }]

  const runs: { text: string; marks?: string[] }[] = []
  const regex = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: source.slice(lastIndex, match.index) })
    }
    const token = match[0]
    if (token.startsWith('**') || token.startsWith('__')) {
      runs.push({ text: token.slice(2, -2), marks: ['bold'] })
    } else if (token.startsWith('~~')) {
      runs.push({ text: token.slice(2, -2), marks: ['strike'] })
    } else {
      runs.push({ text: token.slice(1, -1), marks: ['italic'] })
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < source.length) {
    runs.push({ text: source.slice(lastIndex) })
  }

  return mergeRuns(runs)
}

const paragraphBlock = (
  runs: { text: string; marks?: string[] }[],
  headingLevel?: 1 | 2 | 3,
): NoteBlock => {
  const nextRuns = headingLevel
    ? addMarkToRuns(runs, HEADING_MARKS[headingLevel])
    : runs
  return {
    id: bid('p'),
    type: 'paragraph',
    runs: nextRuns.length ? nextRuns : [{ text: '' }],
  }
}

export function hasRawMarkdownSyntax(doc: { blocks?: Array<{ type: string; runs?: Array<{ text?: string; marks?: string[] }> }> } | null | undefined): boolean {
  const content = (doc?.blocks ?? [])
    .filter((block) => block.type === 'paragraph')
    .map((block) => (block.runs ?? []).map((run) => run.text ?? '').join(''))
    .join('\n')

  if (!content.trim() || !looksLikeMarkdown(content)) return false

  if (/(^|\n)\s*#{1,3}\s+\S/.test(content)) return true
  if (/(^|\n)\s*---+\s*($|\n)/.test(content)) return true

  const hasBoldMarkers = /\*\*[^*\n]+\*\*/.test(content)
  const hasBoldRuns = (doc?.blocks ?? []).some(
    (block) =>
      block.type === 'paragraph' &&
      (block.runs ?? []).some((run) => (run.marks ?? []).includes('bold')),
  )
  if (hasBoldMarkers && !hasBoldRuns) return true

  return false
}

export function normalizeMarkdownNote<TDoc extends { blocks: NoteBlock[] }>(
  doc: TDoc,
  currentTitle = '',
): { doc: TDoc; title: string; changed: boolean } {
  if (!hasRawMarkdownSyntax(doc)) {
    return { doc, title: currentTitle, changed: false }
  }

  const parsed = parseMarkdownToNote(
    doc.blocks
      .map((block) => {
        if (block.type === 'paragraph') return (block.runs ?? []).map((run) => run.text).join('')
        if (block.type === 'checklist') {
          return (block.items ?? []).map((item) => `- ${item.text}`).join('\n')
        }
        if (block.type === 'table') {
          return (block.rows ?? []).map((row) => row.map((cell) => cell.text).join(' | ')).join('\n')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n'),
  )

  const nextTitle = parsed.title || currentTitle
  return {
    doc: { ...doc, blocks: parsed.blocks },
    title: nextTitle,
    changed: true,
  }
}

export function parseMarkdownToNote(text: string): ParsedMarkdownNote {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const blocks: NoteBlock[] = []
  let title: string | undefined

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (!trimmed) continue
    if (/^---+$/.test(trimmed)) continue

    const h1 = trimmed.match(/^#\s+(.+)$/)
    if (h1 && !trimmed.startsWith('##')) {
      title = parseInlineMarkdown(h1[1]).map((run) => run.text).join('').trim()
      continue
    }

    const h2 = trimmed.match(/^##\s+(.+)$/)
    if (h2 && !trimmed.startsWith('###')) {
      blocks.push(paragraphBlock(parseInlineMarkdown(h2[1]), 2))
      continue
    }

    const h3 = trimmed.match(/^###\s+(.+)$/)
    if (h3) {
      blocks.push(paragraphBlock(parseInlineMarkdown(h3[1]), 3))
      continue
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/)
    if (bullet) {
      blocks.push(
        paragraphBlock(addMarkToRuns(parseInlineMarkdown(bullet[1]), 'list:bullet')),
      )
      continue
    }

    const numbered = trimmed.match(/^\d+\.\s+(.+)$/)
    if (numbered) {
      blocks.push(paragraphBlock(addMarkToRuns(parseInlineMarkdown(numbered[1]), 'list:ordered')))
      continue
    }

    blocks.push(paragraphBlock(parseInlineMarkdown(trimmed)))
  }

  return {
    title,
    blocks: blocks.length ? blocks : [{ id: bid('p'), type: 'paragraph', runs: [{ text: '' }] }],
  }
}

export function getParagraphHeadingLevel(runs: { marks?: string[] }[] | undefined): 0 | 1 | 2 | 3 {
  const marks = runs?.flatMap((run) => run.marks ?? []) ?? []
  if (marks.includes('heading3')) return 3
  if (marks.includes('heading2')) return 2
  if (marks.includes('heading1')) return 1
  return 0
}

export const headingStyles: Record<1 | 2 | 3, {
  fontSize: number
  fontWeight: number
  lineHeight: number
  marginTop: number
  color: string
}> = {
  1: { fontSize: 32, fontWeight: 800, lineHeight: 1.2, marginTop: 4, color: '#0A1628' },
  2: { fontSize: 24, fontWeight: 700, lineHeight: 1.25, marginTop: 18, color: '#0A1628' },
  3: { fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginTop: 14, color: '#1E293B' },
}
