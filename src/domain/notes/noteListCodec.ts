import type { NoteContentDoc, NoteContentRun } from '../entities/Note'

const isListMark = (mark: string) => mark === 'list:bullet' || mark === 'list:ordered'

// The API accepts paragraphs, but not the editor's list marks. Persist visible
// prefixes in ordinary text runs and restore editable lists at the boundary.
export function encodeNoteLists(doc: NoteContentDoc): NoteContentDoc {
  let number = 0
  return { ...doc, blocks: doc.blocks.map((block) => {
    const marks = block.type === 'paragraph' ? (block.runs ?? []).flatMap(run => run.marks ?? []) : []
    const ordered = marks.includes('list:ordered')
    number = ordered ? number + 1 : 0
    if (!ordered && !marks.includes('list:bullet')) return block
    const runs = (block.runs ?? []).map(run => ({ ...run, marks: (run.marks ?? []).filter(mark => !isListMark(mark)) }))
    return { ...block, runs: [{ text: ordered ? `${number}. ` : '• ' }, ...runs] }
  }) }
}

export function decodeNoteLists(doc: NoteContentDoc): NoteContentDoc {
  return { ...doc, blocks: doc.blocks.map((block) => {
    if (block.type !== 'paragraph') return block
    const runs = block.runs ?? []
    if (runs.some(run => run.marks?.some(isListMark))) return block
    const prefix = runs.map(run => run.text).join('').match(/^(• |\d+\. )/)
    if (!prefix) return block
    const mark = prefix[0].startsWith('•') ? 'list:bullet' : 'list:ordered'
    let remaining = prefix[0].length
    const decoded: NoteContentRun[] = []
    for (const run of runs) {
      const skip = Math.min(remaining, run.text.length)
      remaining -= skip
      const text = run.text.slice(skip)
      if (text) decoded.push({ ...run, text, marks: [...(run.marks ?? []), mark] })
    }
    return { ...block, runs: decoded.length ? decoded : [{ text: '', marks: [mark] }] }
  }) }
}
