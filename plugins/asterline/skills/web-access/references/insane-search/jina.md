# Universal Web Extraction — Jina Reader

> Convert nearly any public URL to markdown with a single `r.jina.ai/URL` call.
> Puppeteer-based real browser rendering — handles JS SPAs too.
> **No API key required. Free: 500 RPM.**

## Basic Usage

```bash
curl -s "https://r.jina.ai/{URL}"
```

## Advanced Features

### JSON Structured Output

```bash
curl -H "Accept: application/json" "https://r.jina.ai/{URL}"
```

Returns: `data.{title, description, url, content, metadata, external, usage}`

**Key point**: You can **auto-discover** a site's **RSS URL** from `external.alternate`.

### CSS Selector Targeting

```bash
curl -H "X-Target-Selector: .article-body" "https://r.jina.ai/{URL}"
```

Removes navigation/footer and extracts only the body content. Especially effective on community boards.

### SPA Streaming Mode

```bash
curl -H "Accept: text/event-stream" "https://r.jina.ai/{URL}"
```

Waits until JS loading completes. Returns the fully rendered final version with all dynamic content.

### Screenshot

```bash
curl -H "X-Respond-With: screenshot" "https://r.jina.ai/{URL}"
```

Returns a GCS signed URL (valid for 4 hours). For visual verification purposes.

### PDF Handling

```bash
curl -s "https://r.jina.ai/https://example.com/file.pdf"
```

PDF → markdown auto-conversion. Includes page count metadata.

### Cookie Forwarding (Authenticated Sites)

```bash
curl -H "X-Set-Cookie: session=abc123" "https://r.jina.ai/{URL}"
```

### Link Preservation

```bash
curl -H "X-With-Links: true" "https://r.jina.ai/{URL}"
```

### Cache Control

```bash
# Bypass cache (when real-time data is needed)
curl -H "X-No-Cache: true" "https://r.jina.ai/{URL}"

# Set cache TTL (seconds)
curl -H "X-Cache-Tolerance: 600" "https://r.jina.ai/{URL}"
```

### Plain Text / Raw HTML

```bash
# body.innerText only
curl -H "X-Respond-With: text" "https://r.jina.ai/{URL}"

# Raw HTML
curl -H "X-Respond-With: html" "https://r.jina.ai/{URL}"
```

## Verified Successful Sites

| Site | Result | Notes |
|--------|------|------|
| Threads | Success | Profile + posts |
| Clien | Success | Post list + body |
| Ruliweb | Success | Post list + body |
| Ppomppu | Success | Posts + RSS also available |
| Naver News | Success | Article list + full body |
| Naver Finance | Success | Real-time stock prices |
| Geeknews | Success | Topic list + body |
| 44bits | Success | Article list |
| Careerly | Success | Extracted via JS rendering |
| Brunch | Success | Full article text |
| Hankyung (Hankyung.com) | Success | News articles |
| Daum News | Success | News articles |
| Medium | Success | Full article text (excluding paywall) |
| Substack | Success | Full newsletter text |
| dev.to | Success | Full article text |
| PDF (any URL) | Success | Auto-conversion |

## Failing Sites

| Site | Reason |
|--------|------|
| X/Twitter | 402 — Use Syndication/oEmbed (see twitter.md) |
| Reddit | Blocked — Use JSON API (see json-api.md) |
| DC Inside | Returns empty body |
| FM Korea | HTTP 430 |
| YozmIT | CloudFront 403 |
| Naver Shopping | CAPTCHA |
| Coupang | WAF block |


## RSS Auto-Discovery

The site's RSS URL is automatically exposed in `external.alternate` via Jina's JSON mode:

```bash
curl -H "Accept: application/json" "https://r.jina.ai/{URL}" | \
python3 -c "import sys,json; print(json.load(sys.stdin)['data'].get('external',{}))"
```
