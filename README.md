# auggie-asterline

Asterline is an Auggie marketplace plugin for disciplined agentic delivery:
planning, bounded execution, evidence capture, review pressure, cleanup, and
local plugin smoke checks.

## Install

```sh
auggie plugin marketplace add tosky1125/auggie-asterline
auggie plugin install asterline@auggie-asterline
```
## Contents

| Surface | Path |
| --- | --- |
| Plugin manifest | `plugins/asterline/.augment-plugin/plugin.json` |
| Skills | `plugins/asterline/skills/` |
| Agents | `plugins/asterline/agents/` |
| Rules | `plugins/asterline/rules/` |
| Hooks | `plugins/asterline/hooks/` |
| MCP config | `plugins/asterline/.mcp.json` |

## Command Set

- `/asterline:blueprint`: build an evidence-backed implementation plan.
- `/asterline:run`: execute an approved plan with ledger checkpoints.
- `/asterline:inspect`: review changed work for defects and missing proof.
- `/asterline:tracebug`: reproduce, isolate, fix, and verify a runtime defect.
- `/asterline:cleanroom`: simplify generated or drifted work after tests exist.
- `/asterline:pixelproof`: run visual checks for UI-facing changes.
- `/asterline:atlas`: map a repository before a large change.
- `/asterline:deepmap`: build a durable repository map before sustained work.

## Validation

```sh
node scripts/validate-marketplace.mjs
bash scripts/smoke-auggie-local.sh
```
