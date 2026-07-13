from __future__ import annotations

import ast
import io
import sys
import tokenize
from pathlib import Path

from scripts.python.checker_model import BANNED_IMPORTS, SUPPRESSION_RE, Violation


def _is_any_node(node: ast.AST) -> bool:
    if isinstance(node, ast.Name):
        return node.id == "Any"
    if isinstance(node, ast.Attribute):
        return node.attr == "Any"
    return False


def _is_cast_callable(node: ast.AST) -> bool:
    if isinstance(node, ast.Name):
        return node.id == "cast"
    if isinstance(node, ast.Attribute):
        return node.attr == "cast"
    return False


def find_node_violations(tree: ast.AST, file: Path) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and _is_cast_callable(node.func)
            and node.args
            and _is_any_node(node.args[0])
        ):
            violations.append(Violation(
                rule="cast-any",
                file=file,
                line=node.lineno,
                col=node.col_offset + 1,
                message="cast(Any, ...) - narrow with isinstance/TypeGuard or use a Protocol/TypedDict",
            ))

        if not isinstance(node, ast.ExceptHandler):
            continue
        if node.type is None:
            violations.append(Violation(
                rule="bare-except",
                file=file,
                line=node.lineno,
                col=node.col_offset + 1,
                message="bare `except:` - catch the narrowest exception you mean",
            ))
        if len(node.body) != 1:
            continue
        body = node.body[0]
        if isinstance(body, ast.Pass):
            violations.append(Violation(
                rule="silent-except",
                file=file,
                line=body.lineno,
                col=body.col_offset + 1,
                message="silent `except: pass` - log, re-raise, or actually handle the error",
            ))
        elif (
            isinstance(body, ast.Expr)
            and isinstance(body.value, ast.Constant)
            and body.value.value is Ellipsis
        ):
            violations.append(Violation(
                rule="silent-except",
                file=file,
                line=body.lineno,
                col=body.col_offset + 1,
                message="silent `except: ...` - log, re-raise, or actually handle the error",
            ))
    return violations


def find_import_violations(
    tree: ast.AST,
    source_lines: list[str],
    file: Path,
) -> list[Violation]:
    violations: list[Violation] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):  # noqa: IF_VARIANT_OK - filtering an open AST
            names = tuple(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            names = (node.module or "",)
        else:
            continue
        line = source_lines[node.lineno - 1] if node.lineno <= len(source_lines) else ""
        for name in names:
            top = name.split(".")[0]
            if top not in BANNED_IMPORTS:
                continue
            rule, opt_re, message = BANNED_IMPORTS[top]
            if opt_re.search(line):
                continue
            violations.append(Violation(
                rule=rule,
                file=file,
                line=node.lineno,
                col=node.col_offset + 1,
                message=message,
            ))
    return violations


def find_comment_violations(source: str, file: Path) -> list[Violation]:
    violations: list[Violation] = []
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    except tokenize.TokenError as exc:
        print(f"check-no-excuse-rules: tokenize failed for {file}: {exc}", file=sys.stderr)
        return violations

    for token in tokens:
        if token.type != tokenize.COMMENT:
            continue
        match = SUPPRESSION_RE.search(token.string)
        if match is None:
            continue
        kind = match.group(1)
        violations.append(Violation(
            rule="type-ignore" if kind == "type" else "pyright-ignore",
            file=file,
            line=token.start[0],
            col=token.start[1] + match.start() + 1,
            message=f"`# {kind}: ignore` - fix the underlying type instead",
        ))
    return violations
