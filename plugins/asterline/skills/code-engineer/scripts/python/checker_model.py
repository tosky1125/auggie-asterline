from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

EXCLUDED_DIRS: Final = frozenset({
    ".git", ".hg", ".svn", ".venv", "venv", "env", ".env",
    "__pycache__", ".tox", ".nox", "dist", "build", ".eggs",
    ".ruff_cache", ".mypy_cache", ".pytest_cache", ".basedpyright",
    "node_modules",
})

SUPPRESSION_RE: Final = re.compile(r"#\s*(type|pyright)\s*:\s*ignore\b")
ANYIO_OK_RE: Final = re.compile(r"#\s*noqa:\s*ANYIO_OK\b")
PANDAS_OK_RE: Final = re.compile(r"#\s*noqa:\s*PANDAS_OK\b")

BANNED_IMPORTS: Final = {
    "asyncio": (
        "no-asyncio",
        ANYIO_OK_RE,
        "import asyncio - use anyio (opt out: trailing `# noqa: ANYIO_OK`)",
    ),
    "pandas": (
        "no-pandas",
        PANDAS_OK_RE,
        "import pandas - use polars (opt out: trailing `# noqa: PANDAS_OK`)",
    ),
}

MUTABLE_OK_RE: Final = re.compile(r"#\s*noqa:\s*MUTABLE_OK")
SLOTS_OK_RE: Final = re.compile(r"#\s*noqa:\s*SLOTS_OK")
DICT_OK_RE: Final = re.compile(r"#\s*noqa:\s*DICT_OK")
MATCH_OK_RE: Final = re.compile(r"#\s*noqa:\s*MATCH_OK")
GENERIC_ERR_OK_RE: Final = re.compile(r"#\s*noqa:\s*GENERIC_ERR_OK")
OBJECT_OK_RE: Final = re.compile(r"#\s*noqa:\s*OBJECT_OK")
IF_VARIANT_OK_RE: Final = re.compile(r"#\s*noqa:\s*IF_VARIANT_OK")
SIZE_OK_RE: Final = re.compile(r"#\s*noqa:\s*SIZE_OK")
BROAD_EXCEPT_OK_RE: Final = re.compile(r"#\s*noqa:\s*BROAD_EXCEPT_OK")

PURE_LOC_LIMIT: Final = 250


@dataclass(frozen=True, slots=True)
class Violation:
    rule: str
    file: Path
    line: int
    col: int
    message: str

    def render(self) -> str:
        return f"{self.file}:{self.line}:{self.col}: [{self.rule}] {self.message}"
