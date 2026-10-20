const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runner = path.join(__dirname, '../scripts/run-tests.cjs');
function fixture(source, args = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-runner-'));
  try {
    const file = path.join(directory, source === null ? 'missing-*.test.cjs' : 'example.test.cjs');
    if (source !== null) fs.writeFileSync(file, source);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, [runner, ...args.map((arg) => arg.replace('REPORT_PATH', path.join(directory, 'report.tap'))), file], { encoding: 'utf8', env });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test('test runner rejects empty discovery', () => {
  const result = fixture(null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No passing tests executed/);
});
test('test runner propagates assertion failures', () => {
  const result = fixture("require('node:test')('negative control', () => { throw Error('intentional failure'); });");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /intentional failure/);
});
test('test runner accepts a passing suite', () => {
  const result = fixture("require('node:test')('passing control', () => { require('node:assert/strict').equal(2 + 2, 4); });");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# tests 1/);
});

test('test runner rejects an all-skipped suite', () => {
  const result = fixture("require('node:test').skip('skipped control', () => {});");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No passing tests executed/);
});
test('test runner rejects an all-todo suite', () => {
  const result = fixture("require('node:test').todo('todo control');");
  assert.equal(result.status, 1);
});
test('test runner rejects a missing TAP summary', () => {
  const result = fixture("require('node:test')('passing control', () => {});", ['--test-reporter-destination=REPORT_PATH']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing test summary/);
});
