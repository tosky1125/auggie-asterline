<run-plan-continuation>

You are mid-flight on an Asterline Prometheus work plan; this turn is an automatic continuation. Do not ask whether to continue. Continue until every counted top-level checkbox is `- [x]`.

# State

- Plan: `{{PLAN_NAME}}`
- Plan file: `{{PLAN_PATH}}`
- Boulder state: `{{BOULDER_PATH}}`
- Remaining top-level checkboxes: `{{REMAINING_COUNT}}` of `{{TOTAL_COUNT}}`
- Next incomplete task: `{{NEXT_TASK_LABEL}}`
{{WORKTREE_BLOCK}}
- Ledger: `{{LEDGER_PATH}}`
- Your session id in boulder.json: `auggie:{{SESSION_ID}}`

# What to do this turn

1. Read `{{PLAN_PATH}}` and `{{LEDGER_PATH}}` first. They are the durable sources of truth for remaining work and evidence; do not rely on memory from prior turns.
2. Pick the first unchecked column-zero checkbox in `## TODOs` or `## Final Verification Wave`. Ignore nested checkboxes under acceptance criteria, evidence, and definition-of-done sections.
3. Follow the `run-plan` skill in full. Re-read its installed contract at `$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline/skills/run-plan/SKILL.md` if the instructions are no longer in context.
4. Use the checkbox tier recorded in the ledger, or classify it now using `run-plan`: LIGHT is a narrow change inside existing layers; HEAVY covers new abstractions, security or session behavior, external integrations, schemas or migrations, concurrency, cross-domain refactors, or explicit care signals. When unsure, use HEAVY; never downgrade.
5. Decompose the checkbox into atomic work. Auggie team mode is one-shot parallel decomposition only: inspect the currently available Auggie subagent or delegation surface, launch bounded independent tasks in parallel when their ownership is disjoint, collect terminal results, and verify them in the parent. Persistent teams, member messaging, thread resumption, and durable rosters are unavailable; do not invent or emulate them. Serialize named dependencies and shared-file writes.
6. Every delegated assignment must be self-contained and executable. Name its goal, deliverable, exact scope, constraints, verification commands, one concrete manual-QA invocation with a binary PASS/FAIL observable, applicable adversarial classes, artifact path, and cleanup receipt. Include all context the worker needs instead of relying on a persistent team history.
7. Treat every worker completion claim as untrusted input. A different context must run an adversarial verification against the real surface. Only a confirmed verdict passes; false-positive, needs-fix, needs-human-review, timeout, or missing evidence loops back with the exact failure.
8. After all work under the checkbox is confirmed, patch only that checkbox from `- [ ]` to `- [x]`, re-read the plan to prove the remaining count decreased, append a `task-completed` entry to `{{LEDGER_PATH}}`, and continue.
9. On a worker failure, re-dispatch the bounded task with the exact error, observed diagnosis, and required fix. Do not restart the whole checkbox from scratch.

# Hard constraints

- No production change before a failing-first proof exists: use a unit test at a real seam, otherwise capture the manual-QA scenario failing. When existing behavior changes, first add a baseline characterization with exact input, observable, and assertion. Follow PIN → RED → GREEN → SURFACE.
- No dry run, “should work,” tests-only claim, mock-call assertion, or pinned implementation constant counts as completion evidence.
- No `as any`, `as unknown`, non-null assertion, TypeScript suppression, or deletion of failing tests.
- Probe every applicable adversarial class from `run-plan`: malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, and repeated interruptions. Record each probe result and one-line reasons for classes that do not apply.
- Register and execute cleanup for every QA resource. Leftover processes, ports, temporary directories, browser contexts, terminal sessions, or containers block completion.
- If a worktree path is present in Boulder state, every edit, command, test, and evidence artifact must stay inside that worktree.
- Every session id written to Boulder state must use the `auggie:` prefix. Bare or foreign-harness ids are not Auggie work.

# Final gate

Before completion, run `review-pass` and a `debug-trace` runtime audit. Every review lane must pass, and the runtime audit must name at least three plausible failure hypotheses with evidence that confirms or refutes each one. Inconclusive or missing lanes fail the gate. Redact secrets, credentials, auth material, private logs, and personal data from ledgers and handoffs.

Do not create a PR or branch handoff unless the user requested it. Do not claim completion until all counted checkboxes and the final gate pass. Begin with the next incomplete task now.

</run-plan-continuation>
