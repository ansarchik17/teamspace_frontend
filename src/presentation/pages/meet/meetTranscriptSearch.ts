/** Literal, case-insensitive matches. Offsets always refer to the original text. */
export function transcriptMatches(text: string, query: string) {
  const needle = query.trim()
  if (!needle) return []
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
}
