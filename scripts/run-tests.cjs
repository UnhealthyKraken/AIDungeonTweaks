// Keep native test failures and require a real passing test in the final TAP summary.
const process = require('node:process');
const console = require('node:console');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['--test', '--test-reporter=tap', ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'inherit'],
});
let tail = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  tail = (tail + chunk).slice(-65536);
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('close', (status, signal) => {
  if (status !== 0 || signal) {
    process.exitCode = status || 1;
    return;
  }
  // Match the complete final runner summary, never a test's indented/comment output.
  const summary = /(?:^|\n)# tests (\d+)\r?\n# suites \d+\r?\n# pass (\d+)\r?\n# fail \d+\r?\n# cancelled \d+\r?\n# skipped \d+\r?\n# todo \d+\r?\n# duration_ms [\d.]+\r?\n?$/.exec(tail);
  if (!summary || Number(summary[1]) === 0 || Number(summary[2]) === 0) {
    console.error('No passing tests executed or missing test summary; refusing to pass CI.');
    process.exitCode = 1;
  }
});
