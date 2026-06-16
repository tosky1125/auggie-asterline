---
name: rules
description: Use when the user asks about Asterline Rules behavior, injected project rules, supported rule file locations, matching, or environment configuration.
---

# Asterline Rules

Asterline Rules is automatic once the plugin is enabled. It injects:

- static project instructions on `SessionStart` and `UserPromptSubmit`
- matching file-specific rules after Asterline `apply_patch` by default

Dynamic `PostToolUse` output is injected as additional context and is deduplicated per plugin data session. Asterline Rules does not rewrite tool output.

Supported project sources:

- `CONTEXT.md`
- `.asterline/rules/**/*.md`
- `.claude/rules/**/*.md`
- `.cursor/rules/**/*.md`
- `.github/instructions/**/*.md`
- `.github/copilot-instructions.md`

Supported environment knobs:

- `ASTERLINE_RULES_DISABLED=1`
- `ASTERLINE_RULES_MODE=both|static|dynamic|off`
- `ASTERLINE_RULES_MAX_RULE_CHARS=<number>`
- `ASTERLINE_RULES_MAX_RESULT_CHARS=<number>`
- `ASTERLINE_RULES_ENABLED_SOURCES=CONTEXT.md,.asterline/rules`

The legacy `PI_RULES_*` variables are accepted as fallbacks for users migrating from `pi-rules`.
