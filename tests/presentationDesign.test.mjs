import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  slideBullets,
  slideParagraphs,
  slideLayout,
  plainSlideText,
  citationFooter,
  getPresentationTheme,
  readPresentationTheme,
  PRESENTATION_THEMES,
} from '../src/presentation/pages/alemdrive/drive-src/utils/presentationDesign.js'

const cite = (n) => `[doc.docx, строки ${n}–${n}](/web/drive/notebook?chat=c&source=s&start_line=${n}&end_line=${n})`

test('bullets drop the dash that only separates a citation', () => {
  const { items, ordered } = slideBullets(`- Заявление — ${cite(1)}\n- Подпись и дата`)
  assert.deepEqual(items, [`Заявление ${cite(1)}`, 'Подпись и дата'])
  assert.equal(ordered, false)
  assert.equal(slideBullets('1. Первый\n2. Второй').ordered, true)
})

test('each slide content appears once: paragraphs exclude bullets, tables and headings', () => {
  const body = `Вступление.\n\n- Пункт\n\n| a | b |\n|---|---|\n\n### Раздел\n\nИтог.`
  assert.deepEqual(slideParagraphs(body), ['Вступление.', 'Итог.'])
})

test('layouts', () => {
  const bullets = (n) => Array.from({ length: n }, (_, i) => `- Пункт ${i + 1}`).join('\n')
  assert.equal(slideLayout({ title: 'Обзор', body: bullets(3) }, 0, 5), 'cover')
  assert.equal(slideLayout({ title: 'Процесс оформления', body: bullets(3) }, 2, 5), 'steps')
  assert.equal(slideLayout({ title: 'Факты', body: bullets(5) }, 2, 5), 'cards')
  assert.equal(slideLayout({ title: 'Выводы', body: bullets(3) }, 4, 5), 'summary')
  assert.equal(slideLayout({ title: 'Факты', body: bullets(2) }, 2, 5), 'list')
  assert.equal(slideLayout({ title: 'Таблица', body: '| a | b |\n|---|---|\n| 1 | 2 |' }, 2, 5), 'markdown')
  assert.equal(slideLayout({ title: 'Схема', body: '```mermaid\ngraph TD\n```' }, 0, 5), 'markdown')
})

test('pptx text numbers citations once per slide', () => {
  const registry = new Map()
  assert.equal(plainSlideText(`Факт ${cite(1)} и **ещё** ${cite(1)} ${cite(2)}`, registry), 'Факт [1] и ещё [1] [2]')
  assert.deepEqual([...registry.values()].map((x) => x.label), ['doc.docx, строки 1–1', 'doc.docx, строки 2–2'])
  assert.equal(citationFooter(registry), '[1–2] doc.docx')
})

test('theme falls back to the first one', () => {
  assert.equal(getPresentationTheme('nope').id, PRESENTATION_THEMES[0].id)
  assert.equal(readPresentationTheme({ getItem: () => 'dark' }), 'dark')
  assert.equal(readPresentationTheme({ getItem: () => { throw new Error('blocked') } }), PRESENTATION_THEMES[0].id)
})
