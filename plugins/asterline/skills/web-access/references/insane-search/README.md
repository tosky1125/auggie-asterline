
# Insane Search

> Part of the Asterline **web-access** skill (Tier 1). Routing and tier-escalation live in [../../SKILL.md](../../SKILL.md).
> The engine package it drives is at [../../engine/](../../engine/), invoked from the skill directory as `python3 -m engine "<URL>"`.
> Deep-dives in this folder: TLS impersonation, Playwright routing, fallback, metadata, Jina, cache/archive, RSS, JSON/public APIs, Twitter, Naver, media.


> When URL access is blocked, it automatically selects a **site-agnostic** bypass strategy.

## Harness Rules (Directives Enforced on Auggie)

These rules are **reins** to prevent Auggie from going astray through improvised judgment. Violating them reproduces the kind of misjudgment seen in a previous test.md session: "break on chrome 200 → never try safari → give up because Playwright isn't installed."

**R1 — On detecting blocked/403/402 for a general web URL**:
1. **Do not attempt** Auggie fetch, improvised curl, or manual header assembly
2. Immediately run:
   ```bash
   python3 -m engine "<URL>" [--selector "<CSS>"] [--device auto|desktop|mobile] [--trace]
   ```
3. Make a decision after receiving exit code 0 (ok) or 1 (fail). Read the trace first to decide on retry.
4. Only on failure, re-invoke with `--trace --json` to diagnose the cause, then adjust `--device` or `user_hint`.

**R2 — Do not exit on the first 200**: HTTP 200 is a **condition to start validation**, not success. You may declare success only after passing `validate()`'s 4-layer verification. The CLI already enforces this.

**R3 — No bias**: Do not hardcode specific site domains, selectors, or brand names in `engine/**` or `waf_profiles.yaml`. `python3 engine/bias_check.py` is the CI gate. See the **No-Site-Name Rule** section for detailed rules.

**R4 — Hints at runtime only**: Site-specific information (success selectors, preferred Referer) must be passed only via CLI arguments or `user_hint`; never persist them in the repository.

**R5 — Phase 0 official APIs first**: Platforms with **officially public endpoints** (X/Reddit/YouTube/HN/arXiv, etc.) must check the Phase 0 table first and use that API. This is not bias; it is using an agreed-upon access path.

**R6 — Declare failure only after exhausting all attempts**: Only conclude "cannot break through" after running the **entire** grid (URL transforms × TLS impersonation × Referer × Playwright fallback). The CLI's default `max_attempts` of 12 guarantees this.
However, if the R7 condition (early WAF detection) is met, the engine grid keeps running while Auggie can **in parallel** attempt the MCP recon route. Whichever finishes first wins.

**R7 — API-first parallel branch on early WAF detection** (the branch decision is automatic but visible to the user in the results — which bypass path succeeded/failed is stated in the result metadata):
Trigger conditions (AND):
1. During early engine execution, the first 2–3 attempts all return `verdict=challenge`
2. `profile_used` is confirmed to be one of `akamai_bot_manager`, `cloudflare_turnstile`, `datadome_probable`, `perimeterx_human`, `f5_big_ip`, `aws_waf`
3. **The user request has a list/collection/iteration intent** (multiple pages, N or more items, "all", "crawl", pagination, etc.). A single-page body fetch does not qualify.

When all three conditions are true, Auggie starts **parallel paths**:

**Execution meaning of "parallel"** (clarified because Auggie tool calls are sequential):
- The engine is launched in the Bash tool with `run_in_background=true` — the grid keeps running without blocking
- Meanwhile, Auggie proceeds with the MCP Playwright recon route in the foreground
- It is fine if the engine succeeds first, and it is fine if the API obtained through MCP recon succeeds first. Whichever result comes first is adopted

**MCP recon route**:
1. Load the target page using the browser navigate capability actually provided in the current Auggie session
2. If a network-request capability is provided, collect the XHR/fetch call list and identify internal endpoints with `/api/`·`/graphql`·`\.json` filters
3. Re-invoke the identified JSON API URL with `python3 -m engine <API_URL>` (a separate call from the background engine). Most API layers have shallower WAF protection than the page HTML, so curl_cffi can collect them directly
4. After understanding the response schema, combine pagination / query parameters for iterative collection

**Why**: SPA + WAF sites (many shopping malls and commerce sites) often heavily invest in WAF for the marketing page (HTML) only, while the internal API uses only default gateway-level defense. **One MCP recon pass (5–10s) + one API re-invocation (0.5s)** is far more economical and has a higher success rate than wasting the entire HTML grid (50 attempts × 0.5s + Playwright fallback 40s ≈ 65s).

**When not to use R7**: Single-item fetches that only need to read one page body (one document, one blog post) are sufficient with the engine alone — trigger condition #3 excludes these.

