// Local component acceptance only. Does not log credentials, deploy or call production.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const front = path.resolve(__dirname, '..');
const backend = process.env.ODO_TEST_WORKSPACE_REPO || path.resolve(front, '../workspace-backend');
const odo = process.env.ODO_TEST_SOURCE_REPO;
const odoFront = process.env.ODO_TEST_FRONTEND_REPO;
const required = ['TEST_MESSENGER_DATABASE_URL', 'TEST_WORKFLOW_DATABASE_URL', 'ACCESS_CONTRACT_SD_REPO', 'ACCESS_CONTRACT_IFORM_REPO'];
if (process.env.ODO_TEST_DATABASE_DISPOSABLE !== 'true' || !odo || !odoFront || required.some(key => !process.env[key])) {
  console.error('Explicit disposable database confirmation, both test DSNs and consumer repository paths are required. See docs/access-acceptance.md in workspace-backend.');
  process.exit(2);
}
for (const root of [front, backend, odo, odoFront, process.env.ACCESS_CONTRACT_SD_REPO, process.env.ACCESS_CONTRACT_IFORM_REPO]) {
  if (!fs.existsSync(root)) { console.error('A configured repository is missing.'); process.exit(2); }
}
const env = { ...process.env, IFORM_TEST_DATABASE_URL: process.env.TEST_MESSENGER_DATABASE_URL, ACCESS_CONTRACT_ODO_REPO: odo };
function go(label, cwd, args) {
  const result = spawnSync('go', ['test', '-p', '1', '-json', '-count=1', '-timeout=10m', ...args], {cwd, env, encoding:'utf8', maxBuffer:64*1024*1024, timeout:15*60*1000});
  const events = (result.stdout || '').split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  const passed = events.filter(e => e.Test && e.Action === 'pass');
  const skipped = events.filter(e => e.Test && e.Action === 'skip');
  const failed = events.filter(e => e.Action === 'fail');
  console.log(`${label}: ${passed.length} tests/subtests passed, ${skipped.length} skipped, ${failed.length} failures`);
  for (const e of [...failed, ...skipped]) console.error(`${e.Action}: ${e.Package} ${e.Test || ''}`);
  if (result.error || result.status !== 0 || !passed.length || skipped.length || failed.length) {
    console.error('Acceptance failed. Run the failing package locally for diagnostics; raw output is omitted to protect credentials.');
    process.exit(1);
  }
}
function node(label, cwd, file, args = []) {
  console.log(label);
  const result = spawnSync(process.execPath, [path.resolve(cwd, file), ...args], {cwd, env, stdio:'inherit', timeout:5*60*1000});
  if (result.error || result.status !== 0) process.exit(1);
}

go('Workspace access', backend, ['./internal/domain', './internal/auth', './internal/handler', './internal/repository', './internal/service', './internal/middleware', './db/migrations', '-run', 'Test(Access|OrganizationAccess|IForm|.*IForm|ODO|.*Documentolog|.*UserCreat|.*EmployeeCreat|.*Position|.*Migration)']);
go('Workspace migration registry', backend, ['./cmd/migrate', '-run', '^(TestMigrationsEnabled|TestRepositoryMigrationVersionsAreUnique)$']);
go('ODO full backend', odo, ['./...']);
for (const script of ['test-position-access-flow','test-position-access-state','test-permission-selection','test-employee-creation-flow','test-odo-assignments','test-odo-assignment-flow','test-odo-navigation','test-odo-dashboard-counts']) {
  node(script, front, `scripts/${script}.cjs`);
}
node('Workspace TypeScript', front, 'node_modules/typescript/bin/tsc', ['-b']);
node('Workspace localization', front, 'scripts/check-i18n.mjs');
node('ODO TypeScript', odoFront, 'node_modules/typescript/bin/tsc', ['-b']);
node('ODO frontend tests', odoFront, 'node_modules/vitest/vitest.mjs', ['run']);
node('ODO localization', odoFront, 'scripts/check-localization.mjs');
console.log('Local Workspace/ODO acceptance passed. Separate SenimDesk/iForm tests, browser scenarios, deployed session/network checks and OpenAPI validation remain independent release gates.');
