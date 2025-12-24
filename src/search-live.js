const axios = require('axios');
const alfred = require('./utils/alfred-simple');
const formatIssues = require('./utils/format-issues');
const Conf = require('conf');

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

// Initialize caches
const cachedData = new Conf({
  configName: 'jira-data',
  schema: {
    updated: { type: 'number' },
    items: { type: 'array', default: [] },
  },
  serialize: (value) => JSON.stringify(value),
});

const query = alfred.input.trim();

// Check if user wants to force search without base JQL (prefix with !)
const forceWithoutBaseJQL = query.startsWith('!');
const actualQuery = forceWithoutBaseJQL ? query.slice(1).trim() : query;

// If no query, show help
if (!actualQuery) {
  alfred.output([
    {
      title: 'Live Jira Search',
      subtitle: 'Type a ticket key (e.g., PROJ-123) or search term. Prefix with ! to search all projects.',
      valid: false,
      icon: {
        path: 'icon.png',
      },
    },
  ], {
    rerun: 0, // Don't auto-rerun
  });
  return;
}

const fields = [
  'key',
  'assignee',
  'summary',
  'project',
  'issuetype',
  'status',
  'updated',
].join(',');

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

/**
 * Build JQL query based on user input
 * @param {string} searchQuery - The user's search query (can include spaces)
 * @param {boolean} isExactKeySearch - If true, searches for exact key match only
 * @param {boolean} includeBaseJQL - If true, includes the base JQL in the query
 * @returns {string} - The complete JQL query with base JQL if configured
 */
