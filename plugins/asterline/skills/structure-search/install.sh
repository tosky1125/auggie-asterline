#!/usr/bin/env bash

set -euo pipefail

case "${1:-}" in
  --help|-h)
    printf '%s\n' 'Asterline does not install ast-grep from this skill.'
    printf '%s\n' 'SessionStart provisions the checksum-pinned runtime binary.'
    exit 0
    ;;
  '') ;;
  *)
    printf 'structure-search: unknown argument: %s\n' "$1" >&2
    exit 1
    ;;
esac

case "$(uname -s)" in
  Darwin) os_slug='darwin' ;;
  MINGW*|MSYS*|CYGWIN*) os_slug='win32' ;;
  *) os_slug='linux' ;;
esac
case "$(uname -m | tr '[:upper:]' '[:lower:]')" in
  arm64|aarch64) arch_slug='arm64' ;;
  *) arch_slug='x64' ;;
esac

binary_name='sg'
case "$os_slug" in win32) binary_name='sg.exe' ;; esac
asterline_home="${ASTERLINE_HOME:-$HOME/.asterline}"
runtime_binary="$asterline_home/runtime/ast-grep/$os_slug-$arch_slug/$binary_name"

if [ -n "${ASTERLINE_AST_GREP_SG_PATH:-}" ] && [ -x "$ASTERLINE_AST_GREP_SG_PATH" ]; then
  "$ASTERLINE_AST_GREP_SG_PATH" --version
  exit 0
fi
if [ -x "$runtime_binary" ]; then
  "$runtime_binary" --version
  exit 0
fi
if command -v ast-grep >/dev/null 2>&1; then
  ast-grep --version
  exit 0
fi

printf '%s\n' 'structure-search: ast-grep is unavailable.' >&2
printf '%s\n' 'Asterline will not invoke a package manager from a skill.' >&2
printf '%s\n' 'Restart Auggie so SessionStart can provision the pinned runtime binary.' >&2
exit 3
