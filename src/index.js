const alfred = require('./utils/alfred-simple');
const Conf = require('conf');
const childProcess = require('child_process');
const path = require('path');

// Check if workflow is configured
if (!(process.env.JIRA_DOMAIN && process.env.JIRA_TOKEN && process.env.JIRA_USERNAME)) {
  alfred.output([
    {
      title: 'The workflow is not configured yet.',
      subtitle: 'Configure JIRA_DOMAIN, JIRA_TOKEN, and JIRA_USERNAME in workflow settings.',
      valid: false,
    },
  ]);
  process.exit();
}

// Initialize data cache
const data = new Conf({
  configName: 'jira-data',
  schema: {
    updated: { type: 'number' },
    items: { type: 'array', default: [] },
  },
  serialize: (value) => JSON.stringify(value),
});

// Run background update
const updateScript = path.resolve(__dirname, 'update-data.js');
const child = childProcess.spawn('./node_modules/.bin/run-node', [updateScript], {
  detached: true,
  stdio: 'ignore',
});
child.unref();

// Get cached issues
const issues = data.get('items') || [];
let items = [];

if (!issues.length) {
  items.push({
    title: `There is no issue matching "${alfred.input}"`,
    subtitle: 'Press ⏎ to open your search in Jira →',
    arg: `https://${process.env.JIRA_DOMAIN}.atlassian.net/secure/QuickSearch.jspa?searchString=${alfred.input}`,
  });
} else {
  items = items.concat(issues);
}

// Output with workflow variables
alfred.output(items, { rerun: 5 });