**R7 bias prevention**: Internal API URLs and parameters must not be hardcoded in `engine/**`. Detected URLs are used only for runtime calls and are not persisted in the repository.

---

Core invariants of this skill:

- **Single entry point**: General web pages always go through `python3 -m engine <URL>` or `from engine import fetch; fetch(...)`.
- **No bias**: Do not hardcode specific sites in `engine/**` or `waf_profiles.yaml`.
- **Hints at runtime only**: Site-specific information goes through CLI / `user_hint`.

## Intent Classification (Before Entering Phase 0)

| User Input | Route |
|------------|-------|
| URL provided (`https://...`) | → Phase 0 check, then Phase 1 (generic fetch chain) if none found |
| Handle provided (`@username`) | → Phase 0 syndication/API |
| Keywords only ("search AI on X") | → WebSearch(`site:{domain} {keyword}`) first → re-enter after obtaining URL |

> **Korean new content limitation**: Keyword search for Naver/Daum/Korean communities is only possible via WebSearch, and indexing of new content may be delayed.

## Phase 0 — Platform Official API Index

> Only APIs/CLIs that platforms have **officially published** belong here. This is not bias; it is using agreed-upon endpoints.

### Social/Community Dedicated APIs

| Platform | Method | Details |
|----------|--------|---------|
| X/Twitter | syndication (timeline) + oEmbed (individual tweets) + keyword search: WebSearch → oEmbed | [twitter.md](twitter.md) |
| Reddit | URL + `.json` + Mobile UA | [json-api.md](json-api.md) |
| Bluesky | AT Protocol (`public.api.bsky.app/xrpc/...`) | [public-api.md](public-api.md) |
| Mastodon | Per-instance public API | [public-api.md](public-api.md) |
| Hacker News | Firebase API + Algolia Search | [json-api.md](json-api.md) |
| Stack Overflow | SE API v2.3 | [public-api.md](public-api.md) |
| Lobste.rs / V2EX / dev.to | Public JSON API | [json-api.md](json-api.md) |

### Media (CLI tool required)

| Platform | Method | Details |
|----------|--------|---------|
| YouTube/Vimeo/Twitch/TikTok/SoundCloud and 1,858 more | `yt-dlp --dump-json` | [media.md](media.md) |

### Academic/Registry

| Platform | Method | Details |
|----------|--------|---------|
| arXiv | Atom API | [public-api.md](public-api.md) |
| CrossRef | REST API | [public-api.md](public-api.md) |
| Wikipedia | REST API | [json-api.md](json-api.md) |
| OpenLibrary | JSON API | [public-api.md](public-api.md) |
| GitHub | gh CLI / REST API | [public-api.md](public-api.md) |
| npm / PyPI | Registry API | [json-api.md](json-api.md) |
| Wayback Machine | CDX API | [public-api.md](public-api.md) |

### Korea-Only Official APIs

| Platform | Method | Details |
|----------|--------|---------|
| Naver Search | `search.naver.com` (integrated/blog/news tab) | [naver.md](naver.md) |
| Naver Finance quotes | `api.finance.naver.com/siseJson.naver` (unofficial JSON) | [naver.md](naver.md) |

**All other sites are handled automatically by Phase 1 (generic fetch chain).**

## Phase 1 — Generic Fetch Chain

### Single Entry Point

```python
from insane_search.engine import fetch

result = fetch(
    "https://example.com/path",
    success_selectors=["article", "[class*='product-card']"],  # positive proof (optional)
    device_class="auto",      # "auto" | "desktop" | "mobile"
    user_hint=None,           # {"referer_strategy": "self_root", "impersonate_first": "safari"}
    timeout=25,
)

if result.ok:
    print(result.verdict)     # strong_ok | weak_ok
    html = result.content
else:
    # Phase 3 manual intervention (Playwright MCP) required — diagnose the cause with result.trace
    pass
```

### Internal Stages (Exposed for Debugging)

`fetch()` is a single API, but internally it is divided into phases. You can inspect each attempt in `result.trace`.

```
probe      — first attempt with curl_cffi + safari + self-referer
validate   — 4-layer verification (marker / size / cookie / success_selectors)
detect     — WAF product detection ([(profile_id, confidence)] ranking)
plan       — build the profile's tls_candidates × url_transforms × referer grid
execute    — exhaustively try the grid (does not exit on the first 200)
fallback   — capability-tag-based Playwright routing (MCP or local+chrome)
report     — FetchResult(ok, verdict, profile_used, trace, summary)
```

### Verification Principle

- HTTP 200 is a **condition to start validation**, not success.
- The success decision is a **4-layer AND**:
  1. No challenge markers (`sec-if-cpt-container`, `Access Denied`, `Just a moment...`, `DataDome`)
  2. Not abnormally small (< 3KB or WAF fingerprint size)
  3. Cookie sensor state normal (not `_abck=~-1~`)
  4. At least one of `success_selectors` matches (if provided by caller → `strong_ok`, if not provided → `weak_ok`)

