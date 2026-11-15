/** Restore formatting already allowlisted by the notes API, without decoding
 * entities into a second layer of markup. Legacy cells contain plain text. */
export function noteTableCellHtml(cell: { text?: string; html?: string } | null | undefined): string {
  if (typeof cell?.html === 'string' && cell.html !== '') return cell.html
  return (cell?.text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\n/g, '<br/>')
}
