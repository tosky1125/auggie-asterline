# Playwright — Auggie connector vs Local Chrome

> JS 렌더링 / JS 챌린지 사이트를 위한 두 가지 접근. **WAF 프로파일의
> `capabilities_needed` 태그가 선택을 결정**한다. 사용자가 직접 고를 필요 없다.

## 두 Approach 요약

| Approach | 실행기 | TLS 스택 | 적합 WAF | 한계 |
|----------|--------|----------|----------|------|
| **1. Auggie connector** | 현재 세션에 실제 제공된 브라우저 도구 | 커넥터 구현에 따름 | Cloudflare 기본, CAPTCHA 없는 SPA, JS 챌린지 약한 사이트 | 도구가 없거나 TLS 스택을 선택할 수 없으면 사용 불가 |
| **2. Local Node + `channel:'chrome'`** | `engine/templates/playwright_real_chrome.js` | 시스템 설치 실제 Chrome | Akamai Bot Manager, PerimeterX, DataDome 강화 설정 | Node + Chrome 시스템 설치 필요 |

`engine/executor.py`가 프로파일 태그를 보고 자동 라우팅하므로, 이 선택을 스킬 외부에서 의식할 필요는 없다.

## Approach 1 — Auggie browser connector

### 가용성

현재 Auggie 세션의 도구 목록에 navigate, wait, snapshot에 해당하는 브라우저 기능이 실제로 있을 때만 사용한다. Asterline은 커넥터나 패키지를 런타임에 추가하지 않는다.

### 기본 워크플로

```
1. browser_navigate → URL
2. browser_wait_for → 메인 콘텐츠 셀렉터 (SPA는 필수)
3. browser_snapshot    (접근성 트리 — 토큰 효율)
   또는
   browser_evaluate    (특정 셀렉터 데이터 추출)
   또는
   browser_run_code    (스크롤/페이지네이션)
```

### 도구별 용도

| 도구 | 용도 |
|------|------|
| `browser_snapshot` | 접근성 트리 반환 — 텍스트+인터랙티브 요소 구조화. 가장 빠르고 토큰 효율적 |
| `browser_evaluate` | `() => document.querySelector(...).innerText` 등 JS 평가 |
| `browser_run_code` | `async ({ page }) => {...}` 풀 자동화 — 무한 스크롤, 다단계 인터랙션 |
| `browser_network_requests` | XHR/fetch 호출 목록 — **WAF 뒤 진짜 API 엔드포인트 발견용** (→ curl_cffi로 직접 호출) |
| `browser_console_messages` | JS 에러/로그 |

### 주의

- 커넥터의 Chromium/TLS 구현에 따라 Akamai/DataDome은 **293 바이트 Access Denied** 또는 즉시 403을 반환할 수 있다.
- 이 경우 자동으로 Approach 2로 이관되도록 `engine/executor.py`가 처리. 수동 선택 불필요.

## Approach 2 — Local Node + Real Chrome

### 운영자 준비 상태 확인

```bash
node -v
node -e "require('playwright'); require('playwright-extra'); require('puppeteer-extra-plugin-stealth')"
```

### 호출 (engine 내부)

```python
from insane_search.engine.executor import run_playwright_fallback

attempt, html = run_playwright_fallback(
    "https://example.com/path",
    profile_id="akamai_bot_manager",
    success_selectors=["article"],
    device_class="desktop",   # "desktop" | "mobile" | "auto"
)
```

내부에서 `engine/templates/playwright_real_chrome.js` 또는 `playwright_mobile_chrome.js`를 Node로 실행하고 HTML을 받아온다. 템플릿은 **URL과 셀렉터 파라미터만** 받으며 사이트별 분기가 없다.

### 데스크톱 템플릿 (`playwright_real_chrome.js`)

```js
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const ctx = await chromium.launchPersistentContext(profileDir, {
  channel: 'chrome',        // ← 핵심: 번들 Chromium 아닌 실제 Chrome
  headless: false,          // Akamai는 headless 탐지. headful 필요.
  viewport: { width: 1366, height: 900 },
});
```

### 모바일 템플릿 (`playwright_mobile_chrome.js`)

```js
const { chromium, devices } = require('playwright-extra');
const iPhone = devices['iPhone 13 Pro'];

const ctx = await chromium.launchPersistentContext(profileDir, {
  channel: 'chrome',          // TLS는 실제 Chrome
  ...iPhone,                  // UA/viewport/isMobile/hasTouch 자동 주입
  headless: false,
});
```

**주의**: `channel:'chrome'` + `devices[...]` 조합은 TLS 핑거프린트를 Chrome으로 유지하면서 HTTP 레이어(UA/viewport)만 모바일로 바꾼다. WAF가 실제 Chrome으로 인식해서 관대한 경우가 많다.

## 선택 규칙 (자동)

`engine/waf_profiles.yaml`의 `capabilities_needed` 태그가 결정한다:

| 태그 조합 | 선택 실행기 | 대표 케이스 |
|----------|-------------|-------------|
| `needs_real_tls_stack` + `needs_js_exec` | Approach 2 (real_chrome) | Akamai Bot Manager |
| `needs_js_exec` only | Approach 1 (Auggie connector, 있을 때만) | Cloudflare Turnstile |
| `needs_real_tls_stack` only | Approach 2 (real_chrome) | 일부 DataDome 설정 |
| 둘 다 없음 | curl 체인에서 해결. Playwright 안 씀 | F5 BIG-IP (TLS만 우회 필요) |

`device_class="mobile"`이 지정되면 real_chrome → mobile 변종으로 swap.

## 공통 검증

두 Approach 모두 최종 HTML을 `engine/validators.py:validate()`로 재검증한다. 즉 Playwright가 HTML을 받아와도 **챌린지 페이지 또는 빈 SPA면 여전히 CHALLENGE 판정**. 자동으로 다음 조합이나 failure 보고로 이어진다.

## 디버깅 팁

- `profileDir`를 고정 경로로 두면 세션·쿠키가 유지되어 재시도 빠름 (`/tmp/.insane_pw_profile`)
- Akamai 재시도가 잦으면 `profileDir`를 삭제해 fresh 상태로 리셋
- 실패 시 `result.trace`의 `error` 필드에 Node stderr 200자가 포함됨

## 사이트 예시 (독자 이해용, 코드 분기 근거 아님)

> 이 섹션은 **설명 목적**이며 `engine/**` 코드에는 반영되지 않는다.

- **Cloudflare 기본 챌린지**: Approach 1 (Auggie connector)로 충분할 수 있음
- **Akamai Bot Manager**: Approach 2 필수. 일반 커넥터는 TLS-UA 불일치가 탐지될 수 있음
- **SSR 블로그 플랫폼**: curl_cffi safari만으로 HTML 수신. Playwright 불필요
- **검색 결과 JS 렌더링 SPA**: Approach 1로 `browser_wait_for` 후 `browser_snapshot`

실제 라우팅은 프로파일 태그가 결정한다. 위 예시는 참고일 뿐 코드 분기 근거로 쓰지 않는다.
