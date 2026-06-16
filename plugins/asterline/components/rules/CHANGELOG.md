# Changelog

## Unreleased

- Restrict the default `PostToolUse` hook matcher to Asterline's canonical `apply_patch` tool name.
- Add opt-in `NODE_DEBUG=asterline-rules` phase timing logs for `PostToolUse` debugging.
- Harden dynamic hook coverage for additional-context JSON output, disabled/static modes, failed tool responses, and duplicate suppression.
- Remove redundant apply_patch path scanning and stale tracked-tool constants.
- Use portable Asterline hook interpolation and add package smoke coverage for hook entrypoints.
- Cap recursive rule directory scans and run CI on Windows in addition to Ubuntu and macOS.
- Replace the external glob matcher dependency with an internal matcher so clean Asterline plugin installs run without `node_modules`.

## 0.1.0 - 2026-05-15

- Port `pi-rules` rule loading, matching, formatting, truncation, and deduplication to a Asterline plugin.
- Add `SessionStart`, `UserPromptSubmit`, and `PostToolUse` hooks for static and file-specific context injection.
- Add persistent per-session deduplication under Asterline plugin data.
- Add Asterline-aware path extraction for read, write, edit, multi-edit, `apply_patch`, and shell command payloads.
- Add tests, CI, release workflow, marketplace metadata, and local install support.
