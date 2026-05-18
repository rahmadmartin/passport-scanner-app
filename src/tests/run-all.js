const { spawnSync } = require('child_process');
const path = require('path');

const tests = [
  'sanitize.test.js',
  'formatters.test.js',
  'renderer-modules.test.js',
  'renderer-entry.test.js',
];

let failed = false;

for (const testFile of tests) {
  const testPath = path.join(__dirname, testFile);
  console.log(`\nRunning ${testFile}`);

  const result = spawnSync(process.execPath, [testPath], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`FAILED ${testFile}`);
  }
}

if (failed) {
  process.exit(1);
}

console.log('\nAll tests passed');
