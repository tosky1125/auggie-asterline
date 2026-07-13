# Asterline ast-grep Runtime

Asterline provisions the checksum-pinned `ast-grep` executable during Auggie
`SessionStart`. The skill itself never invokes `npm`, `npx`, `pip`, Cargo,
Homebrew, or another package manager.

## Resolution order

The helper resolves the first executable candidate in this order:

1. `ASTERLINE_AST_GREP_SG_PATH`.
2. `$ASTERLINE_HOME/runtime/ast-grep/<platform>-<arch>/sg` when
   `ASTERLINE_HOME` is set.
3. `$HOME/.asterline/runtime/ast-grep/<platform>-<arch>/sg`.
4. A committed skill-local `bin/sg`, if a future release ships one.
5. An existing `ast-grep` or verified `sg` executable on `PATH`.
6. Conventional Homebrew binary paths.

On Windows the filename is `sg.exe`. Supported runtime slugs are
`darwin-arm64`, `darwin-x64`, `linux-arm64`, `linux-x64`, `win32-arm64`, and
`win32-x64`.

## Diagnose an unavailable binary

Run:

```bash
python3 scripts/ast_grep_helper.py doctor
bash install.sh
```

The second command is a compatibility diagnostic despite its retained upstream
filename. It only verifies an already provisioned binary. It never downloads or
installs software. If both commands report unavailable, restart Auggie so the
SessionStart bootstrap can provision the pinned runtime asset, then rerun
`doctor`.

## Override for controlled environments

Point the helper at an administrator-provided executable:

```bash
export ASTERLINE_AST_GREP_SG_PATH=/approved/path/to/sg
python3 scripts/ast_grep_helper.py doctor
```

The helper verifies the executable with `--version` before normal use.
