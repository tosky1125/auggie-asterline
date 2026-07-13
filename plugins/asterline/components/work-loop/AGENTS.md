# WORK-LOOP COMPONENT

## OVERVIEW

Durable goal CLI/state machine with evidence, completion gates, steering, host-goal reconciliation, and UserPromptSubmit integration.

## ARCHITECTURE

| Layer | Modules |
| --- | --- |
| CLI parsing/output | `cli-arg-parser`, `cli-commands`, `cli-steering`, `cli-output` |
| State lifecycle | `plan-crud`, `plan-io`, `goal-status` |
| Gates/mutations | `evidence`, `checkpoint`, `quality-gate`, `review-blockers`, `steering` |
| Host integration | `host-goal-snapshot`, `host-goal-instruction` |
| Domain contracts | `types`, `domain-types`, `command-types`, `steering-types`, `runtime` |

State lives under `.asterline/work-loop[/<session>]/{brief.md,goals.json,ledger.jsonl}`. Plan writes use temp+rename; ledger writes append JSONL; locking is process-local only.

## LOCAL CONTRACTS

- Preserve completion criteria, host-goal compatibility, final quality-gate coverage, and third-recurrence authorization blocker escalation.
- Keep plan/ledger mutations scoped by repository plus session.
- Treat `readWorkLoopPlan()` as potentially mutating because it performs legacy migration.
- Hooks fail open; CLI commands return typed `WorkLoopError` codes.
- Keep source files below 250 pure LOC. `steering.ts` is already near the ceiling; `checkpoint.ts` is the densest policy module.
- Preserve `.asterline/work-loop/` state paths, the `ASTERLINE_WORK_LOOP_*` environment prefix, and the `asterline work-loop` CLI form; do not introduce alternate aliases.
- Repository history for this component uses atomic Conventional Commits whose build/tests pass independently.

## INSTALLED WIRING / DRIFT

Source implements UserPromptSubmit steering and a PreToolUse goal guard. Component and aggregate hook manifests currently register only UserPromptSubmit, while package smoke expects the guard. Do not claim the guard is installed until aggregate wiring and payload coverage exist.

README/changelog retain scaffold-era paths/version/command claims. Code and tests are authoritative, but update docs when touching the affected surface. Remove remaining alternate CLI aliases rather than normalizing them in new examples.

## VALIDATION

```bash
npm run check
npm test
node dist/cli.js --help
```

`check` does not run tests. Current checkout lacks component dependencies, so record missing-tool failures rather than treating them as product failures. Then run the inherited plugin packaging gate.

## ANTI-PATTERNS

- Do not assume process-local locking is cross-process transactional safety.
- Do not add compact one-line policy to evade the file ceiling.
- Do not test only source when shipped CLI behavior depends on committed dist.
