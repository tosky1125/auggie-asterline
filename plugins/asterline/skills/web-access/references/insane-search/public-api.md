# Direct Public API Calls

> Public APIs that return structured data without authentication.
> Official APIs, not web scraping — stable and accurate.

## Bluesky (AT Protocol)

Profiles and feeds are fully public. Search is blocked with 403.

```bash
# Profile
curl -sL "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={handle}" | \
python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"displayName\"]} — Followers: {d[\"followersCount\"]}, Posts: {d[\"postsCount\"]}')"

# Feed (recent posts)
curl -sL "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor={handle}&limit=10"
```

Rate limit: ~3,000 req/hour

## Mastodon

Varies by instance. mastodon.social blocks the public timeline; hachyderm.io/fosstodon.org and others allow it.

```bash
# Account lookup
curl -sL "https://{instance}/api/v1/accounts/lookup?acct={username}"

# Account timeline (after obtaining ID)
curl -sL "https://{instance}/api/v1/accounts/{id}/statuses?limit=10"

# Hashtag timeline (authentication required depending on instance)
curl -sL "https://hachyderm.io/api/v1/timelines/tag/{tag}?limit=10"
```

## Stack Exchange (v2.3)

```bash
# Question search
curl -sL "https://api.stackexchange.com/2.3/search?order=desc&sort=votes&intitle={query}&site=stackoverflow"

# Tag-based
curl -sL "https://api.stackexchange.com/2.3/questions?tagged={tag1};{tag2}&site=stackoverflow&pagesize=5"

# Include answers (when body text is needed)
curl -sL "https://api.stackexchange.com/2.3/questions/{id}/answers?order=desc&sort=votes&site=stackoverflow&filter=withbody"
```

Rate limit: 300 req/day unauthenticated (per IP)

## arXiv (Academic Papers)

```bash
# Paper search (ti=title, au=author, abs=abstract, cat=category)
curl -sL "http://export.arxiv.org/api/query?search_query=ti:{query}&max_results=5&sortBy=submittedDate&sortOrder=descending"
```

**Note**: 3 req/second limit. A 1-second sleep between requests is required.
Categories: cs.AI, cs.CL, cs.LG, cs.CV, etc.

## CrossRef (DOI / Peer-Reviewed Papers)

```bash
# Paper search
curl -sL "https://api.crossref.org/works?query={query}&filter=from-pub-date:2025-01&rows=5&sort=relevance"

# Lookup by DOI
curl -sL "https://api.crossref.org/works/{DOI}"
```

Rate limit: 50 req/second. Adding an email to the User-Agent enters the Polite Pool.

## OpenLibrary (Books)

```bash
# ISBN lookup
curl -sL "https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&jscmd=data&format=json"

# Book search
curl -sL "https://openlibrary.org/search.json?q={query}&limit=5"
```

## Wayback Machine (Archive)

```bash
# Check snapshot
curl -sL "https://archive.org/wayback/available?url={URL}"

# CDX API (snapshot list)
curl -sL "https://web.archive.org/cdx/search/cdx?url={URL}&output=json&fl=timestamp,statuscode&limit=5"
```

## GitHub REST API (when gh CLI is unavailable)

60 req/hour unauthenticated. Using gh CLI is recommended first.

```bash
# Repository search
curl -sL "https://api.github.com/search/repositories?q={query}&sort=stars&per_page=5"

# Releases
curl -sL "https://api.github.com/repos/{owner}/{repo}/releases?per_page=5"

# Code search
curl -sL "https://api.github.com/search/code?q={query}+language:python&per_page=5"
```

## Rate Limit Summary

| API | Unauthenticated | Notes |
|-----|-------|------|
| Bluesky | ~3K/hr | Search 403 |
| Mastodon | Per instance | |
| Stack Exchange | 300/day | 10K with auth |
| arXiv | 3/sec | sleep required |
| CrossRef | 50/sec | |
| OpenLibrary | Unlimited | |
| Wayback | Unlimited | |
| GitHub REST | 60/hr | gh CLI preferred |
