# asterline-comment-checker

[![ci](https://github.com/code-yeongyu/asterline-comment-checker/actions/workflows/ci.yml/badge.svg)](https://github.com/code-yeongyu/asterline-comment-checker/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Asterline plugin that runs [`@code-yeongyu/comment-checker`](https://github.com/code-yeongyu/go-claude-code-comment-checker) after successful edit-like `PostToolUse` hook calls.

## Behavior

| Case | Result |
|------|--------|
| `apply_patch` succeeds | parses `tool_input.input` and checks added/updated files |
| `str-replace-editor` or `save-file` succeeds | maps the Auggie payload to the native checker hook input |
| Auggie reports failure, cancellation, or an unknown state | ignored without guessing from display text |
| non-edit tool succeeds | ignored |
| checker exits `2` | returns Asterline `PostToolUse` blocking feedback so the model fixes or explains the warning |
| checker binary missing or unavailable on the current platform | emits no hook output |
| checker exits unexpectedly | leaves hook output unchanged |

Deletes are ignored because they cannot introduce new comments.

## Asterline Plugin

The plugin ships:

- `.augment-plugin/plugin.json` for Asterline plugin discovery.
- `hooks/hooks.json` for the `PostToolUse` hook.
- `skills/comment-checker/SKILL.md` with usage guidance.

The hook command is:

```bash
node "${PLUGIN_ROOT}/dist/cli.js" hook post-tool-use
```

No MCP server or `comment_check` tool is exposed.

## Rebuild And Test

The committed runtime is rebuilt by the repository's pinned F3 bundler and then exercised directly with Node:

```bash
node ../../scripts/bundle-component.mjs --source .. --output dist --config runtime/comment-checker.build.json
node --test ../../test/v4171-comment-checker.test.mjs
```

## Asterline Installation

Install the parent Asterline marketplace through Auggie's plugin interface. The shipped hook bundle is self-contained and performs no dependency installation. The optional checker must be provisioned by the operator; set `ASTERLINE_COMMENT_CHECKER_BINARY` to its executable path.

The checker deadline defaults to 30 seconds. Operators may lower it to 100–30000 milliseconds with `ASTERLINE_COMMENT_CHECKER_TIMEOUT_MS`; timeout and output-budget termination always reap the child before the hook returns.

## Branch Rules and Releases

- `main` is protected by `.github/branch-ruleset.json`.
- CI runs Node 20 and 22 on Ubuntu, macOS, and Windows.
- Releases are GitHub Releases tagged as `v<semver>`.
- The parent marketplace owns release publication.

## Privacy

This plugin runs locally. It sends hook input to the optional local `comment-checker` binary when available and does not call a network service by itself.

## License

[MIT](LICENSE).

## Related

- [pi-comment-checker](https://github.com/code-yeongyu/pi-comment-checker) - source extension this Asterline plugin ports.
- [comment-checker](https://github.com/code-yeongyu/go-claude-code-comment-checker) - native checker binary.
