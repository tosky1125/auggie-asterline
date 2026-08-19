# TLS Impersonation — curl_cffi

> The core method for bypassing TLS fingerprint (JA3/JA4) based WAFs.
> Plain curl/requests use an OpenSSL fingerprint and get blocked immediately,
> but curl_cffi replicates the TLS fingerprint of a real browser (Chrome/Safari/Firefox).

## Dependencies

Check readiness with `python3 -c "import curl_cffi"`. If it is missing, abort this path and request the operator to install it; the skill does not install it directly.

## Multi-target Sequential Attempt

If one impersonate target fails, retry with another target.
**Attempt order: safari → chrome → firefox**

```python
from curl_cffi import requests

TARGETS = ["safari", "chrome", "firefox"]
HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.google.com/",
}

def cffi_fetch(url, locale="ko-KR"):
    """Multi-target sequential attempt + identity camouflage. Returns (response, target) on success."""
    from urllib.parse import urlparse
    origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    for target in TARGETS:
        try:
            session = requests.Session(impersonate=target)
            session.headers.update(HEADERS)
            session.headers["Accept-Language"] = f"{locale},{locale.split('-')[0]};q=0.9"
            session.headers["Referer"] = "https://www.google.com/"
            # Identity camouflage: homepage cookie warm-up → Referer chain
            try:
                session.get(origin, timeout=10)
            except Exception:
                pass  # Try the main request even if the homepage fails
            session.headers["Referer"] = origin
            resp = session.get(url, timeout=20)
            # Detect JS-required site → remaining target attempts are pointless
            if "behavioral-content" in resp.text or "sec-if-cpt" in resp.text:
                return None, None  # → Phase 3 Playwright
            if resp.status_code == 200 and len(resp.text) > 500:
                return resp, target
        except Exception:
            continue
    return None, None
```

## Impersonation Target List (v0.15.0)

A generic alias always resolves to the latest version. **In 2026, old versions like chrome99 raise WAF suspicion, so using generic aliases is recommended.**

| Alias | Resolution (2026.04) | Use case |
|-------|---------------|------|
| `safari` | safari260 | **Best for Korean sites** (Coupang, FM Korea) |
| `chrome` | chrome146 | General purpose (Cloudflare, Akamai) |
| `firefox` | firefox135 | Alternative when chrome/safari fails |
| `chrome_android` | chrome131_android | Mobile API endpoints |
| `safari_ios` | safari260_ios | iOS mobile |

<details>
<summary>All pinned versions (click)</summary>

```
chrome99, chrome100, chrome101, chrome104, chrome107, chrome110,
chrome116, chrome119, chrome120, chrome123, chrome124, chrome131,
chrome133a, chrome136, chrome142, chrome145, chrome146,
chrome131_android, edge99, edge101,
safari15_3, safari15_5, safari17_0, safari17_2_ios,
safari18_0, safari18_0_ios, safari260, safari260_ios,
firefox133, firefox135
```

</details>

## Optimal Strategy per WAF

| WAF | Optimal target | Additional condition | Success rate |
|-----|-----------|-----------|--------|
| F5 BIG-IP (Coupang) | `safari` | `Referer: https://www.coupang.com/` | ~70% |
| Cloudflare (TLS only) | `chrome` | Add Sec-Fetch-* headers | ~80% |
| Akamai | `chrome` | Use residential proxy in parallel | 80-90% |
| AWS WAF | `chrome` | — | ~80% |
| CloudFront (YojeumIT) | Not needed | Plain curl + Chrome UA is sufficient | 100% |

## Sessions and Cookies

```python
from curl_cffi import requests

# Maintain session (automatic cookie management)
session = requests.Session(impersonate="safari")

# Obtain session cookies with the first request
session.get("https://www.coupang.com/")

# Cookies are automatically forwarded on subsequent requests
resp = session.get("https://www.coupang.com/np/search?q=키보드")
```

## Combo: nodriver/FlareSolverr → curl_cffi

For JS challenge sites, obtain cookies with a browser, then process at high speed with curl_cffi:

```python
# 1. Obtain cf_clearance cookie with nodriver
import nodriver as uc
browser = await uc.start(headless=True)
page = await browser.get("https://cf-protected-site.com")
await page.cf_verify()
cookies = await browser.cookies.get_all()

# 2. Pass cookies to a curl_cffi Session
from curl_cffi import requests
session = requests.Session(impersonate="chrome")
for c in cookies:
    session.cookies.set(c["name"], c["value"])
resp = session.get("https://cf-protected-site.com/api/data")
```

## Async

```python
import asyncio
from curl_cffi.requests import AsyncSession

async def fetch_many(urls):
    async with AsyncSession(impersonate="chrome") as session:
        tasks = [session.get(url) for url in urls]
        return await asyncio.gather(*tasks)
```

## HTTP/3 (v0.15.0+)

```python
from curl_cffi import requests
from curl_cffi.const import CurlHttpVersion

resp = requests.get(
    "https://www.cloudflare.com/",
    impersonate="chrome",
    http_version=CurlHttpVersion.V3,
)
```

WAF vendors do not yet actively utilize HTTP/3 fingerprints, so the bypass effect is high.

## Alternative Libraries

Alternatives when curl_cffi fails:

| Library | Operator setup target | Characteristics |
|-----------|------|------|
| primp | `primp` | Rust-based, up to Firefox 148, high performance |
| wreq/rnet | `wreq` | Rust-based, 100+ device profiles |
| tls-client2 | `tls-client2` | Go-based fork, synchronous only |

```python
# primp example
import primp
client = primp.Client(impersonate="chrome_146")
resp = client.get("https://example.com")
```

## What curl_cffi Cannot Bypass

| Defense mechanism | curl_cffi | Response |
|-----------|-----------|------|
| TLS/JA3 fingerprint | Bypassable | Core feature |
| HTTP/2 SETTINGS fingerprint | Bypassable | Included in impersonate |
| HTTP/3 QUIC fingerprint | Bypassable (v0.15+) | New |
| JS challenge (Turnstile etc.) | **Not possible** | → nodriver or Playwright |
| CAPTCHA | **Not possible** | → 2captcha/CapSolver |
| IP reputation (datacenter) | **Not possible** | → Proxy/VPN |
| Behavioral analysis (mouse/timing) | **Not possible** | → Real browser |

Sites with JS challenges are handed off to → [playwright.md](playwright.md).
