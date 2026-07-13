# asterline-rules

Asterline plugin that injects local project rule files into model context through lifecycle hooks.

It ports the v4.17.1 rule engine to Asterline:

- `SessionStart` loads static project instructions once per Auggie conversation.
- `PostToolUse` watches `apply_patch`, `str-replace-editor`, and `save-file`, then injects matching file-specific rules as additional context.
- Session-level deduplication prevents the same rule from being repeated after it has been injected.

`PostToolUse` output is context-only: it emits `hookSpecificOutput.additionalContext` and does not rewrite tool output.

The committed runtime is a self-contained Node.js bundle and never invokes a package manager.

## Rule Sources

Project-level sources:

- `CONTEXT.md`
- `.asterline/rules/**/*.md`
- `.claude/rules/**/*.md`
- `.cursor/rules/**/*.md`
- `.github/instructions/**/*.md`
- `.github/copilot-instructions.md`

User-home sources are also supported by the ported engine when available. `AGENTS.md` is not part of `auto` source selection because Asterline already loads it as native project instructions, so re-injecting it through hooks duplicates context; opt into it explicitly with `ASTERLINE_RULES_ENABLED_SOURCES` if you need hook-level migration behavior. Claude user-home sources (`~/.claude/rules`, `~/.claude/CLAUDE.md`) are also excluded from `auto` because they usually contain Claude Code runtime instructions rather than Asterline rules; opt into them explicitly when you want that migration behavior.

Markdown rule files may use frontmatter such as:

```md
---
description: TypeScript defaults
globs: ["**/*.ts", "**/*.tsx"]
alwaysApply: false
---

Prefer strict TypeScript and keep runtime imports ESM-compatible.
```

## Configuration

Use `ASTERLINE_RULES_*` environment variables:

| Variable | Values | Default |
| --- | --- | --- |
| `ASTERLINE_RULES_DISABLED` | `1`, `true`, `yes`, `on` | unset |
| `ASTERLINE_RULES_MODE` | `both`, `static`, `dynamic`, `off` | `both` |
| `ASTERLINE_RULES_MAX_RULE_CHARS` | positive integer | `12000` |
| `ASTERLINE_RULES_MAX_RESULT_CHARS` | positive integer | `40000` |
| `ASTERLINE_RULES_ENABLED_SOURCES` | comma-separated source names or `auto` | `auto` (excludes `AGENTS.md`, `~/.claude/rules`, `~/.claude/CLAUDE.md`) |
| `ASTERLINE_RULES_MODEL` | optional model family for bundled rule variants | `gpt-5.5` ruleset |

For migration from `pi-rules`, equivalent `PI_RULES_*` variables are accepted as fallbacks.

## Debugging

Enable hook phase timing with `NODE_DEBUG=asterline-rules`:

```bash
NODE_DEBUG=asterline-rules node dist/cli.js hook post-tool-use < fixture.json
```

Debug lines go to stderr and hook JSON stays on stdout. The log includes `PostToolUse` phases such as `extract`, `fingerprint`, `load`, `persist`, elapsed `ms`, target counts, pending counts, rule counts, and output bytes. It does not log rule bodies or tool response contents.

The Auggie manifest does not use `matcher`, because Auggie 0.32 ignores that property. The hook-bridge boundary accepts only the three edit tools and fails open for every other tool.

## Development

```bash
npm install
npm test
npm run check
npm run typecheck
npm pack --dry-run
```

Hook smoke test:

```bash
npm run build
printf '%s\n' '{"hook_event_name":"SessionStart","conversation_id":"s","workspace_roots":["/path/to/project"]}' \
  | PLUGIN_DATA=/tmp/asterline-rules-data node dist/cli.js hook session-start
```

## Privacy

`asterline-rules` runs locally. It reads local rule files and Asterline hook payloads, writes per-session deduplication state under the Asterline plugin data directory, and does not make network requests.

## License

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
