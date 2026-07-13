# Changelog

## 4.17.1

- Adapt SessionStart and PostToolUse to the Auggie hook-bridge payload contract without unsupported manifest matchers.
- Emit one deterministic self-contained runtime bundle and remove the obsolete multi-file benchmark entrypoint.
- Add opt-in `NODE_DEBUG=asterline-rules` phase timing logs for `PostToolUse` debugging.
- Harden dynamic hook coverage for additional-context JSON output, disabled/static modes, failed tool responses, and duplicate suppression.
- Remove redundant apply_patch path scanning and stale tracked-tool constants.
- Use portable Asterline hook interpolation and add package smoke coverage for hook entrypoints.
- Cap recursive rule directory scans and run CI on Windows in addition to Ubuntu and macOS.
- Inline the exact glob matcher into the committed runtime bundle.

## 0.1.0 - 2026-05-15

- Port `pi-rules` rule loading, matching, formatting, truncation, and deduplication to a Asterline plugin.
- Add `SessionStart`, `UserPromptSubmit`, and `PostToolUse` hooks for static and file-specific context injection.
- Add persistent per-session deduplication under Asterline plugin data.
- Add Asterline-aware path extraction for read, write, edit, multi-edit, `apply_patch`, and shell command payloads.
- Add tests, CI, release workflow, marketplace metadata, and local install support.
