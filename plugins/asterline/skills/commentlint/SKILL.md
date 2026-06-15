---
name: commentlint
description: Check comments for vague or low-signal wording.
---

# Commentlint

Use this skill when edits add comments or documentation.

- Reject vague phrases that hide uncertainty.
- Prefer comments that explain constraints, invariants, or surprising choices.
- Run `node plugins/asterline/hooks/commentlint.mjs --dry-run` during plugin
  validation.
