const Conf = require('conf').default;

// Alfred sets alfred_workflow_cache for every script it runs. Outside Alfred, conf
// falls back to a per-user config folder named after projectName.
module.exports = new Conf({
  projectName: 'alfred-jira-lookup',
  cwd: process.env.alfred_workflow_cache,
  configName: 'jira-data',
  schema: {
    updated: { type: 'number' },
    items: { type: 'array', default: [] },
  },
  serialize: (value) => JSON.stringify(value),
});
