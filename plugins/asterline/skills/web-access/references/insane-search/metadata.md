# Metadata Extraction — OGP / JSON-LD / Schema.org

> A supplementary technique for extracting structured data when HTML is received.
> Even when the full body cannot be retrieved, core information such as title, summary, price, and profile can be obtained.

## Dependencies

None (curl + python3 standard modules).

## OGP (Open Graph Protocol) Meta Tags

Most sites insert these for social sharing. Title + description + image can be obtained.

```bash
curl -sL -H "User-Agent: Mozilla/5.0 ..." "{URL}" | \
  python3 -c "
import sys, re
html = sys.stdin.read()
for m in re.findall(r'<meta property=\"og:(\w+)\" content=\"([^\"]*?)\"', html):
    print(f'og:{m[0]} = {m[1]}')
for m in re.findall(r'<meta name=\"description\" content=\"([^\"]*?)\"', html):
    print(f'description = {m}')
"
```

## JSON-LD (Schema.org Structured Data)

**The most valuable extraction target.** Structured information such as products, articles, and profiles is contained as JSON.

```bash
curl -sL "{URL}" | \
  python3 -c "
import sys, re, json
html = sys.stdin.read()
blocks = re.findall(r'<script type=\"application/ld\+json\">(.*?)</script>', html, re.DOTALL)
for b in blocks:
    try:
        data = json.loads(b)
        print(json.dumps(data, ensure_ascii=False, indent=2))
    except:
        pass
"
```

### Real Examples

**Coupang Search Results** — `CollectionPage` + `ItemList`:
```json
{
  "@type": "CollectionPage",
  "mainEntity": {
    "@type": "ItemList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "item": {
          "@type": "Product",
          "name": "...",
          "offers": { "price": 29900 }
        }
      }
    ]
  }
}
```

**LinkedIn Profile** — `Person`:
```json
{
  "@type": "Person",
  "name": "...",
  "jobTitle": "...",
  "alumniOf": [
    { "@type": "Organization", "name": "..." }
  ]
}
```

**News Article** — `NewsArticle`:
```json
{
  "@type": "NewsArticle",
  "headline": "...",
  "datePublished": "2026-04-16",
  "author": { "name": "..." },
  "articleBody": "..."
}
```

## Next.js RSC Payload (YojeumIT, etc.)

Next.js App Router sites include content in the `self.__next_f.push()` script.

```bash
curl -sL "{URL}" | \
  python3 -c "
import sys, re
html = sys.stdin.read()
chunks = re.findall(r'self\.__next_f\.push\(\[1,\"(.*?)\"\]\)', html)
text = ''.join(chunks)
# Extract Korean text (decode unicode escapes)
decoded = text.encode().decode('unicode_escape', errors='ignore')
print(decoded[:3000])
"
```

## When to Use

Metadata extraction is **not a standalone method but a supplementary technique**.
Run it alongside any phase where HTML is received:

- Phase 1: Receive HTML via curl → also extract JSON-LD
- Phase 2: Receive HTML via curl_cffi → also extract JSON-LD
- Phase 3: Receive DOM via Playwright → extract JSON-LD via `browser_evaluate`

Even if the body cannot be retrieved, **product prices, article summaries, and profile information** can be obtained from JSON-LD.
