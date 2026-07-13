---
name: run-plan
description: "Execute a Prometheus work plan in Auggie with Boulder state, evidence ledger updates, worktree discipline, parallel subagents, and Stop-hook continuation. Use after planning when the user says start work, execute plan, continue plan, resume plan, or asks to run a .asterline/plans plan."
---

## Auggie delegation compatibility

Auggie supports only bounded one-shot parallel decomposition. Inspect the currently visible delegation surface before using it; do not invent tool names. Give each worker a self-contained assignment with disjoint ownership, collect its terminal result through the host surface, and let the parent verify and integrate it.

Persistent teams, rosters, worker messaging, thread creation, resume, and cross-turn worker identity are unavailable. Any foreign-harness orchestration example below is conceptual only: translate it to fresh independent one-shot assignments, or run serially when the work cannot be split safely. This capability boundary overrides every example in this skill.


## ABSOLUTE RULE: YOU ARE AN ORCHESTRATOR — NEVER THE IMPLEMENTER

**YOU DO NOT WRITE CODE. YOU DO NOT EDIT PRODUCT FILES. YOU DO NOT RUN QA YOURSELF. EVERY unit of implementation, test, QA, and review work MUST be delegated to a spawned subagent. NO EXCEPTIONS.** Your hands touch only plan selection, `.asterline/` state (Boulder, ledger, plan checkboxes), decomposition, dispatch, verdicts, and evidence records. About to edit a product file or run an implementation command yourself? **STOP. SPAWN A WORKER INSTEAD.** Orchestrate at **MAXIMUM PARALLELISM**: every independent unit runs concurrently; only named dependencies serialize.

## Auggie Subagent Reliability

Every delegated unit is a self-contained executable assignment: `TASK: <imperative assignment>`, then `DELIVERABLE`, `SCOPE`, and `VERIFY`, with specialty instructions in the assignment. Include only the context the child needs.

Launch independent plan and review lanes in parallel and keep doing independent root work. Auggie does not promise child messaging, progress polling, resume, or re-tasking. Integrate only terminal results. An empty, inconclusive, or blocked result is never a pass; retry it once as a smaller fresh assignment.

# run-plan

Execute a Prometheus work plan until every top-level checkbox is complete. This skill pairs with the Auggie continuation hook (`components/run-plan-continuation`), which re-injects the next turn while `.asterline/boulder.json` says this `auggie:<session_id>` still has unchecked plan work.

## Usage

```text
$run-plan [plan-name] [--worktree <absolute-path>]
```

- `plan-name` (optional): a full or partial file stem under `.asterline/plans/`.
- `--worktree` (optional): only when the user explicitly asks for a separate git worktree.

## Phase 1: Select the plan

1. Read `.asterline/boulder.json` if it exists.
2. List Prometheus plan files under `.asterline/plans/`.
3. If `plan-name` was provided, select the matching plan.
4. If exactly one active or paused Boulder work exists for this session, resume it.
5. If no active work exists and exactly one plan exists, select it.
6. If no active work exists and there is no selectable plan, enter **No-plan bootstrap**.
7. If multiple plans remain possible, ask one focused selection question.

### No-plan bootstrap

When the user explicitly said `start work` / `$run-plan` and no selectable plan exists, treat that phrase as approval: bootstrap `work-plan` to create the approved plan before execution and implementation, instead of stalling or asking for generic approval again. A brief or notes file without waves, checkboxes, and acceptance criteria is NOT decision-complete — enter this bootstrap too.

1. Invoke the `work-plan` skill from the current request and require its dynamic adversarial workflow: collect, verify, design, adversarial plan-review, synthesize.
2. The generated Prometheus plan must be saved under `.asterline/plans/<slug>.md` before implementation or Boulder state writes that point at plan work.
3. Use maximum safe parallelism in the generated plan: independent files/tasks fan out; same-file writes, shared state, and named dependencies serialize.
4. Preserve safety boundaries. Ask one focused question only when the objective is missing, destructive, or has a safety/product ambiguity that repository exploration cannot resolve.
5. After the plan exists, continue directly to Phase 2.

## Phase 2: Create or update Boulder state

Write `.asterline/boulder.json` before implementation starts. Prefix session ids with `auggie:` so the continuation hook can identify its own session.

```json
{
  "schema_version": 2,
  "active_work_id": "<work-id>",
  "works": {
    "<work-id>": {
      "work_id": "<work-id>",
      "active_plan": ".asterline/plans/<plan-name>.md",
      "plan_name": "<plan-name>",
      "session_ids": ["auggie:<session_id>"],
      "status": "active",
      "worktree_path": null
    }
  }
}
```

