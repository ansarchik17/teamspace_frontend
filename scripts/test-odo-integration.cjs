// Runs the three repositories against an explicitly disposable PostgreSQL.
// No production API calls, tokens, commits or deployment operations.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (!process.env.TEST_MESSENGER_DATABASE_URL || process.env.ODO_TEST_DATABASE_DISPOSABLE !== 'true') {
  console.error('Set TEST_MESSENGER_DATABASE_URL and ODO_TEST_DATABASE_DISPOSABLE=true for a disposable database.');
  process.exit(2);
}
const front = path.resolve(__dirname, '..');
const backend = process.env.ODO_TEST_WORKSPACE_REPO || path.resolve(front, '../workspace-backend');
const odo = process.env.ODO_TEST_SOURCE_REPO || path.resolve(front, '../workspace-odo/workspace-odo-backend');
function go(cwd, packages, pattern) {
  const result = spawnSync('go', ['test', ...packages, '-run', pattern, '-json', '-count=1', '-timeout=5m'], {
    cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 360000,
  });
  // Keep DSNs and arbitrary test output out of the report.
  const events = (result.stdout || '').split('\n').flatMap(line => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const passed = events.filter(e => e.Test && e.Action === 'pass');
  const skipped = events.filter(e => e.Test && e.Action === 'skip');
  const failed = events.filter(e => e.Action === 'fail');
  console.log(`${path.basename(cwd)}: ${passed.length} passed, ${skipped.length} skipped, ${failed.length} failed`);
  for (const e of [...failed, ...skipped]) console.error(`${e.Action}: ${e.Package} ${e.Test || ''}`);
  if (result.error || result.status !== 0 || !passed.length || skipped.length || failed.length) {
    console.error('Integration gate failed; rerun the corresponding go test command locally for diagnostics.');
    process.exit(1);
  }
}
go(backend, ['./internal/service', './internal/handler', './internal/middleware', './internal/domain'], 'TestODO|TestDocumentolog');
go(odo, ['./internal/workflow/integration', './internal/workflow/repository', './internal/workflow/service',
  './internal/workflow/transport', './internal/bff/handler', './internal/bff/middleware', './internal/migrations'],
  'TestWorkspace|TestWorkflowTransportCapturesFullAssignment|TestAssignmentSnapshot');
const ui = spawnSync(process.execPath, ['scripts/test-odo-assignments.cjs'], { cwd: front, stdio: 'inherit', timeout: 60000 });
if (ui.error || ui.status !== 0) process.exit(1);
console.log('ODO local integration gate passed. Real SSH/network/Keycloak verification is still required.');