### Grid Axes (profile recommends priority, grid tries exhaustively)

| Axis | Values | Notes |
|------|--------|-------|
| `url_transforms` | `original`, `mobile_subdomain` (`www.→m.`), `am_prefix`, `drop_www` | No site names, rules only |
| `tls_impersonate` | `safari`, `safari_ios`, `chrome99`, `chrome119`, `chrome131`, `chrome_android`, `firefox`... | Per-profile avoid list exists |
| `referer_strategy` | `self_root`, `google_search`, `none` | |

**device_class**:
- `"auto"` (default) — follows profile strategy
- `"desktop"` — desktop TLS only + `mobile_subdomain` disabled
- `"mobile"` — mobile TLS only + `mobile_subdomain` enabled

### Playwright Fallback (Capability-Matched)

`engine/executor.py` reads the profile's `capabilities_needed` and auto-selects the executor:

| Tag | Executor | When |
|-----|---------|------|
| `needs_real_tls_stack` + `needs_js_exec` | `playwright_real_chrome.js` (local Node) | Akamai Bot Manager, etc. — Chromium bundled TLS is detected |
| `needs_js_exec` only | Current Auggie session's browser connector (only if provided) | Cloudflare default defense, etc. |
| `needs_mobile_context` (+ real_tls) | `playwright_mobile_chrome.js` | Mobile device emulation required |

For detailed selection criteria: [playwright.md](playwright.md).

### Playwright MCP Invocation Rule

The `needs_js_exec only` case in `fetch_chain` is handled in the session only when a browser connector is actually provided in the current Auggie session. There is no subprocess path. That is:
1. If `result.summary` indicates that an Auggie browser connector is required
2. Handle it with the navigate → wait → snapshot flow of an available connector; if none is available, report that it is unsupported

## Phase 2 — Manual Intervention (Optional)

If Phase 1 returns `ok=False`, retry with a user hint:

```python
result = fetch(
    url,
    success_selectors=[...],
    user_hint={"impersonate_first": "safari_ios", "referer_strategy": "none"},
)
```

The hint applies **only to the current single call** and is not stored.

## Pre-installed Dependencies

Verify Tier 1 dependencies with `python3 -c "import curl_cffi, bs4, yaml"`. For the Local Chrome path, `node -e "require('playwright'); require('playwright-extra'); require('puppeteer-extra-plugin-stealth')"` must succeed. If either is missing, stop that path and ask the operator; Asterline does not perform installations.

## Quick Reference — Phase 0 Commands

```bash
# General web (Jina Reader — plain HTML only, ineffective on WAF sites)
curl -s "https://r.jina.ai/{URL}"

# yt-dlp — media metadata for 1,858 sites
yt-dlp --dump-json "URL"

# Reddit
curl -sL -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" \
  "https://www.reddit.com/r/{sub}/hot.json?limit=10"

# X/Twitter timeline
curl -sL "https://syndication.twitter.com/srv/timeline-profile/screen-name/{handle}"

# Hacker News
curl -sL "https://hacker-news.firebaseio.com/v0/topstories.json?limitToFirst=10&orderBy=%22%24key%22"

# YouTube subtitles
yt-dlp --write-sub --write-auto-sub --sub-lang "en,ko" --skip-download -o "/tmp/%(id)s" "URL"
```

## No-Site-Name Rule

Files in `engine/**`, `waf_profiles.yaml`, and `engine/templates/**` must **not hardcode specific site domains/URLs/selectors/brand names**.

### Prohibited

- Site-specific registry entries like `"coupang.com": {...}`
- Domain branching like `if "coupang" in url: ...`
- Hardcoding specific site names or empirical byte sizes in WAF profile `notes`

### Allowed

- Site name examples in **descriptive text** in `SKILL.md` / `references/*.md` (for reader understanding)
- `Phase 0` official API index (endpoints officially published by platforms)
- `observations/*.jsonl` logs (append-only observation data — does not affect code paths)
- `success_selectors` and `user_hint` provided by the caller (valid only for the current call)

### Boundary Case Judgment Criteria

> "Would this entry be generally valid for other sites using the same WAF?" → If YES, it goes in `waf_profiles.yaml`; if NO, it is a runtime hint.

### When a New Site Cannot Be Broken Through

1. First, check `result.trace` to see which phase failed
2. Retry once with the user's `user_hint`
3. If a repeated success pattern is observed, log it in `observations/` (no automatic recording yet — manual)
4. If confirmed 3+ times and **also valid for other sites using the same WAF**, tune the `tls_impersonate_candidates` / `url_transform_order` of the corresponding profile in `waf_profiles.yaml` (never include site names)
5. If it still does not work, consider a new WAF profile candidate (e.g., DataDome refinement, Kasada, etc.)

