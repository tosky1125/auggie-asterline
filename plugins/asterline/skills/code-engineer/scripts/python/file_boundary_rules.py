from __future__ import annotations

import ast
from pathlib import Path
from typing import Final

from scripts.python.checker_model import (
    BROAD_EXCEPT_OK_RE,
    PURE_LOC_LIMIT,
    SIZE_OK_RE,
    Violation,
)

BROAD_EXCEPTIONS: Final = frozenset({"Exception", "BaseException"})


def find_broad_except_violations(
    tree: ast.Module,
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler) or node.type is None:
            continue
        if isinstance(node.type, ast.Name):  # noqa: IF_VARIANT_OK - filtering an open AST
            exception_name = node.type.id if node.type.id in BROAD_EXCEPTIONS else None
        elif isinstance(node.type, ast.Attribute):
            exception_name = node.type.attr if node.type.attr in BROAD_EXCEPTIONS else None
        else:
            exception_name = None
        if exception_name is None:
            continue
        line = source_lines[node.lineno - 1] if node.lineno <= len(source_lines) else ""
        if BROAD_EXCEPT_OK_RE.search(line):
            continue
        violations.append(Violation(
            rule="broad-except",
            file=file,
            line=node.lineno,
            col=node.col_offset + 1,
            message=f"`except {exception_name}` is too broad — catch the specific exception you expect",
        ))
    return violations


def find_oversized_module_violations(
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    if any(SIZE_OK_RE.search(line) for line in source_lines[:10]):
        return []
    pure_loc = sum(
        1
        for line in source_lines
        if line.strip() and not line.strip().startswith("#")
    )
    if pure_loc <= PURE_LOC_LIMIT:
        return []
    return [Violation(
        rule="oversized-module",
        file=file,
        line=1,
        col=1,
        message=f"{pure_loc} pure LOC (limit: {PURE_LOC_LIMIT}) — split by responsibility",
    )]
