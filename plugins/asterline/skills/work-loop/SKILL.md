---
name: work-loop
description: Goal-like loop for systematic, evidence-bound execution with durable checkpoints.
metadata:
  short-description: Goal-like evidence loop with durable checkpoints
---

# work-loop

Use this skill when the user asks for `work-loop`, `ulw`, durable goal execution, evidence-led work, manual QA, or checkpointed long-running delivery.

This skill is intentionally compact. The full workflow lives in `references/full-workflow.md`. Read only the sections needed for the current phase, then execute them exactly.

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read through **Bootstrap** (including its tier triage), **Execution Loop**, and the **Manual-QA channels** table before running any ULW command or recording evidence.
3. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rule-sync. Tests alone never prove done.

## Non-Negotiables

- Use the work-loop CLI state under `.asterline/work-loop`; do not hand-edit goal state.
- After any compaction or context loss, read `.asterline/work-loop/brief.md`, `goals.json`, and `ledger.jsonl` directly, then run `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop status --json`; never re-plan from scratch.
- If the direct Node CLI's `create-goals` command says the existing aggregate is already complete, start unrelated new work with a fresh `--session-id <new-id>` instead of steering or forcing the completed default state. Use `--force` only to intentionally overwrite completed evidence.
- Every success criterion needs observable evidence from a real surface: a channel (tmux, HTTP, browser, computer-use) or, for CLI- or data-shaped criteria, an auxiliary surface (CLI stdout, DB diff, parsed config dump).
- Record evidence through the CLI only after cleanup receipts are available.
- Delegate code edits, test writes, fixes, and QA execution to right-sized available subagents when the workflow requires it.
- Every delegated unit is a self-contained one-shot assignment beginning with `TASK:`, then naming `DELIVERABLE`, `SCOPE`, and `VERIFY`; put role and specialty instructions inside the assignment.
- Launch independent lanes in parallel and keep doing independent root work while Auggie executes them.
- Auggie integration supports parallel splitting only. Do not rely on worker messaging, progress polling, follow-up tasks, resume, persistent teams, or cross-turn worker identity.
- Integrate only terminal results. A missing, empty, or blocked result is inconclusive and may be retried once as a smaller fresh assignment.
- Use `git-flow` for git-tracked edits: inspect recent and touched-path commit history, then commit each verified work unit atomically in the repository's observed language, scope, and message style with only that unit's files staged.

## Auggie Delegation Boundary

Inspect the currently visible Auggie tools before delegating and use their exact schema. The full workflow's worker descriptions are assignment content, not callable syntax. Only fresh bounded one-shot parallel assignments are portable here; the parent remains the integrator and independently verifies every returned result.
