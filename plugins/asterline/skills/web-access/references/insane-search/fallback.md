# On Access Failure — Adaptive Scheduler

> Run when the index method fails or for sites not in the index.
> Escalate in order: Phase 0 → 1 → 2 → 3. Terminate immediately upon success at any Phase.

## Principles

1. **Exclude no method in advance** — you only know if it works by trying
2. **If a dependency is missing, install it and try** — do not skip because it is not installed
3. **Phase transitions are signal-based** — escalate according to failure type
4. **Result adoption criteria**: accuracy/reliability > freshness > completeness > structuredness > cost

---

## Phase 0: Special Endpoints (Index Matching)

If the site is in the index, try its dedicated method **first**.
Best accuracy and cost, so it takes priority over generic Phase 1.

Success → terminate / Failure → Phase 1

---

## Phase 1: Lightweight Probes (Parallel)

**Try first** (simultaneously):
- Auggie's default fetch tool
- Jina Reader (default / JSON / SPA modes)
- curl Chrome Desktop UA

**If still no success, also try**:
- curl mobile UA + mobile URL (`m.{domain}`)
- curl Googlebot UA
- URL variants: `.json`, `/rss`, `/feed`

**Sidecar** (in parallel with the first round, low-trust):
- Google AMP cache
- archive.today
- Wayback Machine
→ **If any original succeeds, the sidecar is for reference only.** Adopt the sidecar only if all originals fail (provenance tagging required)

**Also extract metadata from every response**: OGP, JSON-LD — see [metadata.md](metadata.md)

Details: [jina.md](jina.md), [cache-archive.md](cache-archive.md), [rss.md](rss.md)

---

## Escalation Signals

Phase 1 → Phase 2 transition conditions:

| Signal | Detection method | Meaning |
|------|-----------|------|
| HTTP 403/430 | Status code | WAF/bot block |
| HTTP 429/503 | Status code | Rate limit (short jitter retry first, escalate on failure) |
| WAF headers | `cf-ray`, `server: cloudflare`, `x-datadome` | Cloudflare/Akamai/DataDome |
| WAF cookies | `__cf_bm`, `_abck`, `datadome` | WAF session |
| Challenge body | `captcha`, `verify`, `enable javascript`, `check your browser` | JS challenge |
| Empty SPA | No content other than `<div id="root"></div>`, under 200 chars | JS rendering required |
| Redirect loop | 302/307 three or more times | Challenge redirect |

**On login/paywall detection**: focus on `login`, `sign in`, `로그인`, `subscribe`, `구독` → escalating to Phase 2/3 does not help. **Terminate with "authentication required."**

---

## Phase 2: TLS Impersonation (curl_cffi)

**Condition**: WAF/bot block signal detected in Phase 1

**Ensure dependency**:
```bash
python3 -c "import curl_cffi"  # if missing, ask the operator; this skill does not install it
```
If the dependency is missing → go straight to Phase 3.

**Sequential multi-target attempt**: safari → chrome → firefox

```python
from curl_cffi import requests

TARGETS = ["safari", "chrome", "firefox"]
HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
    "Referer": "https://www.google.com/",
}

for target in TARGETS:
    try:
        session = requests.Session(impersonate=target)
        session.headers.update(HEADERS)
        resp = session.get("{URL}", timeout=20)
        if resp.status_code == 200 and len(resp.text) > 300:
            # Success — also extract JSON-LD
            break
    except:
        continue
```

Success → terminate / Failure or JS challenge → Phase 3

Details: [tls-impersonate.md](tls-impersonate.md)

---

## Phase 3: Auggie browser connector (browser)

**Condition**: Phase 2 also fails, or JS challenge/CAPTCHA detected

```
browser_navigate → {URL}
browser_wait_for → "body" (3 seconds)
browser_evaluate → () => document.body.innerText  (Light Mode — first)
if needed browser_snapshot → full accessibility tree
```

**API discovery**: use `browser_network_requests` to find a hidden JSON API, which can then be reused via curl_cffi.

Details: [playwright.md](playwright.md)

---

## Response Validation

| Verdict | Condition | Result |
|------|------|------|
| **Success** | Length appropriate for content type + topic-relevant keywords | Adopt |
| **Partial success** | OG meta/JSON-LD only (no body) | Auxiliary source |
| **Failure — auth** | login/paywall detected | Terminate with "authentication required" |
| **Failure — challenge** | CAPTCHA/JS challenge | Next Phase |
| **Failure — error** | 4xx/5xx | Next Phase |
| **Failure — empty SPA** | No content | Next Phase |

**Content length criteria** (flexible):
- Article/blog: 500 chars or more
- Product page: success if JSON-LD present
- Tweet/short post: 100 chars or more
- Profile: success if JSON-LD Person present

## False-Positive Markers (HTTP 200 but failure)

| Pattern | Detection method | Handling |
|------|----------|------|
| X SPA shell (247KB) | 200 OK + `Sign in to X` or `hasResults: false` | Failure — WebSearch+oEmbed fallback |
| CAPTCHA page | 200 OK + `captcha\|recaptcha\|hcaptcha\|cf-turnstile` | Failure — next Phase |
| Soft paywall | 200 OK + `member-only\|subscribe to read\|구독하세요` | Partial success — adopt meta only |
| DDG soft rate limit | 202 Accepted + body under 15KB | Failure — fallback to another engine |
| Empty JSON | 200 OK + `hasResults.*false\|"entries":\s*\[\]` | Failure — try another method |
| Region block | 200 OK + `not available in your region\|geo-restricted` | Failure — report "region block" |
| WAF soft block | 200 OK + `checking your browser\|verify you are human` | Failure — escalate to Phase 2/3 |
| Akamai behavioral | 200 OK + `behavioral-content\|sec-if-cpt` + `_abck` cookie | Failure — JS execution required → go directly to Phase 3 (changing TLS target is meaningless) |
| RSS Content-Type error | RSS expected + `text/html` response | Failure — "RSS not supported" |
| Error JSON | 200 OK + JSON `"error"` key present | Failure — log error content |

## When All Fail

1. Record the Phases tried and each failure signal
2. If a sidecar result exists, adopt it with provenance tagging
3. If no sidecar either, report failure to the user and share the attempt results
