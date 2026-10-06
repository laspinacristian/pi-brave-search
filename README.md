# pi-brave-search

A `brave_search` tool for the [Pi coding agent](https://pi.dev), backed by the [Brave Search API](https://brave.com/search/api/).

```bash
pi install git:github.com/laspinacristian/pi-brave-search
```

Web searches use the [LLM Context API](https://api-dashboard.search.brave.com/documentation/services/llm-context): for each source, it returns the passages most relevant to the query, already extracted from the page, within a token budget. One request usually answers the question without opening any page.

| `type` | Endpoint | Result |
|---|---|---|
| `web` (default) | LLM Context | Relevant passages from each source |
| `news` | News Search | Recent articles, with outlet and age |

Queries accept Brave's [search operators](https://api-dashboard.search.brave.com/documentation/resources/search-operators): `"exact phrase"`, `-term`, `site:`, `filetype:`, `intitle:`, `lang:`, `OR`. Requests rejected by the per-second rate limit are retried after the window resets.

## Parameters

| Name | Description |
|---|---|
| `query` | Search query |
| `type` | `web` or `news`. Default: `web` |
| `tokens` | `web` only: size of the result, 1024–32768. Default: 4096 |
| `count` | Maximum number of results. Default: 20 for `web`, 10 for `news` |
| `freshness` | `pd`, `pw`, `pm`, `py`, or a range such as `2025-01-01to2025-06-30` |
| `country` | Two-letter country code. Default: US |
| `language` | Language of the results. Default: `en` |
| `sites` | Restrict the search to these domains |

## Configuration

Set `BRAVE_API_KEY` (or `BRAVE_SEARCH_API_KEY`) in the environment Pi runs in. The "Free AI" plan, created at the [Brave Search API dashboard](https://api-dashboard.search.brave.com), includes every endpoint above.

To read a page or a video transcript found by a search, see [pi-web-fetch](https://github.com/laspinacristian/pi-web-fetch).

## Development

```bash
npm install
npm run check   # type check
npm test        # offline tests
```

## License

[MIT](LICENSE)