For PR/branch work, `--worktree` is mandatory before implementation starts. Verify the path with `git worktree list --porcelain` or create it with `git worktree add <path> <branch-or-HEAD>`, then store the absolute path as `worktree_path`. All edits, commands, tests, and evidence capture must run inside that worktree.

## Phase 3: Execute the next checkbox

1. Read the full selected plan.
2. Find the first unchecked column-0 checkbox in `## TODOs` or `## Final Verification Wave`.
3. Ignore nested checkboxes under acceptance criteria, evidence, and definition-of-done sections.
4. Classify the checkbox tier and record it in its ledger entry. Default is LIGHT — a narrow change inside existing layers. Take HEAVY only on a fact you can point to: a new module / abstraction / domain model; auth, security, or session; an external integration; a DB schema or migration; concurrency or transaction boundaries; a cross-domain reshape-code; or the plan or user signals care. When unsure, take HEAVY; upgrade and redo skipped gates the moment a HEAVY fact surfaces; never downgrade.
5. Decompose that checkbox into atomic sub-tasks. Collect every other unchecked checkbox in the same plan wave whose dependencies are met — their lanes execute concurrently.
6. **DELEGATE EVERYTHING. YOU NEVER IMPLEMENT.** Dispatch ALL independent sub-tasks across those checkboxes in one parallel `delegation assignment` burst; serialize only named dependencies. Verification and checkbox marking stay per-checkbox.

Each sub-task message must include:

