import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkProductionBundles } from '../scripts/check-production-bundles.mjs'

function fixture(t, manifest, sizes) {
  const dist = mkdtempSync(join(tmpdir(), 'unitespace-bundle-test-'))
  t.after(() => rmSync(dist, { recursive: true, force: true }))
  mkdirSync(join(dist, '.vite'))
  writeFileSync(join(dist, '.vite/manifest.json'), JSON.stringify(manifest))
  for (const [file, size] of Object.entries(sizes)) writeFileSync(join(dist, file), 'x'.repeat(size))
  return dist
}

test('initial budget follows static imports, counts shared code once and defers optional code', t => {
  const dist = fixture(t, {
    'index.html': { file: 'entry.js', isEntry: true, imports: ['first', 'second'], dynamicImports: ['optional'] },
    first: { file: 'first.js', imports: ['shared'] },
    second: { file: 'second.js', imports: ['shared'] },
    shared: { file: 'shared.js', imports: [] },
    optional: { file: 'optional.js', imports: [] },
  }, { 'entry.js': 20, 'first.js': 30, 'second.js': 30, 'shared.js': 40, 'optional.js': 500 })
  assert.deepEqual(checkProductionBundles(dist, { initialBudget: 120, chunkBudget: 500 }), {
    initialBytes: 120, initialChunks: 4, largestChunk: 500,
  })
  assert.throws(() => checkProductionBundles(dist, { initialBudget: 119, chunkBudget: 500 }), /Initial JavaScript/)
})

test('an oversized optional library still fails the independent chunk budget', t => {
  const dist = fixture(t, {
    'index.html': { file: 'entry.js', isEntry: true, dynamicImports: ['optional'] },
    optional: { file: 'optional.js' },
  }, { 'entry.js': 20, 'optional.js': 50 })
  assert.throws(() => checkProductionBundles(dist, { initialBudget: 20, chunkBudget: 49 }), /optional\.js.*chunk budget/)
})

test('a missing dependency cannot silently reduce the reported initial size', t => {
  const dist = fixture(t, {
    'index.html': { file: 'entry.js', isEntry: true, imports: ['missing'] },
  }, { 'entry.js': 20 })
  assert.throws(() => checkProductionBundles(dist), /Missing manifest dependency: missing/)
})

test('a missing application entry fails validation', t => {
  const dist = fixture(t, {}, {})
  assert.throws(() => checkProductionBundles(dist), /Missing application entry/)
})
