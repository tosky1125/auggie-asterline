from __future__ import annotations

from typing import TypedDict

VERSION = "0.1.0"
DEFAULT_TIMEOUT_S = 300

LANGUAGES: dict[str, list[str]] = {
    "bash": [".bash", ".sh", ".zsh"],
    "c": [".c", ".h"],
    "cpp": [".cc", ".cpp", ".cxx", ".hpp", ".hxx"],
    "csharp": [".cs"],
    "css": [".css"],
    "elixir": [".ex", ".exs"],
    "go": [".go"],
    "haskell": [".hs"],
    "html": [".html", ".htm"],
    "java": [".java"],
    "javascript": [".js", ".jsx", ".cjs", ".mjs"],
    "json": [".json"],
    "kotlin": [".kt", ".kts"],
    "lua": [".lua"],
    "nix": [".nix"],
    "php": [".php"],
    "python": [".py", ".pyi"],
    "ruby": [".rb"],
    "rust": [".rs"],
    "scala": [".scala"],
    "solidity": [".sol"],
    "swift": [".swift"],
    "typescript": [".ts", ".cts", ".mts"],
    "tsx": [".tsx"],
    "yaml": [".yml", ".yaml"],
}

LANG_ALIASES: dict[str, str] = {
    "js": "javascript",
    "jsx": "javascript",
    "ts": "typescript",
    "py": "python",
    "py3": "python",
    "rb": "ruby",
    "rs": "rust",
    "kt": "kotlin",
    "ex": "elixir",
    "hs": "haskell",
    "sh": "bash",
    "zsh": "bash",
    "cc": "cpp",
    "c++": "cpp",
    "cxx": "cpp",
    "cs": "csharp",
    "yml": "yaml",
    "sol": "solidity",
    "golang": "go",
}


class AstGrepPosition(TypedDict, total=False):
    line: int
    column: int


class AstGrepRange(TypedDict, total=False):
    start: AstGrepPosition
    end: AstGrepPosition


class AstGrepRequiredMatch(TypedDict):
    file: str


class AstGrepMatch(AstGrepRequiredMatch, total=False):
    range: AstGrepRange
    text: str
    replacement: str
