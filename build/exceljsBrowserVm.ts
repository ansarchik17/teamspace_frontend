import type { Plugin } from 'vite'

// ExcelJS 3.x bundles vm-browserify. Its runInThisContext API evaluates in the
// global context, so an indirect eval preserves that contract without making
// the bundle's local scope visible to evaluated code or blocking minification.
export function fixExcelJsBrowserVm(code: string): string {
  return code.replace(/\breturn eval\(this\.code\)/g, 'return (0, eval)(this.code)')
}

export function excelJsBrowserVm(): Plugin {
  return {
    name: 'exceljs-browser-vm',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]exceljs[\\/]dist[\\/]exceljs\.min\.js$/.test(id.split('?')[0])) return null
      const transformed = fixExcelJsBrowserVm(code)
      return transformed === code ? null : { code: transformed, map: null }
    },
  }
}
