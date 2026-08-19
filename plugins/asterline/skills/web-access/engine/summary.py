from __future__ import annotations

from typing import Optional

from .result_schema import Attempt
from .validators import Verdict


_R7_ELIGIBLE_PROFILES = frozenset({
    "akamai_bot_manager",
    "cloudflare_turnstile",
    "datadome_probable",
    "perimeterx_human",
    "f5_big_ip",
    "aws_waf",
})

R7_HINT = (
    "R7 API-first recommendation: WAF is blocking HTML routes. "
    "Use Playwright MCP → browser_navigate → browser_network_requests "
    "→ filter `/api/`·`/graphql`·`\\.json` to detect internal endpoints → "
    "re-invoke that URL via `python3 -m engine <API_URL>`. Most API layers "
    "have weaker WAF protection and can be collected with curl_cffi alone."
)


def format_summary(trace: list[Attempt], profile: Optional[str]) -> str:
    n = len(trace)
    verdicts = [a.verdict for a in trace]
    challenge_count = sum(1 for v in verdicts if v == Verdict.CHALLENGE.value)
    base = (
        f"failed after {n} attempts; profile={profile}; "
        f"verdicts={','.join(v for v in verdicts[:5])}" + ("..." if n > 5 else "")
    )
    if profile in _R7_ELIGIBLE_PROFILES and challenge_count >= 3:
        return base + "\n" + R7_HINT
    return base
