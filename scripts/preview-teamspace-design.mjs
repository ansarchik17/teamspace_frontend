import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Run the existing authenticated applications without changing backend settings.
const frontend = fileURLToPath(new URL('../', import.meta.url))
const iform = path.resolve(frontend, '../../iform/frontend')
const processes = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of processes) if (child.exitCode === null && child.pid) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM')
      else process.kill(-child.pid, 'SIGTERM')
    } catch (error) { if (error.code !== 'ESRCH') console.error(error.message) }
  }
  process.exitCode = code
}
function run(cwd, args, env = {}) {
  const child = spawn('npm', args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit', detached: process.platform !== 'win32' })
  processes.push(child)
  child.on('error', (error) => { console.error(error.message); stop(1) })
  child.on('exit', (code) => { if (!stopping) stop(code || 0) })
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
run(iform, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5188'], { VITE_AUTH_MODE: 'workspace', VITE_BASE_PATH: '/iform-app/' })
run(frontend, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5199', '--strictPort'])
console.log('UniteSpace: http://127.0.0.1:5199/web/workspace')
console.log('Design system: http://127.0.0.1:5199/web/design-system')