## Related Documents (references/) — When to Read What

This section is a **reference file selection guide**. Use it as a criterion for deciding which `references/*.md` to open when a problem arises. Auggie `Read`s the relevant file only when needed and does not proactively read all of them.

### A. Engine Extension & Diagnostics (Inside the Harness)

| File | When to Read | What It Covers |
|------|-------------|----------------|
| [`tls-impersonate.md`](tls-impersonate.md) | When the curl_cffi grid all ends in `challenge`/`blocked`, or when adding a new impersonation target to `waf_profiles.yaml` | How to replicate Safari/Chrome/Firefox TLS (JA3/JA4) fingerprints with curl_cffi, optimal target combinations per WAF (Akamai/Cloudflare/F5, etc.), impersonation target version list, empirical basis for `tls_impersonate_avoid` |
| [`playwright.md`](playwright.md) | When the engine falls back to Playwright and you need to determine whether to go to the Auggie connector or Local Chrome | Approach 1 (provided Auggie browser connector), Approach 2 (Local Node + `channel:'chrome'` + stealth), template parameter specs |
| [`fallback.md`](fallback.md) | When the `verdict` is ambiguous or you need to decide Phase transition timing | Engine's Phase 0→1→2→3 escalation principle, response success/failure judgment criteria details, termination conditions for each Phase |
| [`metadata.md`](metadata.md) | When you could not fetch the full body but need at least the essentials like title, summary, price, or author | OGP meta tag, JSON-LD (Schema.org), Twitter Card parsing, structured data extraction patterns |

### B. Lightweight Alternatives (Situations Where a Tool Other Than the Engine Is Better)

| File | When to Read | What It Covers |
|------|-------------|----------------|
| [`jina.md`](jina.md) | When you need clean markdown extraction from general web (blogs, news, Wiki) without WAF | `r.jina.ai/URL` one-liner for Puppeteer-based JS SPA rendering, markdown conversion, free 500 RPM, no API key required |
| [`cache-archive.md`](cache-archive.md) | When the original site is blocked but you need access via past snapshots at least | Wayback Machine CDX API, archive.today, AMP Cache (Google Cache ended 2024-07) |
| [`rss.md`](rss.md) | When you want to receive time-series updates from news, blogs, and communities in a structured way | RSS/Atom auto-discovery, feed parsing, no authentication required — the cleanest time-series data source |

### C. Platform-Specific Official/Public APIs (Linked to the Phase 0 Index)

| File | When to Read | What It Covers |
|------|-------------|----------------|
| [`json-api.md`](json-api.md) | Sites like Reddit/Wikipedia/HN/npm/PyPI that give JSON with **just a URL transformation** | Reddit `/json` suffix + Mobile UA, HN Firebase, Algolia Search, Wikipedia REST, npm/PyPI Registry API |
| [`public-api.md`](public-api.md) | When using official APIs for Bluesky/Mastodon/arXiv/Stack Overflow/CrossRef/GitHub/OpenLibrary/Wayback | Official public REST/AT/Atom API endpoints usable without authentication, request formats, common parameters |
| [`twitter.md`](twitter.md) | X/Twitter access — profile timeline, specific tweets, keyword search | `syndication.twitter.com` timeline, oEmbed individual tweets, search via WebSearch to obtain URL then oEmbed |
| [`naver.md`](naver.md) | Naver blog/news/finance/search access | Per-service bypass (blog uses `m.blog.naver.com` transform, finance uses unofficial JSON, search uses `search.naver.com`), Korean search query patterns |
| [`media.md`](media.md) | When you need media metadata, subtitles, or audio from YouTube/Vimeo/Twitch/TikTok/SoundCloud, etc. | `yt-dlp --dump-json`-based coverage of 1,858 sites, subtitle download (`--write-sub`), format selection, live/podcast |

### D. When Reading Engine Code Directly

| File | When to Read |
|------|-------------|
| `engine/fetch_chain.py` | Chain stage logic, `Attempt`/`FetchResult` schema check |
| `engine/validators.py` | 4-layer verification details (Verdict classification, challenge marker list) |
| `engine/waf_detector.py` | WAF ranking detection algorithm, `_LAST_LOAD_ERROR` handling |
| `engine/waf_profiles.yaml` | Per-profile detectors, tls_candidates, capabilities_needed |
| `engine/url_transforms.py` | When adding URL transform rules |
| `engine/executor.py` | Playwright MCP vs local capability matching logic |
| `engine/templates/*.js` | Playwright template tuning (warmup, reload, devices) |
| `engine/bias_check.py` | Bias linter rules — brand denylist, URL_PATTERN, excluded dirs |
