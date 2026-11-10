// Shared by the employee form and mailbox allocation. Keep Go's
// domain.SuggestedEmployeeLogin in sync with these transliteration rules.
const cyrillic: Record<string, string> = {
  а: 'a', ә: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'i', к: 'k', қ: 'q', л: 'l', м: 'm', н: 'n', ң: 'ng', о: 'o',
  ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'kh',
  һ: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y', і: 'i', э: 'e', ю: 'yu', я: 'ya',
  ъ: '', ь: '',
}

function latin(value: string) {
  return Array.from(value.trim().toLowerCase())
    .map(letter => cyrillic[letter] ?? letter)
    .join('').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function suggestedEmployeeLogin(firstName: string, lastName: string) {
  const first = latin(firstName), last = latin(lastName)
  return first && last ? `${first[0]}.${last}`.slice(0, 50).replace(/[.-]+$/g, '') : ''
}
