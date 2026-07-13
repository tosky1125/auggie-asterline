from __future__ import annotations

import argparse
from typing import Optional

from .commands import (
    cmd_doctor,
    cmd_install,
    cmd_langs,
    cmd_new,
    cmd_replace,
    cmd_scan,
    cmd_search,
    cmd_test,
    cmd_validate,
)
from .constants import VERSION
from .runtime import set_quiet


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ast-grep-helper",
        description="LLM-friendly wrapper around ast-grep (sg).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--version", action="version", version=f"ast-grep-helper {VERSION}")
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress trace lines on stderr.")
    subcommands = parser.add_subparsers(dest="cmd", required=True, metavar="COMMAND")

    search = subcommands.add_parser("search", help="Search code by AST pattern.")
    search.add_argument("pattern", help="AST pattern, e.g. 'console.log($MSG)'")
    search.add_argument("paths", nargs="*", help="Paths to search (default: '.')")
    search.add_argument("--lang", "-l", help="Language (e.g. ts, py, go, rust). See: langs subcommand.")
    search.add_argument("--globs", action="append", help="Include/exclude glob (repeat; prefix '!' to exclude).")
    search.add_argument("--context", "-C", type=int, help="Lines of context around each match.")
    search.add_argument("--json-out", action="store_true", help="Emit raw JSON instead of human format.")
    search.add_argument("--force", action="store_true", help="Skip pattern hint validation.")
    search.set_defaults(func=cmd_search)

    replace = subcommands.add_parser("replace", help="Rewrite code by AST pattern (dry-run by default).")
    replace.add_argument("pattern", help="AST pattern.")
    replace.add_argument("rewrite", help="Replacement pattern (can reuse $VAR from pattern).")
    replace.add_argument("paths", nargs="*", help="Paths (default: '.')")
    replace.add_argument("--lang", "-l", help="Language.")
    replace.add_argument("--globs", action="append", help="Include/exclude glob.")
    replace.add_argument("--apply", action="store_true", help="Mutate files (default: dry-run preview).")
    replace.add_argument("--force", action="store_true", help="Skip pattern hint validation.")
    replace.set_defaults(func=cmd_replace)

    scan = subcommands.add_parser("scan", help="Run YAML-rule-based scan.")
    scan.add_argument("paths", nargs="*", help="Paths to scan.")
    scan.add_argument("--config", "-c", help="Path to sgconfig.yml.")
    scan.add_argument("--rule", "-r", help="Single rule file.")
    scan.add_argument("--inline-rules", help="Inline YAML rule string.")
    scan.add_argument("--report-style", choices=["rich", "medium", "short"], help="Report style.")
    scan.add_argument("--apply", "-U", action="store_true", help="Apply fixes (default: report only).")
    scan.set_defaults(func=cmd_scan)

    test_parser = subcommands.add_parser("test", help="Run ast-grep snapshot tests.")
    test_parser.add_argument("--config", "-c", help="Path to sgconfig.yml.")
    test_parser.add_argument("--test-dir", "-t", help="Test directory.")
    test_parser.add_argument("--update", "-U", action="store_true", help="Update snapshots.")
    test_parser.set_defaults(func=cmd_test)

    new = subcommands.add_parser("new", help="Scaffold a new project / rule / test / util.")
    new.add_argument("what", choices=["project", "rule", "test", "util"], help="What to create.")
    new.add_argument("name", nargs="?", help="Name of the artifact.")
    new.add_argument("--lang", "-l", help="Language.")
    new.add_argument("--yes", "-y", action="store_true", help="Accept defaults.")
    new.set_defaults(func=cmd_new)

    subcommands.add_parser("langs", help="List supported languages.").set_defaults(func=cmd_langs)
    subcommands.add_parser("doctor", help="Check ast-grep binary availability.").set_defaults(func=cmd_doctor)
    subcommands.add_parser("install", help="Diagnose provisioned runtime candidates.").set_defaults(func=cmd_install)

    validate = subcommands.add_parser("validate", help="Validate a pattern offline.")
    validate.add_argument("pattern", help="AST pattern.")
    validate.add_argument("--lang", "-l", help="Language for language-specific hints.")
    validate.set_defaults(func=cmd_validate)
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    set_quiet(bool(getattr(args, "quiet", False)))
    return args.func(args)
