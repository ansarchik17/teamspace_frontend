import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const ROOT = process.cwd()
const SRC_DIR = path.join(ROOT, 'src')
const LOCALES_DIR = path.join(SRC_DIR, 'shared/i18n/locales')
const BASELINE_FILE = path.join(ROOT, 'scripts/i18n-baseline.json')
const REFERENCE_LANGUAGE = 'ru'
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const CYRILLIC = /[\u0400-\u04FF]/
const IGNORE_MARKER = 'i18n-ignore'
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const PLACEHOLDER = /{{\s*([\w.]+)\s*(?:,[^}]*)?}}/g

const args = new Set(process.argv.slice(2))
const updateBaseline = args.has('--update')

const relative = (file) => path.relative(ROOT, file).split(path.sep).join('/')

const flatten = (value, prefix = '', out = {}) => {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, fullKey, out)
    else out[fullKey] = child
  }
  return out
}

const placeholdersOf = (text) => new Set([...String(text).matchAll(PLACEHOLDER)].map((match) => match[1]))

const describeCatalog = (entries) => {
  const keys = new Map()
  for (const [key, value] of Object.entries(entries)) {
    const pluralMatch = key.match(PLURAL_SUFFIX)
    const baseKey = pluralMatch ? key.slice(0, -pluralMatch[0].length) : key
    const info = keys.get(baseKey) ?? { categories: new Set(), placeholders: new Set(), empty: [] }
    if (pluralMatch) info.categories.add(pluralMatch[1])
    if (typeof value !== 'string' || value.trim() === '') info.empty.push(key)
    else for (const name of placeholdersOf(value)) info.placeholders.add(name)
    keys.set(baseKey, info)
  }
  return keys
}

const checkCatalogs = () => {
  const errors = []
  if (!fs.existsSync(LOCALES_DIR)) return { errors: [`Каталог переводов не найден: ${relative(LOCALES_DIR)}`], keyCount: 0 }
  const languages = fs.readdirSync(LOCALES_DIR).filter((name) => fs.statSync(path.join(LOCALES_DIR, name)).isDirectory())
  if (!languages.includes(REFERENCE_LANGUAGE)) errors.push(`Нет эталонного языка ${REFERENCE_LANGUAGE}`)
  const namespaces = new Set(languages.flatMap((language) =>
    fs.readdirSync(path.join(LOCALES_DIR, language)).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5))))

  let keyCount = 0
  for (const namespace of [...namespaces].sort()) {
    const catalogs = {}
    for (const language of languages) {
      const file = path.join(LOCALES_DIR, language, `${namespace}.json`)
      if (!fs.existsSync(file)) {
        errors.push(`${language}/${namespace}.json: файл отсутствует`)
        continue
      }
      try {
        catalogs[language] = describeCatalog(flatten(JSON.parse(fs.readFileSync(file, 'utf8'))))
      } catch (error) {
        errors.push(`${language}/${namespace}.json: некорректный JSON (${error.message})`)
      }
    }
    const reference = catalogs[REFERENCE_LANGUAGE]
    if (!reference) continue
    keyCount += reference.size

    for (const [language, catalog] of Object.entries(catalogs)) {
      const requiredCategories = new Intl.PluralRules(language).resolvedOptions().pluralCategories
      for (const [key, info] of catalog) {
        for (const emptyKey of info.empty) errors.push(`${language}/${namespace}: пустое значение "${emptyKey}"`)
        if (info.categories.size > 0) {
          const missing = requiredCategories.filter((category) => !info.categories.has(category))
          if (missing.length) errors.push(`${language}/${namespace}: у "${key}" нет форм множественного числа ${missing.map((c) => `_${c}`).join(', ')}`)
        }
      }
      if (language === REFERENCE_LANGUAGE) continue
      for (const [key, info] of reference) {
        const translated = catalog.get(key)
        if (!translated) {
          errors.push(`${language}/${namespace}: нет перевода "${key}"`)
          continue
        }
        if ((info.categories.size > 0) !== (translated.categories.size > 0)) {
          errors.push(`${language}/${namespace}: "${key}" должен быть ${info.categories.size > 0 ? 'с' : 'без'} форм множественного числа, как в ${REFERENCE_LANGUAGE}`)
        }
        const expected = [...info.placeholders].sort().join(', ')
        const actual = [...translated.placeholders].sort().join(', ')
        if (expected !== actual) errors.push(`${language}/${namespace}: плейсхолдеры "${key}" отличаются: ${REFERENCE_LANGUAGE} [${expected}], ${language} [${actual}]`)
      }
      for (const key of catalog.keys()) {
        if (!reference.has(key)) errors.push(`${language}/${namespace}: лишний ключ "${key}", его нет в ${REFERENCE_LANGUAGE}`)
      }
    }
  }
  return { errors, keyCount }
}

