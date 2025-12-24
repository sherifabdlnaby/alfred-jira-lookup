const axios = require('axios');
const Conf = require('conf');
const formatIssues = require('./utils/format-issues');

// Initialize data cache
const data = new Conf({
  configName: 'jira-data',
  schema: {
    updated: { type: 'number' },
    items: { type: 'array', default: [] },
  },
  serialize: (value) => JSON.stringify(value),
});

const fields = [
  'key',
  'assignee',
  'summary',
  'project',
  'issuetype',
  'status',
  'updated',
].join(',');

const MAX_RESULTS = 100;

// Cache refresh interval in milliseconds
// Default to 5 minutes if not set
const CACHE_REFRESH_MINS = parseInt(process.env.CACHE_REFRESH_MINS) || 5;
const MAX_AGE = 1000 * 60 * CACHE_REFRESH_MINS;

const instance = axios.create({
  baseURL: `https://${process.env.JIRA_DOMAIN}.atlassian.net/rest/api/3/`,
  auth: {
    username: process.env.JIRA_USERNAME,
    password: process.env.JIRA_TOKEN,
  },
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

const issues = [];

/**
 * Save data at the end.
 */
function end() {
  console.log(`Saving results in ${data.path}...`);
  data.set({
    items: issues.flat(),
    updated: Date.now(),
  });
  console.log('All done!');
}

/**
 * Get a page result using nextPageToken pagination.
 * @param {string|null} nextPageToken - The token for the next page, or null for the first page
 */
function getPageResult(nextPageToken = null) {
  return async () => {
    const pageInfo = nextPageToken ? `with token ${nextPageToken.substring(0, 20)}...` : 'first page';
    console.log(`Getting page result (${pageInfo})...`);
    
    return new Promise((resolve, reject) => {
      // Build JQL with ORDER BY clause (default to updated DESC)
      const baseJQL = process.env.CACHE_QUERY;
      const orderBy = (process.env.JIRA_ORDER_BY || '').trim() || 'updated DESC';
      const jql = `${baseJQL} ORDER BY ${orderBy}`;
      
      const requestBody = {
        jql: jql,
        maxResults: MAX_RESULTS,
        fields: fields.split(','),
      };
      
      // Add nextPageToken only if it exists (not for the first page)
      if (nextPageToken) {
        requestBody.nextPageToken = nextPageToken;
      }
      
      instance
        .post('search/jql', requestBody)
        .then((response) => {
          console.log(`Got ${response.data.issues?.length || 0} issues!`);
          issues.push(formatIssues(response.data.issues));
          resolve(response.data);
        })
        .catch((error) => {
          console.error('API Error:', error.response?.status, error.response?.statusText);
          console.error('Error details:', JSON.stringify(error.response?.data, null, 2));
          console.error('Request payload:', JSON.stringify(requestBody, null, 2));
          reject(error);
        });
    });
  };
}

/**
 * Recursively fetch all pages using nextPageToken pagination.
 */
async function fetchAllPages(nextPageToken = null) {
  const result = await getPageResult(nextPageToken)();
  
  // If there's a nextPageToken, fetch the next page
  if (result.nextPageToken) {
    await fetchAllPages(result.nextPageToken);
  }
}

console.time('Update data');
const lastUpdated = data.get('updated');

console.log(`Last Updated Time: ${lastUpdated ? new Date(lastUpdated).toISOString() : 'never'}`);
console.log(`Cache age: ${lastUpdated ? Math.round((Date.now() - lastUpdated) / 1000 / 60) : 'N/A'} minutes`);
console.log(`Max cache age: ${CACHE_REFRESH_MINS} minutes`);
const force = process.argv[2] === '--force';

if (!force && lastUpdated && Date.now() - lastUpdated < MAX_AGE) {
  console.log('Data in cache still valid. Skipping update.');
  console.timeEnd('Update data');
  return;
}

console.log(force ? 'Forced update requested.' : 'Cache is stale. Updating...');

// Start fetching all pages
fetchAllPages()
  .then(() => {
    end();
    console.timeEnd('Update data');
  })
  .catch((error) => {
    console.error('Failed to fetch issues:', error.message);
    console.timeEnd('Update data');
    process.exit(1);
  });
