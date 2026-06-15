# auggie-asterline

Asterline is an Auggie marketplace plugin for disciplined agentic delivery:
planning, bounded execution, evidence capture, review pressure, cleanup, and
local plugin smoke checks.

## Install

```sh
auggie plugin marketplace add <owner>/auggie-asterline
auggie plugin install asterline@auggie-asterline
```

## Local Load

```sh
auggie --plugin-dir . command list
```

## Contents

| Surface | Path |
| --- | --- |
| Plugin manifest | `plugins/asterline/.augment-plugin/plugin.json` |
| Skills | `plugins/asterline/skills/` |
| Commands | `plugins/asterline/commands/` |
| Agents | `plugins/asterline/agents/` |
| Rules | `plugins/asterline/rules/` |
| Hooks | `plugins/asterline/hooks/` |
| MCP config | `plugins/asterline/.mcp.json` |

## Command Set

- `/blueprint`: build an evidence-backed implementation plan.
- `/run`: execute an approved plan with ledger checkpoints.
- `/inspect`: review changed work for defects and missing proof.
- `/tracebug`: reproduce, isolate, fix, and verify a runtime defect.
- `/cleanroom`: simplify generated or drifted work after tests exist.
- `/pixelproof`: run visual checks for UI-facing changes.
- `/atlas`: map a repository before a large change.

## Validation

```sh
node scripts/validate-marketplace.mjs
bash scripts/smoke-auggie-local.sh
```
