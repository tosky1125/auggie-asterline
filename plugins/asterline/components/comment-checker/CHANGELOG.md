# Changelog

## Unreleased

### Added

- Port the pinned 4.17.1 comment-checker contract to Auggie `str-replace-editor`, `save-file`, and `apply_patch` payloads.
- Add a deterministic F3 recipe and self-contained Node runtime bundle.

### Changed

- Use the shared `@asterline/hook-bridge` boundary and trust only explicit Auggie execution state.
- Treat the operator-provisioned native checker as optional and fail open when it is absent or unhealthy.
- Reap timed-out and output-flooding checker processes through a bounded TERM/KILL shutdown path.
- Remove package installation guidance and unsupported Auggie `matcher`/`statusMessage` hook fields.
- Cap child process stdout/stderr captured from the native checker.
- Run CI on Windows in addition to Ubuntu and macOS.

## [0.1.1] - 2026-05-15

### Changed

- Limit automatic comment checking to successful `apply_patch` hook events.
- Remove the `comment_check` MCP tool and MCP server configuration.
- Update plugin metadata, docs, and contributor guidance to describe hook-only behavior.

## [0.1.0] - 2026-05-15

### Added

- Initial `asterline-comment-checker` Asterline plugin.
- `PostToolUse` hook for `apply_patch`, `write`, `edit`, and `multiedit` style tool calls.
- Blocking hook feedback when `comment-checker` reports warnings.
- `comment_check` MCP tool for explicit write/edit/multiedit checks.
- Asterline plugin manifest, local MCP config, bundled skill, and GitHub repository metadata.
