import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const INITIAL_JS_BUDGET = 600_000
export const OPTIONAL_CHUNK_BUDGET = 1_500_000

export function checkProductionBundles(dist, { initialBudget = INITIAL_JS_BUDGET, chunkBudget = OPTIONAL_CHUNK_BUDGET } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'))
  if (!manifest['index.html']?.isEntry) throw new Error('Missing application entry in the Vite manifest')
  const initial = new Set()
  const visit = (key) => {
    if (initial.has(key)) return
    if (!manifest[key]) throw new Error(`Missing manifest dependency: ${key}`)
    initial.add(key)
    for (const dependency of manifest[key].imports ?? []) visit(dependency)
  }
  visit('index.html')
  const files = new Map()
  for (const chunk of Object.values(manifest)) {
    if (chunk.file.endsWith('.js')) files.set(chunk.file, statSync(resolve(dist, chunk.file)).size)
  }
  const initialFiles = new Set([...initial].map(key => manifest[key].file))
  const initialBytes = [...initialFiles].reduce((sum, file) => sum + (files.get(file) ?? 0), 0)
  if (initialBytes > initialBudget) throw new Error(`Initial JavaScript is ${initialBytes} bytes; budget is ${initialBudget}`)
  for (const [file, bytes] of files) {
    if (bytes > chunkBudget) throw new Error(`${file} is ${bytes} bytes; chunk budget is ${chunkBudget}`)
  }
  return { initialBytes, initialChunks: initialFiles.size, largestChunk: Math.max(...files.values()) }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
  const result = checkProductionBundles(dist)
  console.log(`Bundle budget OK: initial JS ${(result.initialBytes / 1000).toFixed(1)} kB / ${INITIAL_JS_BUDGET / 1000} kB; largest chunk ${(result.largestChunk / 1000).toFixed(1)} kB / ${OPTIONAL_CHUNK_BUDGET / 1000} kB`)
}
