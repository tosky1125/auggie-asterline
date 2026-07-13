from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys

from .constants import LANG_ALIASES, LANGUAGES, VERSION
from .patterns import normalize_lang, validate_pattern
from .results import format_matches, parse_compact_json
from .runtime import err, require_binary, resolve_binary, run_sg, skill_root, trace


def cmd_search(args: argparse.Namespace) -> int:
    pattern: str = args.pattern
    lang = normalize_lang(args.lang)
    hints = validate_pattern(pattern, lang)
    if hints:
        err("pattern looks invalid for ast-grep:")
        for hint in hints:
            err(f"  - {hint}")
        if not args.force:
            err("(pass --force to call ast-grep anyway)")
            return 2
    binary = require_binary()
    sg_args = ["run", "-p", pattern, "--json=compact"]
    if lang:
        sg_args.extend(["--lang", lang])
    if args.context:
        sg_args.extend(["-C", str(args.context)])
    for glob in args.globs or []:
        sg_args.extend(["--globs", glob])
    sg_args.extend(args.paths or ["."])
    process = run_sg(binary, sg_args)
    if process.returncode not in (0, 1):
        sys.stderr.write(process.stderr or "")
        return 4
    matches = parse_compact_json(process.stdout)
    if args.json_out:
        json.dump(matches, sys.stdout, indent=2)
        print()
    else:
        format_matches(matches)
    if not matches:
        trace("no matches. If you expected matches, double-check --lang and the pattern shape.")
    return 0


def cmd_replace(args: argparse.Namespace) -> int:
    pattern: str = args.pattern
    rewrite: str = args.rewrite
    lang = normalize_lang(args.lang)
    pattern_hints = validate_pattern(pattern, lang)
    rewrite_hints = validate_pattern(rewrite, lang)
    all_hints: list[str] = []
    if pattern_hints:
        all_hints.append("pattern issues:")
        all_hints.extend(f"  - {hint}" for hint in pattern_hints)
    if rewrite_hints:
        all_hints.append("rewrite issues:")
        all_hints.extend(f"  - {hint}" for hint in rewrite_hints)
    if all_hints:
        err("input looks invalid for ast-grep:")
        for line in all_hints:
            err(line)
        if not args.force:
            err("(pass --force to call ast-grep anyway)")
            return 2
    binary = require_binary()
    preview_args = ["run", "-p", pattern, "-r", rewrite, "--json=compact"]
    if lang:
        preview_args.extend(["--lang", lang])
    for glob in args.globs or []:
        preview_args.extend(["--globs", glob])
    preview_args.extend(args.paths or ["."])
    preview = run_sg(binary, preview_args)
    if preview.returncode not in (0, 1):
        sys.stderr.write(preview.stderr or "")
        return 4
    matches = parse_compact_json(preview.stdout)
    if not matches:
        trace("no matches; nothing to replace.")
        return 0
    if not args.apply:
        file_count = len({match["file"] for match in matches})
        print(f"DRY-RUN: would rewrite {len(matches)} match(es) across {file_count} file(s):")
        format_matches(matches, show_replacement=True)
        print()
        print("Re-run with --apply to mutate files.")
        return 0
    apply_args = ["run", "-p", pattern, "-r", rewrite, "--update-all"]
    if lang:
        apply_args.extend(["--lang", lang])
    for glob in args.globs or []:
        apply_args.extend(["--globs", glob])
    apply_args.extend(args.paths or ["."])
    applied = run_sg(binary, apply_args)
    if applied.returncode not in (0, 1):
        sys.stderr.write(applied.stderr or "")
        return 4
    file_count = len({match["file"] for match in matches})
    print(f"APPLIED: rewrote {len(matches)} match(es) across {file_count} file(s).")
    return 0


def cmd_scan(args: argparse.Namespace) -> int:
    binary = require_binary()
    sg_args = ["scan"]
    if args.config:
        sg_args.extend(["-c", args.config])
    if args.rule:
        sg_args.extend(["-r", args.rule])
    if args.inline_rules:
        sg_args.extend(["--inline-rules", args.inline_rules])
    if args.report_style:
        sg_args.extend(["--report-style", args.report_style])
    if args.apply:
        sg_args.append("-U")
    sg_args.extend(args.paths or [])
    return run_sg(binary, sg_args, capture=False).returncode


def cmd_test(args: argparse.Namespace) -> int:
    binary = require_binary()
    sg_args = ["test"]
    if args.config:
        sg_args.extend(["-c", args.config])
    if args.test_dir:
        sg_args.extend(["-t", args.test_dir])
    if args.update:
        sg_args.append("-U")
    return run_sg(binary, sg_args, capture=False).returncode


def cmd_new(args: argparse.Namespace) -> int:
    binary = require_binary()
    sg_args = ["new", args.what]
    if args.name:
        sg_args.append(args.name)
    if args.lang:
        sg_args.extend(["--lang", args.lang])
    if args.yes:
        sg_args.append("--yes")
    return run_sg(binary, sg_args, capture=False).returncode


def cmd_langs(_args: argparse.Namespace) -> int:
    print("ast-grep supported languages (25):")
    for lang, extensions in sorted(LANGUAGES.items()):
        print(f"  {lang:<12} {' '.join(extensions)}")
    print()
    print("Aliases accepted by --lang:")
    for alias, canonical in sorted(LANG_ALIASES.items()):
        print(f"  {alias:<8} -> {canonical}")
    return 0


def cmd_doctor(_args: argparse.Namespace) -> int:
    print(f"ast-grep-helper v{VERSION}")
    print(f"Python:   {sys.version.split()[0]}")
    print(f"Platform: {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"Skill:    {skill_root()}")
    print()
    binary = resolve_binary()
    if not binary:
        print("ast-grep binary: UNAVAILABLE")
        print("  Asterline never invokes a package manager from this skill.")
        print("  Restart Auggie so SessionStart can provision the pinned runtime binary.")
        return 1
    print(f"ast-grep binary: {binary}")
    process = run_sg(binary, ["--version"], timeout=5)
    if process.returncode == 0:
        print(f"  version: {process.stdout.strip()}")
        return 0
    print(f"  --version returned exit {process.returncode}")
    print(f"  stderr: {process.stderr.strip()}")
    return 1


def cmd_install(_args: argparse.Namespace) -> int:
    if os.name == "nt":
        installer = skill_root() / "install.ps1"
        command = ["pwsh", "-File", str(installer)]
    else:
        installer = skill_root() / "install.sh"
        command = ["bash", str(installer)]
    if not installer.is_file():
        err(f"installer not found: {installer}")
        return 1
    trace(f"running installer: {' '.join(command)}")
    return subprocess.run(command).returncode


def cmd_validate(args: argparse.Namespace) -> int:
    lang = normalize_lang(args.lang) if args.lang else None
    hints = validate_pattern(args.pattern, lang)
    if hints:
        for hint in hints:
            print(f"hint: {hint}")
        return 2
    print("pattern looks plausible for ast-grep.")
    return 0
