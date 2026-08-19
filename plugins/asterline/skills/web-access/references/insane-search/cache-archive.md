# Cache & Archive

> Access cached/archived versions when the original site is blocked.
> Google Cache was discontinued in July 2024 — AMP cache and archive.today serve as replacements.

## Dependencies

None (curl only).

## 1. Google AMP Cache

Cached version of AMP-enabled sites. Effective for news/media sites.

```bash
# URL conversion: replace . in domain with - → cdn.ampproject.org
# Example: www.bbc.com → www-bbc-com.cdn.ampproject.org

python3 -c "
from urllib.parse import urlparse
url = '{URL}'
p = urlparse(url)
domain_sub = p.netloc.replace('.', '-')
print(f'https://{domain_sub}.cdn.ampproject.org/c/s/{p.netloc}{p.path}')
"

# Access with the converted URL
curl -sL "https://{domain-with-dashes}.cdn.ampproject.org/c/s/{netloc}{path}"
```

**Success condition**: Site serves AMP pages (most news/media)
**Failure condition**: Non-AMP sites, very recent content (cache delay ~15s)

## 2. archive.today

User-submitted archive. Particularly useful for paywalled articles and deleted content.
Multiple domains exist — if one is blocked, use another.

```bash
# Fetch the latest snapshot
curl -sL "https://archive.ph/newest/{URL}"

# Domain rotation (use another if one is blocked)
for domain in archive.ph archive.is archive.md archive.vn archive.li; do
  resp=$(curl -sL -o /dev/null -w "%{http_code}" "https://$domain/newest/{URL}")
  if [ "$resp" = "200" ] || [ "$resp" = "302" ]; then
    echo "Success: https://$domain/newest/{URL}"
    curl -sL "https://$domain/newest/{URL}"
    break
  fi
done
```

**Success condition**: Someone has previously archived the URL
**Failure condition**: URL has never been archived

## 3. Wayback Machine (Internet Archive)

```bash
# Check if a snapshot exists
curl -sL "https://archive.org/wayback/available?url={URL}"

# Access the latest snapshot
curl -sL "https://web.archive.org/web/{URL}"

# CDX API — fetch snapshot list
curl -sL "https://web.archive.org/cdx/search/cdx?url={URL}&output=json&fl=timestamp,statuscode&limit=5"
```

**Success condition**: Public URL that was a crawl target
**Failure condition**: Sites blocked by robots.txt, SPAs (not rendered), iframe-based sites

## 4. Google Cache (Discontinued)

> **Discontinued in July 2024.** `webcache.googleusercontent.com` no longer works.
> Use AMP cache or archive.today instead.

## Try Order

```
1. AMP cache (news/media sites → high success rate)
2. archive.today (paywalled/deleted content → reliable if archived)
3. Wayback Machine (old content → reliable if snapshot exists)
```