1. Goal and exact files or directories in scope.
2. When the task touches existing behavior: a baseline characterization test, written first, that pins current observable behavior and passes on the unchanged code (exact inputs, exact observable, exact assertion). Then the failing-first proof for the new behavior before production changes — a unit test where a seam exists, otherwise the sub-task's Manual-QA scenario captured failing. A test that mirrors its implementation (mock-call assertions, pinned constants) is not evidence.
3. Implementation constraints from the plan and project rule-sync.
4. Automated verification commands to run.
5. One Manual-QA channel, named with the exact tool and exact invocation (the literal `curl`, `send-keys`, `browser:control-in-app-browser` action, `page.click`, payload, selectors, and the binary observable that decides PASS/FAIL), not "verify it works". A LIGHT checkbox needs one real-surface proof of its deliverable, and auxiliary surfaces (CLI stdout, DB state diff, parsed config dump) are first-class when the surface is CLI- or data-shaped:
   - HTTP call: `curl -i` against the live endpoint.
   - Terminal / TUI: drive a real pty; `tmux send-keys` is fine for a boot/behavior smoke, but color/layout/CJK evidence goes through the xterm.js web terminal below, NEVER `tmux capture-pane`.
   - Browser use: in Auggie, use `browser:control-in-app-browser` first when available and the scenario does not need an authenticated or persistent user browser profile; otherwise drive the real page with Chrome, or agent-browser (https://github.com/vercel-labs/agent-browser) when Chrome is unavailable.
   - Computer use: OS-level GUI automation against the running desktop app when the surface is not a page.
   - TUI visual evidence: when a TUI claim needs visual QA or PR proof, run `node script/qa/web-terminal-visual-qa.mjs --command "<cmd>" --input "{Enter}" --evidence-dir <dir>` (real pty rendered through xterm.js in Chrome) and attach `terminal.png` plus `metadata.json`.
6. The adversarial classes that apply to this sub-task (from the 9 ultraqa classes) and how each is probed.
7. Required artifact path and cleanup receipt.

The 9 ultraqa classes are trigger-mapped: new input parsing → malformed input; untrusted external text → prompt injection; resumable or long-running flows → cancel/resume; generated or cached artifacts → stale state; uncommitted user files in scope → dirty worktree; long external commands → hung or long commands; new or timing-sensitive tests → flaky tests; log-based success claims → misleading success output; mid-operation interrupts → repeated interruptions. A class applies when its trigger fact holds. Probe each applicable class; record the rest as not-applicable with a one-line reason.

## Phase 4: Verify and record evidence

For each checkbox, complete all five gates before marking it done:

1. Plan reread: confirm the checkbox and acceptance criteria.
2. Automated verification: run tests, typecheck, lint, build, or the plan-specific equivalent.
3. Manual-QA channel: capture a real artifact, not a dry-run claim.
4. Adversarial QA: exercise every class the Phase 3 trigger map marks applicable and capture the observable result for each.
5. Cleanup: register every QA resource teardown as its own todo when spawned (QA scripts, tmux assets, browser sessions, PIDs, ports, containers, temp dirs), execute each, and capture the receipt. No QA asset is left running.

Append evidence to `.asterline/run-plan/ledger.jsonl`, one JSON object per line. Include at least `event`, `plan`, `task`, `session_id`, `commands`, `artifact`, `adversarial_classes`, and `cleanup` fields. `adversarial_classes` lists each probed class with its observable result and each ruled-out class with a one-line reason.

### Sisyphus-style completion contract

A worker done claim is never final: each implementation sub-task returns a `DoneClaim`, a different context runs `AdversarialVerify` probing or reproducing the claim, failures loop back to the executor, and only a confirmed verifier verdict becomes `FullyDone`.

```json
{
  "DoneClaim": {
    "task": "<task id/title>",
    "changed_files": ["path"],
    "tests": ["exact command + result"],
    "manual_qa": ["artifact path"],
    "cleanup": ["receipt"],
    "risks": ["known risk or none"]
  },
  "AdversarialVerify": {
    "verdict": "confirmed | false-positive | needs-fix | needs-human-review",
    "evidence": ["file path, command, log, artifact, or explicit not inspected"],
    "repro": "exact command or manual steps when available",
    "confidence": 0.0
  }
}
```

Rules:
- `confirmed` is the only pass verdict. `false-positive`, `needs-fix`, and `needs-human-review` all block checkbox completion.
- The verifier must be independent from the executor: use `asterline-work-reviewer`, a scoped `worker` reviewer, or root only when root did not implement or materially rewrite that task.
- A worker done claim must be independently verified before it becomes checkbox completion.
- On any non-confirmed verdict, append the feedback to the ledger, reset the checkbox work to in-progress, and re-dispatch the executor with the exact failure.
- The verifier must probe the applicable adversarial keys, including `stale_state`, `dirty_worktree`, and `misleading_success_output`, before allowing `FullyDone`.

## Phase 5: Mark progress

Only after verification passes:

1. Edit the plan checkbox from `- [ ]` to `- [x]`.
2. Re-read the plan and confirm the remaining count decreased.
3. Append a `task-completed` ledger entry.
4. Continue with the next checkbox. Do not ask whether to continue.

## Completion

When all top-level checkboxes in `## TODOs` and `## Final Verification Wave` are complete:

1. Run the plan's final verification commands.
2. Complete the **Global Review and Debugging Gate** before any completion claim, PR handoff, or branch handoff:
   - Invoke the `review-pass` skill with the final diff, changed files, user goal, constraints, run command, and verification evidence. All five review lanes must return PASS. A timeout, missing deliverable, ack-only child, `BLOCKED:`, or inconclusive lane is a gate failure, not approval.
   - Run a debug-trace-oriented runtime audit even when the review passes: name at least three plausible failure hypotheses for the changed surface, run the distinguishing checks against the actual artifact, and append the ruled-out or confirmed result to `.asterline/run-plan/ledger.jsonl`.
   - If any review lane or debug-trace hypothesis fails, invoke the `debug-trace` skill, confirm root cause with runtime evidence, add the minimal failing test or reproduction, fix it, rerun the affected verification, then rerun the Global Review and Debugging Gate.
   - Evidence hygiene is mandatory: redact or mask secrets and sensitive user data before writing `.asterline/run-plan/ledger.jsonl`, a PR body, or a handoff. Never include raw tokens, credentials, auth headers, cookies, API keys, env dumps, private logs, or PII; use concise summaries, lengths, hashes, or short non-sensitive prefixes instead.
   - If the work includes creating, updating, or handing off a PR, refresh `git status` and the PR/branch state after the gate, and include only redacted review/debug-trace evidence in the PR body or handoff.
3. If worktree mode was used, sync `.asterline/` state back to the main repo, merge or hand off exactly as requested, and remove the worktree only after successful merge or explicit handoff.
4. Remove or mark the Boulder work as completed.
5. Print an `ORCHESTRATION COMPLETE` block with the plan path, verification commands, Global Review and Debugging Gate verdict, artifacts, and cleanup receipts.

## Hard rule-sync

- No production change before a failing-first proof exists (unit test at a seam, otherwise the failing Manual-QA scenario), and no change to existing behavior before a baseline characterization test pins the current behavior and passes on the unchanged code.
- No `--dry-run` as completion evidence.
- No tests-only completion claim. A Manual-QA artifact is required.
- **NO DIRECT IMPLEMENTATION BY THE ORCHESTRATOR.** Root NEVER edits product files, writes tests, or runs QA itself — a spawned worker does.
- No completion claim while an applicable ultraqa adversarial class was never probed. Each applicable class needs a captured observable result; each skipped class needs a one-line not-applicable reason in the ledger.
- No `ORCHESTRATION COMPLETE`, final response, PR creation, or PR handoff before the Global Review and Debugging Gate passes with recorded evidence.
- No unprefixed session ids in Boulder state. Auggie sessions are always `auggie:<session_id>`.
- No stale-memory execution. The plan and ledger are the durable source of truth.
