# Alfred Jira Lookup

Alfred workflow to quickly search through your Jira issues; It keeps a local cache for instant results, as well as looking up Jira in the background for live results. 

This workflow is originally a fork of [alfred-jira-search](https://github.com/titouanmathis/alfred-jira-search) by [titouanmathis](https://github.com/titouanmathis), that I modified, enhanced, and skimmed to my needs. 

## How Search Works

The workflow combines local caching with live Jira API queries:

1. **Instant Results**: Displays cached issues immediately as you type.
  2. Cache is updated in the background on trigger every 5 minutes (configurable) or manually via `ju`.
3. **Live Search**: Three-stage approach:
   - **Stage 1**: If search is an exact ticket key (e.g., `PROJ-123`) search for it explicitly.
   - **Stage 2**: If search is not an exact ticket key, search for it using the base JQL filter (if configured).
   - **Stage 3**: If Stage 2 returns nothing, search across Jira as whole ().
4. **Force Search**: Prefix with `!` to bypass staged search (e.g., `!bug fix`).

## How I use it

1. I configured `CACHE_QUERY` to cache my assigned issues, and tickets of ALL projects I am involved in for the last 365 days.
2. I configured `LIVE_SEARCH_BASE_JQL` to search for issues assigned to me, or in projects I am involved in but without date filtering to make it more broad, in-case I am looking for a very old ticket.

These two parameters confine the search to projects i am involved in which improves the accuracy of fuzzy search. The action will still fallback to jira broad search if needed.


## Configuration

You will be asked to configure the workflow with the following values :

- The name of your Jira organization (`JIRA_DOMAIN` in `https://JIRA_DOMAIN.atlassian.net`) 
- Your Jira username which usually is your email in `JIRA_USERNAME`,
- A Jira API token (create one at [https://id.atlassian.com/manage/api-tokens](https://id.atlassian.com/manage/api-tokens)).

### Optional Parameters

You can configure these optional environment variables to customize the workflow behavior:

| Parameter | Description | Default | Example |
|-----------|-------------|---------|---------|
| `CACHE_QUERY` | JQL query that determines which issues are cached locally | `(assignee = currentUser() AND (created >= -300d OR updated >= "-52w"))` | `project = "PROJ" AND status != Done` |
| `CACHE_REFRESH_MINS` | How often (in minutes) the cache is automatically refreshed | `5` | `10` |
| `LIVE_SEARCH_BASE_JQL` | Base JQL filter applied to live search queries (Stage 2) | `(assignee = currentUser())` | `project IN ("PROJ1", "PROJ2")` |
| `JIRA_ORDER_BY` | Sort order for search results | `updated DESC` | `priority DESC, updated DESC` |

## Usage

| Command | Action |
|-|-|
| `j` | Display a list of unresolved issues sorted by their last updated date. The list is filtered by Alfred. |
| `ju` | Force update the local data |