function buildJQL(searchQuery, isExactKeySearch = false, includeBaseJQL = true) {
  const baseJQL = process.env.LIVE_SEARCH_BASE_JQL || '';
  const ticketKeyPattern = /^[A-Z]+-\d+$/i;
  
  let userJQL;
  
  // Check if it's a ticket key (no spaces, matches pattern)
  const isTicketKey = !searchQuery.includes(' ') && ticketKeyPattern.test(searchQuery);
  
  if (isExactKeySearch && isTicketKey) {
    // Exact key search (only if it looks like a valid ticket key)
    userJQL = `key = ${searchQuery.toUpperCase()}`;
  } else if (isExactKeySearch && !isTicketKey) {
    // Not a valid ticket key pattern, skip to text search
    // Return null to signal the caller to skip this stage
    return null;
  } else {
    // General text search - handle multi-word queries
    const escapedQuery = searchQuery.replace(/"/g, '\\"');
    
    // If query is short (< 3 chars) and no spaces, use key search only
    if (searchQuery.length < 3 && !searchQuery.includes(' ')) {
      userJQL = `key ~ "${escapedQuery}"`;
    } else {
      // For longer queries or queries with spaces, search in text fields
      // Split by spaces and create individual search terms for better results
      const terms = searchQuery.split(/\s+/).filter(t => t.length > 0);
      
      if (terms.length === 1) {
        // Single term
        userJQL = `(key ~ "${escapedQuery}" OR summary ~ "${escapedQuery}")`;
      } else {
        // Multiple terms - search for the full phrase in summary
        userJQL = `(key ~ "${escapedQuery}" OR summary ~ "${escapedQuery}")`;
      }
    }
  }
  
  // Combine with base JQL if it exists and is requested
  if (includeBaseJQL && baseJQL && baseJQL.trim()) {
    return `(${userJQL}) AND (${baseJQL})`;
  }
  
  // Add ORDER BY clause with configurable ordering (default to updated DESC)
  const orderBy = (process.env.JIRA_ORDER_BY || '').trim() || 'updated DESC';
  return `${userJQL} ORDER BY ${orderBy}`;
}

/**
 * Execute a search with the given JQL
 * @param {string} jql - The JQL query to execute
 * @returns {Promise<Array>} - Array of issues from the API
 */
async function executeSearch(jql) {
  console.error(`[DEBUG] Searching with JQL: ${jql}`);
  
  const response = await instance.post('search/jql', {
    jql,
    maxResults: 20,
    fields: fields.split(','),
  });
  
  return response.data.issues || [];
}

/**
 * Check if a ticket key exists in the cache
 * @param {string} ticketKey - The ticket key to check (e.g., "PROJ-123")
 * @returns {boolean} - True if ticket exists in cache
 */
function isTicketInCache(ticketKey) {
  const cachedItems = cachedData.get('items') || [];
  const upperKey = ticketKey.toUpperCase();
  
  // Check if any cached item has this ticket key
  return cachedItems.some(item => {
    if (!item.title) return false;
    // Extract the key from title format: "KEY – Summary text"
    const titleKey = item.title.split('–')[0]?.trim().toUpperCase();
    return titleKey === upperKey;
  });
}

/**
 * Filter out issues that already exist in the cache
 * @param {Array} issues - Array of issues from API
 * @returns {Array} - Filtered array with only new issues not in cache
 */
function filterCachedIssues(issues) {
  return issues.filter(issue => {
    const isInCache = isTicketInCache(issue.key);
    if (isInCache) {
      console.error(`[DEBUG] Filtering out ${issue.key} - already in cache`);
    }
    return !isInCache;
  });
}

/**
 * Search Jira API with three-stage strategy:
 * 1. If looks like ticket key: exact key match WITHOUT base JQL
 * 2. Otherwise: text search WITH base JQL (unless forced without)
 * 3. Only if cache has 0 new results AND Stage 2 returned 0 results: text search WITHOUT base JQL
 * 
 * Special: Prefix query with ! to force search WITHOUT base JQL immediately
 */
async function searchJira() {
  try {
    let issues = [];
    let searchedWithBaseJQL = false;
    const ticketKeyPattern = /^[A-Z]+-\d+$/i;
    const looksLikeTicketKey = !actualQuery.includes(' ') && ticketKeyPattern.test(actualQuery);
    
    // If user forced search without base JQL
    if (forceWithoutBaseJQL) {
      console.error(`[DEBUG] Force search without base JQL: "${actualQuery}"`);
      
      if (looksLikeTicketKey) {
        // Exact key search
        const exactKeyJQL = buildJQL(actualQuery, true, false);
        if (exactKeyJQL !== null) {
          issues = await executeSearch(exactKeyJQL);
          console.error(`[DEBUG] Forced exact key search (no base JQL): Found ${issues.length} issues`);
        }
      } else {
        // Text search without base JQL
        const textSearchJQL = buildJQL(actualQuery, false, false);
        if (textSearchJQL !== null) {
          issues = await executeSearch(textSearchJQL);
          console.error(`[DEBUG] Forced text search (no base JQL): Found ${issues.length} issues`);
        }
      }
    } else if (looksLikeTicketKey) {
      // Stage 1: Query looks like a ticket key - search exact key WITHOUT base JQL
      console.error(`[DEBUG] Query "${actualQuery}" looks like a ticket key`);
      const exactKeyJQL = buildJQL(actualQuery, true, false);
      if (exactKeyJQL !== null) {
        issues = await executeSearch(exactKeyJQL);
        console.error(`[DEBUG] Stage 1 (exact key without base JQL): Found ${issues.length} issues`);
      }
    } else {
      // Stage 2: Query doesn't look like a ticket key - search WITH base JQL
      console.error(`[DEBUG] Query "${actualQuery}" doesn't look like a ticket key, using text search with base JQL`);
      const textSearchWithBaseJQL = buildJQL(actualQuery, false, true);
      if (textSearchWithBaseJQL !== null) {
        issues = await executeSearch(textSearchWithBaseJQL);
        searchedWithBaseJQL = true;
        console.error(`[DEBUG] Stage 2 (text search with base JQL): Found ${issues.length} issues`);
      }
    }

    // Filter out issues that are already in the cache
    const newIssues = filterCachedIssues(issues);
    
    console.error(`[DEBUG] API returned ${issues.length} issues, ${newIssues.length} are new (not in cache)`);

    // Stage 3: Only search without base JQL if:
    // - We searched with base JQL (Stage 2) AND got 0 results
    // - AND filtering cache gave us 0 new results
    // - AND user didn't force without base JQL (already did that)
    if (!forceWithoutBaseJQL && searchedWithBaseJQL && issues.length === 0 && newIssues.length === 0) {
      console.error(`[DEBUG] No results with base JQL and nothing new in cache, trying without base JQL...`);
      const textSearchWithoutBaseJQL = buildJQL(actualQuery, false, false);
      if (textSearchWithoutBaseJQL !== null) {
        issues = await executeSearch(textSearchWithoutBaseJQL);
        console.error(`[DEBUG] Stage 3 (text search without base JQL): Found ${issues.length} issues`);
        // Filter Stage 3 results against cache
        const newIssuesStage3 = filterCachedIssues(issues);
        console.error(`[DEBUG] Stage 3 returned ${issues.length} issues, ${newIssuesStage3.length} are new`);
        
        if (newIssuesStage3.length > 0) {
          const formattedIssues = formatIssues(newIssuesStage3);
          alfred.output(formattedIssues, {
            rerun: 0,
          });
          return;
        }
      }
    }

    // If we have new issues from Stage 1 or 2, show them
    if (newIssues.length > 0) {
      const formattedIssues = formatIssues(newIssues);
      alfred.output(formattedIssues, {
            rerun: 0,
          });
      return;
    }

    // All results are in cache or no results at all
    if (issues.length > 0) {
      // All results in cache - return empty results (no output)
      alfred.output([], {
        rerun: 0,
      });
    } else {
      alfred.output([
        {
          title: `No issues found for "${actualQuery}"`,
          subtitle: 'Press ⏎ to search in Jira web interface',
          arg: `https://${process.env.JIRA_DOMAIN}.atlassian.net/secure/QuickSearch.jspa?searchString=${encodeURIComponent(actualQuery)}`,
          icon: {
            path: 'icon.png',
          },
        },
      ], {
        rerun: 0,
      });
    }
  } catch (error) {
    console.error(`[DEBUG] Error details:`, error.response?.data || error.message);
    
    const errorMessage = error.response?.data?.errorMessages?.[0] 
      || error.response?.data?.errors 
      || error.message;
    
    alfred.output([
      {
        title: 'Failed to search Jira',
        subtitle: typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage),
        valid: false,
        icon: {
          path: alfred.icons.error,
        },
        text: {
          copy: JSON.stringify(error.response?.data || error.message, null, 2),
          largetype: JSON.stringify(error.response?.data || error.message, null, 2),
        },
      },
    ], {
      rerun: 0, // Don't auto-rerun on errors
    });
  }
}

// Execute search
searchJira();

