#!/usr/bin/env python3

# ─── How to run ───
# 1. Provision Python Playwright, Chrome, and the Node lighthouse package outside
#    this plugin according to your organization's dependency policy.
# 2. Check readiness without launching a browser:
#      python3 lighthouse-audit.py --check-environment
# 3. Run an audit:
#      python3 lighthouse-audit.py https://example.com
#      python3 lighthouse-audit.py https://example.com --desktop-only
# ──────────────────

"""Run Lighthouse through operator-provisioned Playwright and real Chrome.

The helper is intentionally install-free. It diagnoses missing prerequisites and
never invokes a package manager, downloads a browser, or mutates the environment.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import subprocess
import tempfile
from collections.abc import Sequence
from pathlib import Path

LIGHTHOUSE_RUNNER_JS = """\
const lighthouse = require('lighthouse');

const url = process.argv[2];
const port = parseInt(process.argv[3], 10);
const preset = process.argv[4];
const config = {
  extends: 'lighthouse:default',
  settings: {
    formFactor: preset === 'desktop' ? 'desktop' : 'mobile',
    throttling: preset === 'desktop'
      ? { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 }
      : undefined,
    screenEmulation: preset === 'desktop'
      ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 }
      : undefined,
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },
};

(async () => {
  const result = await lighthouse(url, { port, logLevel: 'error' }, config);
  const output = {};
  for (const [key, category] of Object.entries(result.lhr.categories)) {
    output[key] = Math.round(category.score * 100);
  }
  console.log(JSON.stringify(output));
})();
"""


class LighthouseExecutionError(RuntimeError):
    detail: str

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


def _node_lighthouse_available() -> bool:
    if shutil.which("node") is None:
        return False
    result = subprocess.run(
        ["node", "-e", "require('lighthouse')"],
        capture_output=True,
        check=False,
        text=True,
    )
    return result.returncode == 0


def _chrome_available() -> bool:
    names = ("google-chrome", "google-chrome-stable", "chrome", "chrome.exe")
    return any(shutil.which(name) is not None for name in names)


def _environment_status() -> tuple[bool, bool, bool]:
    playwright = importlib.util.find_spec("playwright") is not None
    return playwright, _node_lighthouse_available(), _chrome_available()


def _print_environment_status() -> None:
    playwright, lighthouse, chrome = _environment_status()
    print("Browser audit environment (local preflight)")
    print(f"- Python Playwright: {'ready' if playwright else 'missing'}")
    print(f"- Node Lighthouse: {'ready' if lighthouse else 'missing'}")
    print(f"- System Chrome: {'ready' if chrome else 'missing'}")
    print("No packages were installed and no browser was launched.")


def _run_lighthouse_via_cdp(url: str, cdp_port: int, preset: str) -> dict[str, int]:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as handle:
        handle.write(LIGHTHOUSE_RUNNER_JS)
        runner_path = Path(handle.name)

    try:
        result = subprocess.run(
            ["node", str(runner_path), url, str(cdp_port), preset],
            capture_output=True,
            check=False,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            raise LighthouseExecutionError(f"Lighthouse failed: {result.stderr.strip()}")
        decoded = json.loads(result.stdout)
        if not isinstance(decoded, dict) or not all(
            isinstance(key, str) and isinstance(value, int)
            for key, value in decoded.items()
        ):
            raise LighthouseExecutionError("Lighthouse returned an invalid score object")
        return decoded
    finally:
        runner_path.unlink(missing_ok=True)


def _run_with_playwright(url: str, preset: str) -> dict[str, int]:
    playwright_api = importlib.import_module("playwright.sync_api")

    with playwright_api.sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            channel="chrome",
            headless=True,
            args=["--remote-debugging-port=0"],
        )
        websocket = browser._impl_obj._connection._transport._ws_url  # noqa: SLF001
        port = int(websocket.split(":", 2)[2].split("/", 1)[0])
        try:
            return _run_lighthouse_via_cdp(url, port, preset)
        finally:
            browser.close()


def _print_scores(scores: dict[str, int], preset: str, threshold: int) -> bool:
    print(f"Lighthouse — {preset}")
    for category, score in scores.items():
        status = "PASS" if score >= threshold else "FAIL"
        print(f"- {category}: {score} {status}")
    return all(score >= threshold for score in scores.values())


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("url", nargs="?", help="URL to audit")
    parser.add_argument("--threshold", "-t", type=int, default=100)
    parser.add_argument("--desktop-only", action="store_true")
    parser.add_argument("--mobile-only", action="store_true")
    parser.add_argument("--check-environment", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.check_environment:
        _print_environment_status()
        return 0
    if args.url is None:
        _parser().error("url is required unless --check-environment is used")

    playwright, lighthouse, chrome = _environment_status()
    if not all((playwright, lighthouse, chrome)):
        _print_environment_status()
        print("Provision missing prerequisites outside Asterline, then rerun the audit.")
        return 2

    presets = ("desktop",) if args.desktop_only else ("mobile",) if args.mobile_only else ("mobile", "desktop")
    passed = True
    for preset in presets:
        print(f"Auditing ({preset}): {args.url}")
        passed = _print_scores(
            _run_with_playwright(args.url, preset),
            preset,
            args.threshold,
        ) and passed
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
