---
name: work-loop
description: Durable evidence-bound goal loop for systematic Asterline delivery on Auggie.
metadata:
  short-description: Durable evidence-bound work loop
---

# work-loop

Use this skill for durable goal execution, checkpointed delivery, or long-running work that needs observable evidence.

Read `references/full-workflow.md` before creating or mutating a plan. State lives only under `.asterline/work-loop`; use the documented installed `work_loop` command instead of hand-editing it.

## Asterline skill mapping

- Use `deep-work` for maximum-effort execution.
- Use `run-plan` when executing an approved implementation plan.
- Use `review-pass` for the final implementation review.
- Use `debug-trace` for runtime failures and races.
- Use `team-mode` only to split independent work in parallel.

## Auggie boundary

Auggie supports parallel task decomposition, but this workflow does not promise persistent teams, worker-to-worker messaging, worker resumption, or durable worker threads. Launch only independent bounded tasks through the agent tool currently available, collect each returned result, and keep all durable truth in the work-loop files.

## Non-negotiables

- Recover after compaction by reading brief, goals, ledger, then `work_loop status --json`.
- Record only evidence personally re-run or inspected from the named real surface.
- Keep `auggie:<session_id>` as the public Auggie session identity when recording cross-component state.
- Require all criteria to pass before checkpoint completion.
- Escalate an identical external-authorization blocker only on its third occurrence.
- Commit verified work units atomically when the user authorized commits.
- Clean processes, ports, temporary paths, and worker resources before recording PASS.
