from __future__ import annotations

import ast
from pathlib import Path

from scripts.python.checker_model import (
    DICT_OK_RE,
    MUTABLE_OK_RE,
    OBJECT_OK_RE,
    SLOTS_OK_RE,
    Violation,
)


def _has_keyword(decorator: ast.Call, keyword: str) -> bool:
    for item in decorator.keywords:
        if item.arg == keyword and isinstance(item.value, ast.Constant):
            return bool(item.value.value)
    return False


def _dataclass_call(node: ast.expr) -> tuple[bool, ast.Call | None]:
    if isinstance(node, ast.Name):
        return node.id == "dataclass", None
    if isinstance(node, ast.Attribute):
        return node.attr == "dataclass", None
    if isinstance(node, ast.Call):
        is_dataclass, _ = _dataclass_call(node.func)
        return is_dataclass, node if is_dataclass else None
    return False, None


def find_dataclass_violations(
    tree: ast.Module,
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        for decorator in node.decorator_list:
            is_dataclass, call = _dataclass_call(decorator)
            if not is_dataclass:
                continue
            line = source_lines[decorator.lineno - 1] if decorator.lineno <= len(source_lines) else ""
            has_frozen = _has_keyword(call, "frozen") if call is not None else False
            has_slots = _has_keyword(call, "slots") if call is not None else False
            if not has_frozen and not MUTABLE_OK_RE.search(line):
                violations.append(Violation(
                    rule="mutable-dataclass",
                    file=file,
                    line=decorator.lineno,
                    col=decorator.col_offset + 1,
                    message=f"class {node.name}: @dataclass without frozen=True",
                ))
            if not has_slots and not SLOTS_OK_RE.search(line):
                violations.append(Violation(
                    rule="missing-slots",
                    file=file,
                    line=decorator.lineno,
                    col=decorator.col_offset + 1,
                    message=f"class {node.name}: @dataclass without slots=True",
                ))
    return violations


def find_dict_return_violations(
    tree: ast.Module,
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        annotation = node.returns
        if annotation is None:
            continue
        is_bare_dict = (
            isinstance(annotation, ast.Name) and annotation.id == "dict"
        ) or (
            isinstance(annotation, ast.Attribute) and annotation.attr == "dict"
        )
        if not is_bare_dict:
            continue
        line = source_lines[node.lineno - 1] if node.lineno <= len(source_lines) else ""
        if DICT_OK_RE.search(line):
            continue
        violations.append(Violation(
            rule="raw-dict-return",
            file=file,
            line=node.lineno,
            col=node.col_offset + 1,
            message=f"`{node.name}` returns bare dict - use TypedDict/dataclass/Pydantic model",
        ))
    return violations


def find_object_annotation_violations(
    tree: ast.Module,
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    violations: list[Violation] = []

    def inspect_annotation(annotation: ast.expr | None) -> None:
        if annotation is None:
            return
        for child in ast.walk(annotation):
            if not isinstance(child, ast.Name) or child.id != "object":
                continue
            line = source_lines[child.lineno - 1] if child.lineno <= len(source_lines) else ""
            if OBJECT_OK_RE.search(line):
                return
            violations.append(Violation(
                rule="no-object",
                file=file,
                line=child.lineno,
                col=child.col_offset + 1,
                message="`object` as type annotation — use Protocol, TypeVar, or union",
            ))

    for node in ast.walk(tree):
        match node:  # noqa: MATCH_OK - filtering an open AST
            case ast.FunctionDef() | ast.AsyncFunctionDef():
                arguments = node.args.args + node.args.posonlyargs + node.args.kwonlyargs
                for argument in arguments:
                    inspect_annotation(argument.annotation)
                if node.args.vararg:
                    inspect_annotation(node.args.vararg.annotation)
                if node.args.kwarg:
                    inspect_annotation(node.args.kwarg.annotation)
                inspect_annotation(node.returns)
            case ast.AnnAssign():
                inspect_annotation(node.annotation)
            case _:
                continue
    return violations
