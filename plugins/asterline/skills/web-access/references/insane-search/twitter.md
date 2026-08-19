# X/Twitter Access Strategy

> Auggie fetch is blocked with 402. Use the methods below to bypass it. None require API keys or authentication.

## Search (Tweet Discovery)

```python
WebSearch(query="site:x.com {search_term}")
```

WebSearch returns X posts as search results. You can obtain the title, snippet, and URL, but not the full tweet text or engagement metrics.

## Timeline Lookup — Syndication API

Provides the most recent ~100 tweets for a specific handle + engagement metrics (likes, RTs).

### Endpoint

```
https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}
```

### One-shot Script

```bash
curl -sL "https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}" | \
python3 -c "
import sys, json, re, html
content = sys.stdin.read()
match = re.search(r'__NEXT_DATA__.*?>(.*?)</script>', content)
if match:
    data = json.loads(match.group(1))
    for e in data['props']['pageProps']['timeline']['entries']:
        if e['type'] == 'tweet':
            t = e['content']['tweet']
            print(f\"@{t['user']['screen_name']} ({t.get('created_at','?')})\")
            print(f\"  {html.unescape(t.get('full_text',''))[:300]}\")
            print(f\"  Likes: {t.get('favorite_count',0)} | RTs: {t.get('retweet_count',0)}\")
            print('---')
"
```

### Available Data

| Field | Path | Example |
|------|------|------|
| Full tweet text | `tweet.full_text` | "Give your agent the..." |
| Author handle | `tweet.user.screen_name` | "openclaw" |
| Author name | `tweet.user.name` | "OpenClaw" |
| Like count | `tweet.favorite_count` | 1929 |
| RT count | `tweet.retweet_count` | 169 |
| Creation time | `tweet.created_at` | "Mon Apr 06 04:04:08 +0000 2026" |
| Tweet ID | `tweet.id_str` | "2041003999856406714" |
| Media URL | `tweet.entities.media[].media_url_https` | Image/video URL |

### Limitations

- Returns the most recent ~100 tweets (no pagination)
- Cannot access private accounts
- No search functionality (timeline only)
- **Low-follower/new accounts**: may return `hasResults: false`. In this case, oEmbed individual tweet access still works normally, so fall back to the "combination pattern".
- Unofficial endpoint — X may change or block it

## Individual Tweet Lookup — oEmbed API

Fetch the full text when you know the specific tweet URL.

### Endpoint

```
https://publish.twitter.com/oembed?url=https://x.com/{user}/status/{tweet_id}
```

### Usage

```bash
curl -sL "https://publish.twitter.com/oembed?url=https://x.com/{user}/status/{tweet_id}"
```

### Response (JSON)

| Field | Description |
|------|------|
| `author_name` | Author display name |
| `author_url` | Author profile URL |
| `html` | HTML blockquote containing the full tweet text |
| `url` | Original tweet URL |

## Combination Pattern (Search → Detail)

```
Step 1: WebSearch(query="site:x.com {keyword}") → obtain tweet URL
Step 2: curl oEmbed API → obtain full tweet text
```

## Methods That Fail (Do Not Use)

| Method | Result | Cause |
|------|------|------|
| Auggie fetch | 402 Payment Required | Auggie fetch restriction |
| Nitter | Empty response | Most Nitter instances are shut down |
| Wayback Machine | OG meta tags only | SPA not rendered |
| Mobile UA curl | OG meta tags only | SPA not rendered |
| RSS | No endpoint | X discontinued RSS support |
