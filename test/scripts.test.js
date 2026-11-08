const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const src = path.join(__dirname, '..', 'src');

// Run a workflow script the way Alfred does, against a fresh cache so no script calls Jira.
function run(script, ...args) {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'alfred-jira-lookup-'));
  const items = [{ title: 'ABC-1 Fix the thing', arg: 'https://example.atlassian.net/browse/ABC-1' }];
  fs.writeFileSync(path.join(cache, 'jira-data.json'), JSON.stringify({ updated: Date.now(), items }));
  const env = {
    ...process.env,
    alfred_workflow_cache: cache,
    JIRA_DOMAIN: 'example',
    JIRA_USERNAME: 'user',
    JIRA_TOKEN: 'token',
  };
  return execFileSync(process.execPath, [script, ...args], { cwd: src, env, encoding: 'utf8' });
}

test('index.js lists the cached issues', () => {
  const output = JSON.parse(run('index.js', 'abc'));
  assert.deepStrictEqual(
    output.items.map((item) => item.title),
    ['ABC-1 Fix the thing'],
  );
});

test('update-data.js skips the update while the cache is fresh', () => {
  assert.match(run('update-data.js'), /Data in cache still valid/);
});
