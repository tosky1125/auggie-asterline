# Naver Service Access Strategy

> Each Naver service requires a different access method. Blogs use mobile URLs, News/Finance use Jina Reader.

## Naver Blog

Auggie fetch is blocked. Access via mobile URL conversion + iPhone UA.

```bash
# blog.naver.com/{ID}/{NO} → m.blog.naver.com conversion
curl -sL \
  -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  -H "Accept-Language: ko-KR,ko;q=0.9" \
  -H "Referer: https://m.naver.com/" \
  "https://m.blog.naver.com/PostView.naver?blogId={ID}&logNo={NO}"
```

RSS is also available (latest 50 posts, ~300 characters of body text):
```bash
curl -sL "https://rss.blog.naver.com/{BLOG_ID}.xml"
```

## Naver News

Fully accessible via Jina Reader.

```bash
# Article list
curl -s "https://r.jina.ai/https://news.naver.com/"

# Individual article
curl -s "https://r.jina.ai/https://n.news.naver.com/article/{press_id}/{article_id}"
```

## Naver Finance (Stocks)

Access real-time stock prices and major news via Jina Reader.

```bash
curl -s "https://r.jina.ai/https://finance.naver.com/item/main.naver?code={종목코드}"
```

## Naver Finance Quotes (Unofficial, No Auth)

No authentication required. Returns stock price time-series data as JSON.

```bash
# Daily quotes (Samsung Electronics=005930)
curl -sL "https://api.finance.naver.com/siseJson.naver?symbol=005930&requestType=1&startTime=20240101&endTime=20241231&timeframe=day"

# Minute quotes
curl -sL "https://api.finance.naver.com/siseJson.naver?symbol=005930&requestType=0&timeframe=minute&count=200"
```

Response: `[[date, open, high, low, close, volume, foreign_trade_ratio], ...]`

## Naver Search (Direct Access via Identity Spoofing)

curl_cffi + session cookie warming allows direct crawling of Naver search results. No API key required.

```python
from curl_cffi import requests
from urllib.parse import quote

s = requests.Session(impersonate="chrome124")
s.headers.update({
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": "https://www.google.com/",
})
s.get("https://www.naver.com/", timeout=10)  # cookie warming
s.headers["Referer"] = "https://www.naver.com/"

# Unified search (blog+news+web mixed)
r = s.get(f"https://search.naver.com/search.naver?query={quote('검색어')}")

# Blog tab
r = s.get(f"https://search.naver.com/search.naver?where=post&query={quote('검색어')}")

# News tab
r = s.get(f"https://search.naver.com/search.naver?where=news&query={quote('검색어')}")
```

### Extractable Data

| Tab | URL Pattern | Extracted |
|---|---|---|
| Unified | `search.naver?query=` | Blog URLs, external links, news |
| Blog | `where=post&query=` | blog.naver.com URLs, titles, snippets |
| News | `where=news&query=` | n.news.naver.com URLs, titles |

### Key Path for Korean Keyword Search

WebSearch lags in indexing new Korean content, but Naver search is optimized for Korean.
**For Korean site keyword search → direct Naver search access is the most accurate and fastest.**

## Naver Cafe

Login + iframe double barrier. Direct content access is not possible.
Attempt Phases 1~3 in the fallback chain, but end with "authentication required" when login/paywall is detected.

## Naver TV

Access via yt-dlp (see media.md).

```bash
yt-dlp --dump-json "https://tv.naver.com/v/{video_id}"
```
