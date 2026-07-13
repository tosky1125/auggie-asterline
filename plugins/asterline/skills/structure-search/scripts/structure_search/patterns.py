from __future__ import annotations

import re
import sys
from typing import Optional

from .constants import LANG_ALIASES, LANGUAGES
from .runtime import err

REGEX_ANTIPATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"\\w|\\d|\\s|\\b"),
        "Backslash escapes (\\w, \\d, \\s, \\b) are regex syntax, not ast-grep. "
        "Use $VAR to capture any identifier, or switch to grep for text patterns.",
    ),
    (
        re.compile(r"(?<!\$)\.\*|(?<!\$)\.\+"),
        "'.*' and '.+' are regex wildcards, not ast-grep. "
        "Use $$$ between AST fragments to match many nodes, or $VAR for one node.",
    ),
    (
        re.compile(r"\[[a-zA-Z0-9-]+\]"),
        "Character classes like '[a-z]' are regex syntax. "
        "ast-grep has no AST equivalent - use grep for character-level patterns.",
    ),
]


def find_alternation(pattern: str) -> bool:
    stripped = re.sub(r"'[^']*'|\"[^\"]*\"|`[^`]*`", "", pattern)
    return bool(re.search(r"\w\s*\|\s*\w", stripped)) and "||" not in stripped


def lang_specific_hints(pattern: str, lang: Optional[str]) -> list[str]:
    if not lang:
        return []
    canonical = LANG_ALIASES.get(lang.lower(), lang.lower())
    hints: list[str] = []
    if canonical == "python" and re.search(r"^\s*(def|class)\s+\$?\w+[^:]*:\s*$", pattern, re.MULTILINE):
        hints.append(
            "Python pattern has trailing ':'. ast-grep parses pattern as a complete "
            "definition - drop the trailing colon. Try: 'def $FUNC($$$)' or 'class $C($$$)'."
        )
    if canonical in ("javascript", "typescript", "tsx") and re.search(
        r"^\s*(async\s+)?function\s+\$?\w+\s*$", pattern
    ):
        hints.append(
            "JS/TS function pattern is incomplete. Add params and body: "
            "'function $NAME($$$) { $$$ }'."
        )
    if canonical == "go" and re.search(r"^\s*func\s+\$?\w+\s*$", pattern):
        hints.append(
            "Go function pattern is incomplete. Add params and body: "
            "'func $NAME($$$) { $$$ }'."
        )
    if canonical == "rust" and re.search(r"^\s*fn\s+\$?\w+\s*$", pattern):
        hints.append(
            "Rust fn pattern is incomplete. Add params, return type, and body: "
            "'fn $NAME($$$) -> $RET { $$$ }' (or '-> ()' if returning unit)."
        )
    return hints


def validate_pattern(pattern: str, lang: Optional[str]) -> list[str]:
    hints = [message for regex, message in REGEX_ANTIPATTERNS if regex.search(pattern)]
    if find_alternation(pattern):
        hints.append(
            "Literal '|' alternation is regex syntax, not ast-grep. "
            "Run two separate ast-grep calls (one per alternative), or switch to grep."
        )
    hints.extend(lang_specific_hints(pattern, lang))
    return hints


def normalize_lang(lang: Optional[str]) -> Optional[str]:
    if not lang:
        return None
    canonical = LANG_ALIASES.get(lang.lower(), lang.lower())
    if canonical not in LANGUAGES:
        err(f"unknown language '{lang}'. Run 'ast_grep_helper.py langs' for the full list.")
        sys.exit(1)
    return canonical
