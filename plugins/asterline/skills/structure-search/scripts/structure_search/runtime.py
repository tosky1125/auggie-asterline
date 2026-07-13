from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

from .constants import DEFAULT_TIMEOUT_S

_quiet = False


def set_quiet(value: bool) -> None:
    global _quiet
    _quiet = value


def trace(message: str) -> None:
    if not _quiet:
        print(f"[ast-grep-helper] {message}", file=sys.stderr, flush=True)


def err(message: str) -> None:
    print(f"[ast-grep-helper] error: {message}", file=sys.stderr, flush=True)


def skill_root() -> Path:
    return Path(__file__).resolve().parents[2]


def cached_binary() -> Optional[Path]:
    binary_name = "sg.exe" if os.name == "nt" else "sg"
    alternate_name = "ast-grep.exe" if os.name == "nt" else "ast-grep"
    for name in (binary_name, alternate_name):
        path = skill_root() / "bin" / name
        if path.is_file() and os.access(path, os.X_OK):
            return path
    return None


def which_binary() -> Optional[Path]:
    for name in ("ast-grep", "sg"):
        found = shutil.which(name)
        if not found:
            continue
        path = Path(found)
        if name == "sg" and platform.system() == "Linux":
            try:
                probe = subprocess.run(
                    [str(path), "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
            except (OSError, subprocess.SubprocessError):
                continue
            if probe.returncode != 0 or "ast-grep" not in (probe.stdout + probe.stderr).lower():
                continue
        return path
    return None


def homebrew_binary() -> Optional[Path]:
    candidates = (
        Path("/opt/homebrew/bin/ast-grep"),
        Path("/opt/homebrew/bin/sg"),
        Path("/usr/local/bin/ast-grep"),
        Path("/usr/local/bin/sg"),
    )
    for path in candidates:
        if path.is_file() and os.access(path, os.X_OK):
            return path
    return None


def asterline_env_binary() -> Optional[Path]:
    raw_path = os.environ.get("ASTERLINE_AST_GREP_SG_PATH")
    if not raw_path:
        return None
    path = Path(raw_path).expanduser()
    if path.is_file() and os.access(path, os.X_OK):
        return path
    return None


def asterline_runtime_slug() -> str:
    if sys.platform.startswith("win"):
        os_slug = "win32"
    elif sys.platform == "darwin":
        os_slug = "darwin"
    else:
        os_slug = "linux"
    machine = platform.machine().lower()
    arch_slug = "arm64" if machine in {"arm64", "aarch64"} else "x64"
    return f"{os_slug}-{arch_slug}"


def asterline_runtime_binary() -> Optional[Path]:
    binary_name = "sg.exe" if sys.platform.startswith("win") else "sg"
    slug = asterline_runtime_slug()
    candidates: list[Path] = []
    asterline_home = os.environ.get("ASTERLINE_HOME")
    if asterline_home:
        candidates.append(Path(asterline_home) / "runtime" / "ast-grep" / slug / binary_name)
    candidates.append(Path.home() / ".asterline" / "runtime" / "ast-grep" / slug / binary_name)
    for path in candidates:
        if path.is_file() and os.access(path, os.X_OK):
            return path
    return None


def resolve_binary() -> Optional[Path]:
    resolvers = (
        asterline_env_binary,
        asterline_runtime_binary,
        cached_binary,
        which_binary,
        homebrew_binary,
    )
    for resolver in resolvers:
        result = resolver()
        if result:
            return result
    return None


def require_binary() -> Path:
    path = resolve_binary()
    if path:
        return path
    err("ast-grep is unavailable.")
    err("Asterline will not invoke a package manager from this skill.")
    err("Restart Auggie so SessionStart can provision the pinned runtime binary.")
    err(f"Run {skill_root()}/install.sh only to diagnose existing runtime candidates.")
    sys.exit(3)


def run_sg(
    binary: Path,
    args: list[str],
    *,
    timeout: int = DEFAULT_TIMEOUT_S,
    capture: bool = True,
) -> subprocess.CompletedProcess[str]:
    command = [str(binary), *args]
    trace(f"exec: {' '.join(command)}")
    try:
        return subprocess.run(
            command,
            capture_output=capture,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        err(f"ast-grep call timed out after {timeout}s")
        sys.exit(5)