const listSourceFiles = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (full !== LOCALES_DIR) listSourceFiles(full, out)
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

const isConsoleCall = (node) => {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current)) {
      const callee = current.expression
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'console') return true
    }
    if (ts.isStatement(current)) return false
  }
  return false
}

const scriptKindOf = (file) => {
  switch (path.extname(file)) {
    case '.tsx': return ts.ScriptKind.TSX
    case '.jsx': return ts.ScriptKind.JSX
    case '.js': return ts.ScriptKind.JS
    default: return ts.ScriptKind.TS
  }
}

const findCyrillicLiterals = (file) => {
  const text = fs.readFileSync(file, 'utf8')
  if (!CYRILLIC.test(text)) return []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindOf(file))
  const lines = text.split('\n')
  const isIgnored = (line) => lines[line]?.includes(IGNORE_MARKER) || lines[line - 1]?.includes(IGNORE_MARKER)
  const found = []
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    let literal = null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) literal = node.text
    else if (ts.isJsxText(node)) literal = node.text.trim()
    if (literal && CYRILLIC.test(literal) && !isConsoleCall(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
      if (!isIgnored(line)) found.push({ line: line + 1, text: literal.replace(/\s+/g, ' ').slice(0, 80) })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

const scanSources = () => {
  const files = {}
  for (const file of listSourceFiles(SRC_DIR)) {
    const literals = findCyrillicLiterals(file)
    if (literals.length) files[relative(file)] = literals
  }
  return files
}

const readBaseline = () => {
  if (!fs.existsSync(BASELINE_FILE)) return null
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
}

const writeBaseline = (files) => {
  const counts = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([file, literals]) => [file, literals.length]))
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify({ total, files: counts }, null, 2)}\n`)
  return total
}

const main = () => {
  const catalog = checkCatalogs()
  const sources = scanSources()
  const currentTotal = Object.values(sources).reduce((sum, literals) => sum + literals.length, 0)

  if (updateBaseline) {
    const total = writeBaseline(sources)
    console.log(`Baseline обновлён: ${total} строк в ${Object.keys(sources).length} файлах → ${relative(BASELINE_FILE)}`)
  }

  const errors = [...catalog.errors]
  const notices = []
  const baseline = updateBaseline ? null : readBaseline()

  if (!updateBaseline) {
    if (!baseline) {
      errors.push(`Нет ${relative(BASELINE_FILE)}. Создайте его: npm run i18n:baseline`)
    } else {
      const allowed = baseline.files ?? {}
      for (const [file, literals] of Object.entries(sources)) {
        const limit = allowed[file] ?? 0
        if (literals.length > limit) {
          const sample = literals.slice(0, 10).map(({ line, text }) => `    ${file}:${line}  ${text}`).join('\n')
          errors.push(`${file}: строк с кириллицей ${literals.length}, допустимо ${limit}. Вынесите новые строки в каталог переводов:\n${sample}${literals.length > 10 ? '\n    …' : ''}`)
        } else if (literals.length < limit) {
          notices.push(`${file}: ${limit} → ${literals.length}`)
        }
      }
      for (const [file, limit] of Object.entries(allowed)) {
        if (!sources[file] && limit > 0) notices.push(`${file}: ${limit} → 0`)
      }
      if (notices.length) {
        errors.push(`Строк без перевода стало меньше, обновите baseline (npm run i18n:baseline):\n${notices.map((n) => `    ${n}`).join('\n')}`)
      }
    }
  }

  console.log(`i18n: ключей в ${REFERENCE_LANGUAGE}: ${catalog.keyCount}; строк с кириллицей вне каталогов: ${currentTotal} в ${Object.keys(sources).length} файлах${baseline ? ` (baseline ${baseline.total})` : ''}`)
  if (errors.length) {
    console.error(`\nОшибки i18n (${errors.length}):\n${errors.map((error) => `  - ${error}`).join('\n')}`)
    process.exit(1)
  }
  console.log('i18n: OK')
}

main()
