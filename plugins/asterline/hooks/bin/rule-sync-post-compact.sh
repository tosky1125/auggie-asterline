#!/usr/bin/env sh
set -eu
ROOT="${AUGMENT_PLUGIN_ROOT:-${PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}}"
exec node "$ROOT/components/rules/dist/cli.js" hook post-compact
