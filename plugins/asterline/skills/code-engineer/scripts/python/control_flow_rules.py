from __future__ import annotations

import ast
from pathlib import Path
from typing import Final

from scripts.python.checker_model import (
    GENERIC_ERR_OK_RE,
    IF_VARIANT_OK_RE,
    MATCH_OK_RE,
    Violation,
)

GENERIC_EXCEPTIONS: Final = frozenset({"ValueError", "TypeError", "RuntimeError", "KeyError"})


def find_match_violations(
    tree: ast.Module,
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Match):
            continue
        line = source_lines[node.lineno - 1] if node.lineno <= len(source_lines) else ""
        if MATCH_OK_RE.search(line):
            continue
        has_assert_never = False
        for case in node.cases:
            pattern = case.pattern
            is_wildcard = isinstance(pattern, ast.MatchAs) and (
                pattern.pattern is None
                or (
                    isinstance(pattern.pattern, ast.MatchAs)
                    and pattern.pattern.pattern is None
                    and pattern.pattern.name is None
                )
            )
            if not is_wildcard:
                continue
            for statement in case.body:
                if not isinstance(statement, ast.Expr) or not isinstance(statement.value, ast.Call):
                    continue
                function = statement.value.func
                if (
                    isinstance(function, ast.Name) and function.id == "assert_never"
                ) or (
                    isinstance(function, ast.Attribute) and function.attr == "assert_never"
                ):
                    has_assert_never = True
                    break
        if not has_assert_never:
            violations.append(Violation(
                rule="missing-assert-never",
                file=file,
                line=node.lineno,
                col=node.col_offset + 1,
                message="match without `case _: assert_never(x)` default",
            ))
    return violations


def find_generic_exception_violations(
    tree: ast.Module,
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Raise) or not isinstance(node.exc, ast.Call):
            continue
        function = node.exc.func
        if isinstance(function, ast.Name):  # noqa: IF_VARIANT_OK - filtering an open AST
            exception_name = function.id if function.id in GENERIC_EXCEPTIONS else None
        elif isinstance(function, ast.Attribute):
            exception_name = function.attr if function.attr in GENERIC_EXCEPTIONS else None
        else:
            exception_name = None
        if exception_name is None or not node.exc.args:
            continue
        all_strings = all(
            (isinstance(argument, ast.Constant) and isinstance(argument.value, str))
            or isinstance(argument, ast.JoinedStr)
            for argument in node.exc.args
        )
        if not all_strings:
            continue
        line = source_lines[node.lineno - 1] if node.lineno <= len(source_lines) else ""
        if GENERIC_ERR_OK_RE.search(line):
            continue
        violations.append(Violation(
            rule="generic-exception",
            file=file,
            line=node.lineno,
            col=node.col_offset + 1,
            message=f"`raise {exception_name}(\"...\")` - define a typed error class instead",
        ))
    return violations


def _is_isinstance_test(node: ast.expr) -> bool:
    return (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "isinstance"
    )


def _is_enum_comparison(node: ast.expr) -> bool:
    if not isinstance(node, ast.Compare) or len(node.ops) != 1:
        return False
    if not isinstance(node.ops[0], (ast.Eq, ast.Is)):
        return False
    return isinstance(node.comparators[0], ast.Attribute) or isinstance(node.left, ast.Attribute)


def find_if_elif_variant_violations(
    tree: ast.Module,
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.If):
            continue
        line = source_lines[node.lineno - 1] if node.lineno <= len(source_lines) else ""
        if IF_VARIANT_OK_RE.search(line):
            continue
        if not (_is_isinstance_test(node.test) or _is_enum_comparison(node.test)):
            continue
        alternate = node.orelse
        while alternate and len(alternate) == 1 and isinstance(alternate[0], ast.If):
            branch = alternate[0]
            if _is_isinstance_test(branch.test) or _is_enum_comparison(branch.test):
                violations.append(Violation(
                    rule="if-elif-on-variant",
                    file=file,
                    line=node.lineno,
                    col=node.col_offset + 1,
                    message="isinstance/enum if/elif chain — use match/case + assert_never",
                ))
                break
            alternate = branch.orelse
    return violations
