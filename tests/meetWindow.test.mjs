import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(
  new URL('../src/presentation/pages/meet/meetWindowUtils.ts', import.meta.url),
  'utf8',
)
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
})
const { clampMeetPosition, copyMeetStyles } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

test('keeps the draggable meeting reachable at every viewport edge', () => {
  assert.deepEqual(clampMeetPosition(-80, -40, 400, 340, 1280, 720), {
    left: 0,
    top: 0,
  })
  assert.deepEqual(clampMeetPosition(3000, 900, 400, 340, 1280, 720), {
    left: 880,
    top: 380,
  })
  assert.deepEqual(clampMeetPosition(272, 258, 400, 340, 1280, 720), {
    left: 272,
    top: 258,
  })
  // A viewport can shrink below the original window size while a call continues.
  assert.deepEqual(clampMeetPosition(880, 380, 400, 340, 320, 240), {
    left: 0,
    top: 0,
  })
})

function documents(sheets = [], adopted = []) {
  const copies = []
  const source = {
    baseURI: 'https://a.teamspace.kz/web/meet/room',
    styleSheets: sheets,
    adoptedStyleSheets: adopted,
    documentElement: { lang: 'ru', className: 'dark' },
    body: { className: 'workspace' },
  }
  const target = {
    createElement: (tagName) => ({ tagName, dataset: {} }),
    head: { appendChild: (node) => copies.push(node) },
    documentElement: { style: {} },
    body: { style: {} },
  }
  return { source, target, copies }
}

test('PiP snapshots CSSOM rules, including adopted styles and dynamically inserted rules', () => {
  const sheet = {
    cssRules: [{ cssText: '.meet-room { display: flex; }' }],
    media: { mediaText: '' },
  }
  const adopted = {
    cssRules: [{ cssText: '.dynamic { color: white; }' }],
    media: { mediaText: 'screen' },
  }
  const { source, target, copies } = documents([sheet], [adopted])
  copyMeetStyles(source, target, '.meet-control { border-radius: 50%; }')
  assert.equal(copies[0].href, source.baseURI)
  assert.equal(copies[1].textContent, sheet.cssRules[0].cssText)
  assert.equal(copies[2].textContent, adopted.cssRules[0].cssText)
  assert.equal(copies[2].media, 'screen')
  assert.equal(copies[3].dataset.meetWindow, 'true')
  assert.equal(copies[3].textContent, '.meet-control { border-radius: 50%; }')
  assert.equal(target.documentElement.lang, 'ru')
  assert.equal(target.documentElement.className, 'dark')
  assert.match(target.body.style.cssText, /margin:0/)
})

test('PiP retains the meeting design even when global stylesheets cannot be read', () => {
  const external = {
    href: 'https://cdn.example.com/app.css',
    media: { mediaText: '' },
    get cssRules() {
      throw new Error('SecurityError')
    },
  }
  const unreadable = {
    get cssRules() {
      throw new Error('SecurityError')
    },
  }
  const disabled = {
    disabled: true,
    cssRules: [{ cssText: 'body { display: none; }' }],
  }
  const { source, target, copies } = documents([external, unreadable, disabled])
  copyMeetStyles(source, target, '.meet-room { display: flex; color: white; }')
  assert.equal(copies.length, 3)
  assert.equal(copies[1].rel, 'stylesheet')
  assert.equal(copies[1].href, external.href)
  assert.equal(
    copies[2].textContent,
    '.meet-room { display: flex; color: white; }',
  )
  assert.equal(copies[2].dataset.meetWindow, 'true')
})
