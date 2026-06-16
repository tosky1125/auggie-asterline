---
name: comment-guard
description: Use when Auggie needs to understand or respond to automatic comment-guard feedback emitted after an edit-like PostToolUse hook.
---

# Asterline Comment Guard

The plugin registers a `PostToolUse` hook for Auggie edit tools such as `str-replace-editor` and `save-file`.

When comment-guard reports a warning after a patch, Auggie receives blocking feedback and should fix or explain the flagged comment before moving on.

## Scope

- No MCP tool is exposed.
- Non-edit tools are ignored by this plugin.
- Missing checker binaries emit no hook output so normal Auggie work can continue.
