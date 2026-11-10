import { useEffect, useRef } from 'react'
import { Bold, Italic, Underline, Strikethrough, Heading2, Quote } from 'lucide-react'
import type { PublicationContentBlock, PublicationContentDoc } from '../../../infrastructure/repositories/HttpPublicationRepository'

interface PublicationRichTextEditorProps {
  initialDoc?: PublicationContentDoc
  initialText?: string
  onChange: (doc: PublicationContentDoc) => void
}

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const marksForTag = (tag: string): string[] => {
  if (tag === 'B' || tag === 'STRONG') return ['bold']
  if (tag === 'I' || tag === 'EM') return ['italic']
  if (tag === 'U') return ['underline']
  if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') return ['strike']
  if (tag === 'CODE') return ['code']
  if (tag === 'MARK') return ['highlight']
  return []
}

const safeLink = (value: string): string | null => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

const runsHtml = (value: unknown): string => {
  if (!Array.isArray(value)) return ''
  return value.map((run: any) => {
    let html = escapeHtml(String(run?.text || '')).replaceAll('\n', '<br>')
    for (const mark of Array.isArray(run?.marks) ? run.marks : []) {
      if (mark === 'bold') html = `<strong>${html}</strong>`
      else if (mark === 'italic') html = `<em>${html}</em>`
      else if (mark === 'underline') html = `<u>${html}</u>`
      else if (mark === 'strike') html = `<s>${html}</s>`
      else if (mark === 'code') html = `<code>${html}</code>`
      else if (mark === 'highlight') html = `<mark>${html}</mark>`
      else if (typeof mark === 'string' && mark.startsWith('link:')) {
        const href = safeLink(mark.slice(5))
        if (href) html = `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${html}</a>`
      }
    }
    return html
  }).join('')
}

const docToHtml = (doc?: PublicationContentDoc, initialText = ''): string => {
  const blocks = Array.isArray(doc?.blocks) ? doc.blocks : []
  if (blocks.length) {
    return blocks.map((block) => {
      const content = runsHtml(block.runs)
      if (block.type === 'heading') {
        const level = Math.min(6, Math.max(1, Number(block.level) || 2))
        return `<h${level}>${content}</h${level}>`
      }
      if (block.type === 'quote') return `<blockquote>${content}</blockquote>`
      if (block.type === 'paragraph') return `<p>${content || '<br>'}</p>`
      return ''
    }).filter(Boolean).join('')
  }
  return initialText.split('\n').map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`).join('') || '<p><br></p>'
}

const collectRuns = (node: Node, marks: string[] = []): Array<{ text: string; marks?: string[] }> => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || ''
    return text ? [{ text, ...(marks.length ? { marks } : {}) }] : []
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const element = node as HTMLElement
  if (element.tagName === 'BR') return [{ text: '\n', ...(marks.length ? { marks } : {}) }]
  let nextMarks = [...marks, ...marksForTag(element.tagName)]
  if (element.tagName === 'A') {
    const href = safeLink(element.getAttribute('href') || '')
    if (href) nextMarks.push(`link:${href}`)
  }
  if (element.tagName === 'SPAN') {
    const color = element.style.color
    if (/^#[\da-f]{6}$/i.test(color)) nextMarks.push(`color:${color.toUpperCase()}`)
  }
  return Array.from(element.childNodes).flatMap((child) => collectRuns(child, nextMarks))
}

const parseEditor = (element: HTMLElement): PublicationContentDoc => {
  const blocks: PublicationContentBlock[] = []
  Array.from(element.childNodes).forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) return
    const htmlElement = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : null
    const tag = htmlElement?.tagName || 'P'
    let type = 'paragraph'
    let level: number | undefined
    if (/^H[1-6]$/.test(tag)) {
      type = 'heading'
      level = Number(tag.slice(1))
    } else if (tag === 'BLOCKQUOTE') {
      type = 'quote'
    }
    const runs = collectRuns(node)
    blocks.push({
      id: `text-${index}-${globalThis.crypto?.randomUUID?.() || Date.now()}`,
      type,
      ...(level ? { level } : {}),
      runs,
    })
  })
  if (!blocks.length) blocks.push({ id: `text-${Date.now()}`, type: 'paragraph', runs: [] })
  return { type: 'doc', version: 1, blocks }
}

export default function PublicationRichTextEditor({ initialDoc, initialText = '', onChange }: PublicationRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = docToHtml(initialDoc, initialText)
  }, [initialDoc, initialText])

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    if (editorRef.current) onChange(parseEditor(editorRef.current))
  }

  const handleInput = () => {
    if (editorRef.current) onChange(parseEditor(editorRef.current))
  }

  const toolbarButton = (label: string, icon: typeof Bold, command: string, value?: string) => {
    const Icon = icon
    return (
      <button
        key={label}
        type="button"
        title={label}
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runCommand(command, value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      >
        <Icon size={16} />
      </button>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: TBorder }}>
      <div className="flex items-center gap-1 border-b px-2 py-1" style={{ borderColor: TBorder, background: '#F9FBFE' }}>
        {toolbarButton('Жирный', Bold, 'bold')}
        {toolbarButton('Курсив', Italic, 'italic')}
        {toolbarButton('Подчёркнутый', Underline, 'underline')}
        {toolbarButton('Зачёркнутый', Strikethrough, 'strikeThrough')}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {toolbarButton('Заголовок 2', Heading2, 'formatBlock', 'h2')}
        {toolbarButton('Цитата', Quote, 'formatBlock', 'blockquote')}
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder="Опишите публикацию подробно..."
        className="min-h-36 max-h-72 overflow-y-auto px-3 py-2 text-sm leading-6 outline-none [&_blockquote]:border-l-2 [&_blockquote]:border-indigo-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:text-lg [&_h2]:font-bold [&_strong]:font-bold"
        style={{ color: '#0A1628', background: '#F9FBFE' }}
      />
    </div>
  )
}

const TBorder = '#DDE3EE'
