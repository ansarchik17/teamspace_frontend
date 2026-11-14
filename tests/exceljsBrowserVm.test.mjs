import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import ExcelJS from 'exceljs'

const source = readFileSync(new URL('../build/exceljsBrowserVm.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { fixExcelJsBrowserVm, excelJsBrowserVm } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

test('vm-browserify evaluates in the global context without seeing module locals', () => {
  const factory = `(function () {
    const moduleSecret = 42;
    return { code: 'typeof moduleSecret', runInThisContext: function () { return eval(this.code) } };
  })()`
  const context = vm.createContext({ globalMarker: 17 })
  const script = vm.runInContext(fixExcelJsBrowserVm(factory), context)
  assert.equal(script.runInThisContext(), 'undefined')
  script.code = 'globalMarker + 1'
  assert.equal(script.runInThisContext(), 18)
})

test('the build transform leaves application code and other dependencies untouched', () => {
  const plugin = excelJsBrowserVm()
  const code = 'function evaluate() { return eval(this.code) }'
  assert.equal(plugin.transform(code, '/src/application.js'), null)
  assert.equal(plugin.transform(code, '/node_modules/another-library/index.js'), null)
})

test('the transformed browser bundle exports valid XLSX data, styles and frozen headers', async () => {
  const code = readFileSync(new URL('../node_modules/exceljs/dist/exceljs.min.js', import.meta.url), 'utf8')
  const module = { exports: {} }
  const scope = { module, exports: module.exports, setTimeout, clearTimeout, setImmediate, clearImmediate, Buffer, process }
  const context = vm.createContext(scope)
  vm.runInContext(fixExcelJsBrowserVm(code), context, { timeout: 10_000 })
  // ExcelJS 3.x checks array values with instanceof Array. Construct workbook
  // data in the same realm as its browser bundle, as a real browser would.
  vm.runInContext(`
    globalThis.browserWorkbook = new module.exports.Workbook();
    const sheet = browserWorkbook.addWorksheet('Данные', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.addRow(['Имя', 'Сумма', 'Активен']);
    sheet.getRow(1).font = { bold: true };
    sheet.addRow(['Тест <&> ә', 1234.5, true]);
  `, context)
  const browserWorkbook = context.browserWorkbook
  const buffer = await browserWorkbook.xlsx.writeBuffer()

  const reader = new ExcelJS.Workbook()
  await reader.xlsx.load(buffer)
  const result = reader.getWorksheet('Данные')
  assert.equal(result.getCell('A2').value, 'Тест <&> ә')
  assert.equal(result.getCell('B2').value, 1234.5)
  assert.equal(result.getCell('C2').value, true)
  assert.equal(result.getCell('A1').font.bold, true)
  assert.equal(result.views[0].state, 'frozen')
  assert.equal(result.views[0].ySplit, 1)
})
