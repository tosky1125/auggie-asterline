---
name: rule-sync
description: Use when the user asks about Asterline rule injection, supported rule file locations, matching, or environment configuration.
---

# Asterline Rule Sync

Rule sync runs automatically when the plugin is enabled:

- `SessionStart` injects static project instructions once per Auggie conversation.
- successful `apply_patch`, `str-replace-editor`, and `save-file` events inject matching file-specific rules.
- failed, cancelled, malformed, repeated, traversing, and symlink-escaped events fail open without injecting content.

Supported project sources are `CONTEXT.md`, `.asterline/rules/**/*.md`, `.claude/rules/**/*.md`, `.cursor/rules/**/*.md`, `.github/instructions/**/*.md`, and `.github/copilot-instructions.md`.

Configuration uses `ASTERLINE_RULES_DISABLED`, `ASTERLINE_RULES_MODE`, `ASTERLINE_RULES_MAX_RULE_CHARS`, `ASTERLINE_RULES_MAX_RESULT_CHARS`, `ASTERLINE_RULES_ENABLED_SOURCES`, and optional `ASTERLINE_RULES_MODEL`. The model override selects the matching bundled behavior variant; Auggie otherwise uses the deterministic GPT-5.5-family ruleset without claiming control over Auggie's model.

The legacy `PI_RULES_*` variables remain migration-only fallbacks.
