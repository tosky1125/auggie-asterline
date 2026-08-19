# Playwright — Auggie connector vs Local Chrome

> Two approaches for JS-rendered / JS-challenge sites. **The `capabilities_needed`
> tag in the WAF profile determines the choice.** No manual selection needed.

## Two-approach summary

| Approach | Executor | TLS stack | Suitable WAFs | Limitations |
|----------|----------|-----------|---------------|-------------|
| **1. Auggie connector** | Browser tools actually provided in the current session | Depends on connector implementation | Basic Cloudflare, CAPTCHA-free SPAs, weak JS-challenge sites | Unusable if tools are absent or the TLS stack cannot be chosen |
| **2. Local Node + `channel:'chrome'`** | `engine/templates/playwright_real_chrome.js` | System-installed real Chrome | Akamai Bot Manager, PerimeterX, hardened DataDome configs | Requires Node + Chrome system installation |

`engine/executor.py` reads the profile tags and auto-routes, so you do not need to be aware of this choice outside the skill.

## Approach 1 — Auggie browser connector

### Availability

Use only when the current Auggie session's tool list actually contains browser capabilities corresponding to navigate, wait, and snapshot. Asterline does not add connectors or packages at runtime.

### Basic workflow

```
1. browser_navigate → URL
2. browser_wait_for → main content selector (mandatory for SPAs)
3. browser_snapshot    (accessibility tree — token-efficient)
   or
   browser_evaluate    (extract data from a specific selector)
   or
   browser_run_code    (scroll/pagination)
```

### Per-tool usage

| Tool | Use |
|------|-----|
| `browser_snapshot` | Returns the accessibility tree — structures text + interactive elements. Fastest and most token-efficient |
| `browser_evaluate` | JS evaluation, e.g. `() => document.querySelector(...).innerText` |
| `browser_run_code` | `async ({ page }) => {...}` full automation — infinite scroll, multi-step interaction |
| `browser_network_requests` | XHR/fetch call list — **for discovering real API endpoints behind a WAF** (→ call directly with curl_cffi) |
| `browser_console_messages` | JS errors/logs |

### Caveats

- Depending on the connector's Chromium/TLS implementation, Akamai/DataDome may return a **293-byte Access Denied** page or an immediate 403.
- In that case `engine/executor.py` handles automatic fallback to Approach 2. No manual selection needed.

## Approach 2 — Local Node + Real Chrome

### Operator readiness check

```bash
node -v
node -e "require('playwright'); require('playwright-extra'); require('puppeteer-extra-plugin-stealth')"
```

### Invocation (inside the engine)

```python
from insane_search.engine.executor import run_playwright_fallback

attempt, html = run_playwright_fallback(
    "https://example.com/path",
    profile_id="akamai_bot_manager",
    success_selectors=["article"],
    device_class="desktop",   # "desktop" | "mobile" | "auto"
)
```

Internally it runs `engine/templates/playwright_real_chrome.js` or `playwright_mobile_chrome.js` under Node and returns the HTML. The templates accept **only URL and selector parameters** and contain no per-site branching.

### Desktop template (`playwright_real_chrome.js`)

```js
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const ctx = await chromium.launchPersistentContext(profileDir, {
  channel: 'chrome',        // ← key: real Chrome, not bundled Chromium
  headless: false,          // Akamai detects headless. headful required.
  viewport: { width: 1366, height: 900 },
});
```

### Mobile template (`playwright_mobile_chrome.js`)

```js
const { chromium, devices } = require('playwright-extra');
const iPhone = devices['iPhone 13 Pro'];

const ctx = await chromium.launchPersistentContext(profileDir, {
  channel: 'chrome',          // TLS stays real Chrome
  ...iPhone,                  // UA/viewport/isMobile/hasTouch injected automatically
  headless: false,
});
```

**Note**: The `channel:'chrome'` + `devices[...]` combination keeps the TLS fingerprint as Chrome while changing only the HTTP layer (UA/viewport) to mobile. WAFs often treat it leniently because they see real Chrome.

## Selection rules (automatic)

The `capabilities_needed` tag in `engine/waf_profiles.yaml` decides:

| Tag combination | Selected executor | Representative case |
|-----------------|-------------------|---------------------|
| `needs_real_tls_stack` + `needs_js_exec` | Approach 2 (real_chrome) | Akamai Bot Manager |
| `needs_js_exec` only | Approach 1 (Auggie connector, only if available) | Cloudflare Turnstile |
| `needs_real_tls_stack` only | Approach 2 (real_chrome) | Some DataDome configs |
| Neither | Resolved in the curl chain. Playwright not used. | F5 BIG-IP (only TLS bypass needed) |

When `device_class="mobile"` is specified, real_chrome swaps to the mobile variant.

## Common validation

Both approaches re-validate the final HTML with `engine/validators.py:validate()`. So even if Playwright retrieves HTML, **a challenge page or empty SPA still yields a CHALLENGE verdict.** This automatically leads to the next combination or a failure report.

## Debugging tips

- Keep `profileDir` at a fixed path so sessions and cookies persist, speeding up retries (`/tmp/.insane_pw_profile`)
- If Akamai retries are frequent, delete `profileDir` to reset to a fresh state
- On failure, the `error` field in `result.trace` contains the first 200 chars of Node stderr

## Site examples (for reader understanding, not a code-branching basis)

> This section is **for explanation** and is not reflected in `engine/**` code.

- **Basic Cloudflare challenge**: Approach 1 (Auggie connector) may be sufficient
- **Akamai Bot Manager**: Approach 2 required. A generic connector may be detected due to TLS-UA mismatch
- **SSR blog platforms**: Receive HTML with curl_cffi safari alone. Playwright unnecessary
- **Search-result JS-rendered SPA**: Approach 1 with `browser_wait_for` then `browser_snapshot`

Actual routing is decided by the profile tags. The examples above are illustrative only and are not used as a code-branching basis.
