#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Check Python files for no-excuse violations.

Usage:
  check-no-excuse-rules.py <file-or-dir>...

Exit codes:
  0 - no violations
  1 - one or more violations
  2 - input error
"""

from __future__ import annotations

import ast
import sys
from collections.abc import Iterable
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))

from scripts.python.basic_syntax_rules import (  # noqa: E402
    find_comment_violations,
    find_import_violations,
    find_node_violations,
)
from scripts.python.checker_model import EXCLUDED_DIRS, Violation  # noqa: E402
from scripts.python.control_flow_rules import (  # noqa: E402
    find_generic_exception_violations,
    find_if_elif_variant_violations,
    find_match_violations,
)
from scripts.python.data_model_rules import (  # noqa: E402
    find_dataclass_violations,
    find_dict_return_violations,
    find_object_annotation_violations,
)
from scripts.python.file_boundary_rules import (  # noqa: E402
    find_broad_except_violations,
    find_oversized_module_violations,
)


def discover_files(inputs: Iterable[Path]) -> list[Path]:
    seen: set[Path] = set()
    for raw in inputs:
        path = raw.resolve()
        if not path.exists():
            print(f"check-no-excuse-rules: input does not exist: {path}", file=sys.stderr)
            sys.exit(2)
        if path.is_file():
            if path.suffix == ".py":
                seen.add(path)
            continue
        for child in path.rglob("*.py"):
            if any(part in EXCLUDED_DIRS for part in child.parts):
                continue
            seen.add(child)
    return sorted(seen)


def check_file(file: Path) -> list[Violation]:
    source = file.read_text(encoding="utf-8")
    try:
        tree = ast.parse(source, filename=str(file))
    except SyntaxError as exc:
        return [Violation(
            rule="syntax-error",
            file=file,
            line=exc.lineno or 1,
            col=exc.offset or 1,
            message=f"SyntaxError: {exc.msg}",
        )]

    source_lines = source.splitlines()
    return [
        *find_node_violations(tree, file),
        *find_import_violations(tree, source_lines, file),
        *find_comment_violations(source, file),
        *find_dataclass_violations(tree, source_lines, file),
        *find_dict_return_violations(tree, source_lines, file),
        *find_match_violations(tree, source_lines, file),
        *find_generic_exception_violations(tree, source_lines, file),
        *find_object_annotation_violations(tree, source_lines, file),
        *find_if_elif_variant_violations(tree, source_lines, file),
        *find_oversized_module_violations(source_lines, file),
        *find_broad_except_violations(tree, source_lines, file),
    ]


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: check-no-excuse-rules.py <file-or-dir>...", file=sys.stderr)
        return 2
    files = discover_files(Path(argument) for argument in sys.argv[1:])
    if not files:
        print("check-no-excuse-rules: no .py files found", file=sys.stderr)
        return 0

    violations = [violation for file in files for violation in check_file(file)]
    if not violations:
        print(f"no violations in {len(files)} file(s)")
        return 0
    for violation in violations:
        print(violation.render(), file=sys.stderr)
    print(
        f"\n{len(violations)} violation(s) in {len(files)} file(s)",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
