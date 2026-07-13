# WORK-LOOP COMPONENT

## OVERVIEW

Durable goal CLI/state machine with evidence, completion gates, steering, host-goal reconciliation, and explicit protocol-test hook CLIs.

## ARCHITECTURE

| Layer | Modules |
| --- | --- |
| CLI parsing/output | `cli-arg-parser`, `cli-commands`, `cli-steering`, `cli-output` |
| State lifecycle | `plan-crud`, `plan-io`, `goal-status` |
| Gates/mutations | `evidence`, `checkpoint`, `quality-gate`, `review-blockers`, `steering` |
| Host integration | `host-goal-snapshot`, `host-goal-instruction` |
| Domain contracts | `types`, `domain-types`, `command-types`, `steering-types`, `runtime` |

State lives under `.asterline/work-loop[/<session>]/{brief.md,goals.json,ledger.jsonl}`. Plan writes use temp+rename, ledger writes append JSONL, and mutations use process-local ordering plus an atomic cross-process lock.

## LOCAL CONTRACTS

- Preserve completion criteria, host-goal compatibility, final quality-gate coverage, and third-recurrence authorization blocker escalation.
- Keep plan/ledger mutations scoped by repository plus session.
- Treat `readWorkLoopPlan()` as potentially mutating because it performs legacy migration.
- Hooks fail open; CLI commands return typed `WorkLoopError` codes.
- Keep source files below 250 pure LOC. `steering.ts` is already near the ceiling; `checkpoint.ts` is the densest policy module.
- Preserve `.asterline/work-loop/` state paths, the `ASTERLINE_WORK_LOOP_*` environment prefix, and the installed self-contained bundle command; do not claim an npm-linked executable exists.
- Repository history for this component uses atomic Conventional Commits whose build/tests pass independently.

## INSTALLED WIRING / DRIFT

Source retains explicit steering and goal-guard protocol CLIs, but the component hook manifest registers only Auggie's supported `Stop` continuation. Auggie 0.32 does not accept `UserPromptSubmit`; do not claim that adapter is installed.

README, committed runtime, and tests describe the v4.17.1 surface. Remove alternate CLI aliases rather than normalizing them in new examples.

## VALIDATION

```bash
node ../../scripts/bundle-component.mjs --source .. --output dist --config runtime/work-loop.build.json
node --test ../../test/v4171-work-loop.test.mjs
node dist/cli.js --help
```

The release build emits one self-contained `dist/cli.js` and runs runtime import and package-manager audits. Then run the inherited plugin packaging gate.

## ANTI-PATTERNS

- Do not weaken or bypass the cross-process lock, stale-owner recovery, or symlink containment checks.
- Do not add compact one-line policy to evade the file ceiling.
- Do not test only source when shipped CLI behavior depends on committed dist.
