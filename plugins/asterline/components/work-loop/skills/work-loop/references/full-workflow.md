---
name: work-loop
description: Durable evidence-bound goal loop for systematic Asterline delivery on Auggie.
metadata:
  short-description: Durable evidence-bound work loop
---

## Role
Expert goal orchestration agent. Plan durable multi-goal work, split only independent bounded tasks in parallel, QA every returned result yourself, and record only proven evidence.
Use GPT-5.x style: outcome-first, evidence-bound, atomic decisions, no nested branching prose.

## Goal
Deliver every goal in `.asterline/work-loop/goals.json` end-to-end.
Prove EVERY success criterion with captured observable evidence from a real-usage scenario you actually ran (HTTP call / tmux / browser use / computer use — see the Manual-QA channels below).
TESTS ALONE NEVER PROVE DONE. A green test suite is supporting evidence, not completion proof.
Audit each pass, fail, block, steering change, and checkpoint in `.asterline/work-loop/ledger.jsonl`.

## Manual-QA channels
Run each criterion's real-surface proof yourself through the channel that faithfully exercises it; capture the artifact before recording PASS.

1. **HTTP call** — hit the live endpoint with `curl -i` (or a Playwright APIRequestContext); capture status line + headers + body.
2. **tmux** — `tmux new-session -d -s work-loop-qa-<criterion>`, drive with `send-keys`, dump via `tmux capture-pane -pS -E -`; transcript is the artifact.
3. **Browser use** — use Chrome to drive the REAL page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Capture action log + screenshot path. Never downgrade to a non-browser surface for a browser-facing criterion.
4. **Computer use** — when the surface is a desktop/GUI app rather than a page, drive it via OS-level automation (a computer-use agent, AppleScript, xdotool, etc.) against the running app; capture action log + screenshot. Use this for any non-browser GUI criterion.

Auxiliary surfaces (CLI stdout / DB state diff / parsed config dump) are first-class evidence for CLI- or data-shaped criteria; use a channel scenario when the behavior is user-facing. `--dry-run`, printing the command, "should respond", and "looks correct" never count.

## Parallel task model
Auggie supports parallel task decomposition only. It does not provide a work-loop contract for persistent teams, worker-to-worker messaging, worker resumption, or durable worker threads. Keep durable truth in the work-loop artifacts, launch only independent bounded tasks through the agent tool currently available, and verify each returned result. Serialize when one task consumes another's output or edits the same file.

Size each assignment to the task and include its goal, exact file scope, constraints, failing-first proof, verification commands, and evidence path.
A test that merely mirrors its implementation is tautological and does not count as proof; assert the observable contract instead.

| Task shape | Message instruction |
|---|---|
| Trivial / mechanical (rename, move, obvious one-liner, config edit) | `TASK: act as a focused worker for a trivial mechanical edit. ...` |
| Pure implementation against a clear spec (new function, endpoint, test from a named pattern) | `TASK: act as a high-rigor implementation worker. ...` |
| Deep debugging / race / perf / subtle cross-module reasoning | `TASK: act as a deep debugging worker. ...` |
| QA execution (drive a channel, capture evidence) | `TASK: act as a QA execution worker. ...` |
| Read-only codebase search | `TASK: act as an explorer. ...` |
| External library / docs research | `TASK: act as a librarian. ...` |
| Final verification audit | `TASK: act as a rigorous final verification reviewer. ...` |

For reviewer work, use `review-pass` with a self-contained assignment, tight scope, and explicit verification. Never count a worker report as approval until the leader reproduces its evidence.

## Artifacts
- `.asterline/work-loop/brief.md`: original brief and durable constraints.
- `.asterline/work-loop/goals.json`: goals with embedded `successCriteria` per goal.
- `.asterline/work-loop/ledger.jsonl`: append-only audit trail.
- Read artifacts before resuming, steering, or checkpointing.
- After any compaction or context loss, re-read brief + goals + ledger FIRST with ordinary file reads, then `work_loop status --json`, before any further action. Recover state from these artifacts; never re-plan from scratch or repeat completed work.
- Never invent state outside `.asterline/work-loop` artifacts or `work_loop status --json`.

## Bootstrap
Do all three steps before execution. No edits, goal tools, or checkpointing before bootstrap completes.

### 1. Create goals from the brief
Define the documented shell function before the first command. It invokes the self-contained bundle shipped by the Auggie marketplace plugin and does not depend on npm linking a package bin.
```sh
WORK_LOOP_CLI="$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline/components/work-loop/dist/cli.js"
work_loop() { node "$WORK_LOOP_CLI" work-loop "$@"; }
test -f "$WORK_LOOP_CLI" || { printf '%s\n' "Asterline work-loop bundle is missing: $WORK_LOOP_CLI" >&2; return 1; }
```
If the bundle is missing, record that exact installed path in the durable notepad and surface the marketplace installation issue.

Run one form:
```sh
work_loop create-goals --brief "<brief>" --json
work_loop create-goals --brief-file <path> --json
cat <brief> | work_loop create-goals --from-stdin --json
```
If the existing aggregate is already complete, do not steer or force the
completed default state for unrelated new work. Start a fresh run with
`work_loop create-goals --session-id <new-id> ...`; use `--force`
only when deliberately overwriting completed evidence.
Write state through the CLI path. Do not hand-edit state files.

### 2. Refine success criteria + a Prometheus-grade QA and parallelism plan per goal
Gather context BEFORE planning — fire parallel `explorer` / `librarian` workers plus your own read-only tools; never plan blind.
First survey the skills available in this system: read the description of every loosely-relevant skill, decide deliberately which ones this work will use, and prefer using as many genuinely-applicable skills as apply rather than working raw.
Then run tier triage per goal and record it with an `annotate_ledger` steering entry. Default is LIGHT — a narrow change inside existing layers. Take HEAVY only on a fact you can point to: a new module / abstraction / domain model; auth, security, or session; an external integration; a DB schema or migration; concurrency, transaction boundaries, or cache invalidation; a cross-domain refactor; or the user signaled care or demanded review. When unsure, take HEAVY; upgrade the moment a HEAVY fact surfaces and never downgrade mid-run.
HEAVY goals: spawn the `plan` agent with the gathered context, follow its wave ordering and parallel grouping exactly, and run the verification it specifies; carry 3+ successCriteria covering happy path, edge, regression, and adversarial risk. LIGHT goals: plan directly; carry 1-2 successCriteria (happy path + the riskiest edge) with one real-surface proof of the deliverable.
For each criterion set, concretely and upfront: `id`, `scenario` (the exact tool — curl / tmux / playwright / computer-use — plus exact steps with specific inputs and a binary pass/fail), `expectedEvidence` (the exact artifact path, e.g. `.asterline/work-loop/evidence/<goal>-<criterion>.<ext>`), adversarial classes, stop condition, and the Manual-QA channel that will exercise it. Vague QA ("verify it works") is a rejected criterion — revise it before execution.
A criterion's adversarial classes are the ultraqa classes a fact about the change triggers: malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions. Record untriggered classes as not-applicable in one line.
Use evidence verbs from the channel table (tmux transcript, curl status+body, browser screenshot, computer-use action log, CLI stdout, DB diff, parsed config dump) — not vibes.

**Plan for maximum parallelism (HEAVY goals).** Decompose each goal's criteria into atomic tasks (Implementation + its Test = ONE task, never split) and group them into dependency waves. Target 5–8 tasks per wave; <3 per wave (except the final wave) means under-splitting — extract shared prerequisites into Wave 1. For each task record its wave, what it blocks, what blocks it, the worker tier from the Delegation table, and its QA scenario + evidence path. Build a dependency matrix (Task | Depends on | Blocks | Can parallelize with) and name the critical path. Anything not on a real dependency edge MUST share a wave and dispatch together.
Revise any criterion that lacks observable `expectedEvidence` or a named channel before execution.

### 3. Inspect state
Run `work_loop status --json`.
Read pending goals, criteria IDs, current ledger head, blockers, and aggregate Asterline objective.

## Execution Loop
Loop per goal. Cap at 5 cycles per goal. Cap identical same-criterion failures at 3.

### Acquire Next Goal
1. Run `work_loop complete-goals --json` and read the handoff, including criteria.
2. Call `get_goal` and inspect active Asterline state.
3. Apply this table exactly:

| get_goal result | action |
|-----------------|--------|
| no active goal | Start the host goal with objective only from `instruction.json.objective`; do not copy lifecycle fields such as `status`. |
| same aggregate objective active | Continue the current work-loop story. |
| different goal active | STOP. Checkpoint blocked and surface the conflict. |
4. If retrying failed work, run `work_loop complete-goals --retry-failed --json`.
5. Never create a second host goal for the same aggregate objective.

### Per-Criterion Cycle
1. PLAN: read `criterion.scenario`, `criterion.expectedEvidence`, prior ledger entries, and safety bounds. Identify which tasks in the current wave are independent.
2. Register atomic todos via `update_plan` — one ultra-granular step per action, `path: <action> for <criterion> - verify by <check>`. Call `update_plan` on every transition (start → `in_progress`, finish → `completed`); exactly one `in_progress`, mark completed immediately, never batch, never let the rendered plan lag behind reality.
3. SPLIT-IN-PARALLEL: dispatch independent bounded tasks together through the agent tool available in the current Auggie host. Each task captures failing-first evidence: PIN existing behavior, prove RED through the cheapest faithful channel, then make the smallest GREEN change. Do not assume a persistent team, inter-worker messages, worker resumption, or durable threads. Serialize only on a named dependency.
4. INTEGRATE + CRITICAL SELF-QA + GIT CHECKPOINT: do not trust a returned report. Read the diff, rerun tests, and inspect diagnostics. If the diff drifts or evidence is hollow, issue a fresh bounded assignment with the failure context. Use `git-flow` for authorized atomic commits.
5. EXECUTE-AS-SCENARIO: actually run the Manual-QA scenario. For a heavy flow, a bounded QA assignment may drive one channel and return one artifact; the leader still reproduces or inspects it.
6. CAPTURE: collect the observable artifact path. No artifact at that path means BLOCKED.
7. CLEAN: tear down every process, tmux session (`work-loop-qa-<criterion>`), browser context, container, port, socket, file, directory, environment override, and worker resource before recording. Include the cleanup receipt in evidence.
8. RECORD exactly one result:
   - PASS: `work_loop record-evidence --goal-id <id> --criterion-id <id> --status pass --evidence "<observable> | <cleanup receipt>" --json`
   - FAIL: `work_loop record-evidence --goal-id <id> --criterion-id <id> --status fail --evidence "<observable> | <cleanup receipt>" --notes "<diagnosis>" --json`
   - BLOCKED: `work_loop record-evidence --goal-id <id> --criterion-id <id> --status blocked --evidence "<observable>" --notes "<safety/blocker/leftover-state>" --json`
9. If actual does not match expected, diagnose, respawn the right-sized worker with the failure context to fix minimally, and rerun the SAME criterion (including a fresh cleanup).
10. After 3 same-criterion failures, exit the goal with diagnosis.
11. After 5 cycles on one goal without all criteria passing, checkpoint failed.
12. Continue only when the next pending criterion has a concrete `expectedEvidence` target.

### Goal Completion
1. Confirm every essential criterion is `pass` for an intermediate aggregate goal; final completion requires every criterion across the plan.
2. Call `get_goal` for a fresh snapshot.
3. Run `work_loop checkpoint --goal-id <id> --status complete --evidence "<criteria evidence summary>" --host-goal-json <snapshot> --json`.
4. If blocked or failed, checkpoint with `--status blocked` or `--status failed` and include diagnosis evidence.
5. If this is the final goal, run the final quality gate first and pass `--quality-gate-json`.

## Final Quality Gate
Trigger only when one goal remains and all its criteria are passing.
1. Run targeted verification for changed behavior.
2. Run `clean-ai-code` on changed files. If no relevant edits exist, record a passed no-op cleaner report.
3. Rerun verification after cleanup.
4. Run `review-pass` with bounded `judge`, `operator`, and `skeptic` assignments. The leader reproduces all evidence.
5. Clean review means `codeReview.recommendation == "APPROVE"`, `codeReview.codeQualityStatus` is `CLEAR` or documented `WATCH`, and both blocker arrays are empty.
6. If review is non-clean, run `work_loop record-review-blockers --goal-id <id> --title "<...>" --objective "<...>" --evidence "<review findings>" --host-goal-json <snapshot> --json`.
7. If clean, checkpoint final completion:
```sh
work_loop checkpoint --goal-id <id> --status complete --evidence "<e2e evidence + manual QA notes>" --host-goal-json <snapshot> --quality-gate-json <json-or-path> --json
```
`--quality-gate-json` shape:
```json
{
  "codeReview": { "by": "judge", "recommendation": "APPROVE", "codeQualityStatus": "CLEAR", "reportPath": "<currentAttemptDir>/code.md", "evidence": "review synthesis", "blockers": [] },
  "manualQa": { "by": "operator", "status": "passed", "evidence": "real-surface QA", "surfaceEvidence": [{ "id": "S1", "criterionRef": "C001", "surface": "cli", "invocation": "node --test", "verdict": "passed", "artifactRefs": ["A1"] }, { "id": "S2", "criterionRef": "C003", "surface": "cli", "invocation": "node --test", "verdict": "passed", "artifactRefs": ["A1"] }], "adversarialCases": [{ "id": "X1", "criterionRef": "C002", "scenario": "malformed input", "expectedBehavior": "typed rejection", "verdict": "passed", "artifactRefs": ["A1"] }], "artifactRefs": [{ "id": "A1", "kind": "cli-transcript", "description": "QA transcript", "path": "<currentAttemptDir>/qa.log" }] },
  "gateReview": { "by": "skeptic", "recommendation": "APPROVE", "reportPath": "<currentAttemptDir>/gate.md", "evidence": "gate review", "blockers": [] },
  "iteration": { "fullRerun": true, "status": "passed", "rerunCommands": ["node --test"], "evidence": "post-cleaner rerun" },
  "criteriaCoverage": { "totalCriteria": N, "passCount": N, "originalIntent": "...", "desiredOutcome": "...", "userOutcomeReview": "...", "adversarialClassesCovered": ["malformed_input"] }
}
```

Every plan criterion must appear exactly once across `surfaceEvidence` and `adversarialCases`. Set both coverage counts from the current plan rather than supplying independent totals. A bare `C001` is valid only when that criterion id is unique across the plan; use the qualified `G001:C001` form when multiple goals reuse the same criterion id. Artifact and report paths must be non-empty regular files from `currentAttemptDir`; directories and symlinks are rejected.
Obtain `<currentAttemptDir>` from `work_loop status --json`. Every referenced file must already exist there and be non-empty. If no adversarial class applies, record `"adversarialClassesCovered": ["none-applicable: <reason>"]` and a structured `not_applicable` adversarial case with its reason.

## Dynamic Steering
Use steering only for structured evidence-backed mutation. Reject natural-language steering requests.

| Kind | When to use | Required fields |
|------|-------------|-----------------|
| add_subgoal | Real blocker found; new story required | `--title`, `--objective`, `--evidence`, `--rationale` |
| split_subgoal | Story too large; needs decomposition | `--goal-id`, `--children` JSON, `--evidence`, `--rationale` |
| reorder_pending | Discovered dependency order | `--order` JSON array of ids, `--evidence`, `--rationale` |
| revise_pending_wording | Title/objective ambiguous | `--goal-id`, `--title?`, `--objective?`, `--evidence`, `--rationale` |
| revise_criterion | Criterion lacks observable PASS evidence | `--goal-id`, `--criterion-id`, `--scenario?`, `--expected-evidence?`, `--evidence`, `--rationale` |
| annotate_ledger | Audit-only note | `--evidence`, `--rationale` |
| mark_blocked_superseded | Old story replaced by new evidence | `--goal-id`, `--replacements?`, `--evidence`, `--rationale` |

Command form: `work_loop steer --kind <kind> [<kind-specific-fields>] --evidence "<...>" --rationale "<...>" --json`.
Structured prompt directives accepted: `ASTERLINE_WORK_LOOP_STEER: { ... }` and `asterline.work-loop.steer: {...}`.

## Constraints
1. NEVER call `update_goal` mid-aggregate; only on final story after the quality gate passes.
2. Never start a new host goal when `get_goal` shows a different active goal.
3. NEVER mark `criterion.status == "pass"` without captured observable evidence in `record-evidence`.
4. NEVER bypass the criteria gate: intermediate aggregate goals require essential criteria; final completion requires every plan criterion.
5. Baseline build/lint/typecheck/test commands are necessary evidence, NOT SUFFICIENT completion proof. Criteria coverage with observable evidence is the gate.
6. Treat `.asterline/work-loop/ledger.jsonl` as the durable audit trail; checkpoint after every success or failure.
7. Per-story host goal mode is opt-in only with `--host-goal-mode per-story`; default is aggregate.
8. Structured steering directives mutate state through validation; normal prose does not.
9. Evidence MUST be observable from the real surface: tmux transcript, curl status+body, browser/Playwright assertion, CLI stdout, DB state diff, parsed config dump.
10. Probe the adversarial classes each criterion's trigger facts name (list in Bootstrap step 2); record untriggered classes as not-applicable in one line.
11. After completing an aggregate work-loop run, clear the host goal manually with `/goal clear` before starting another in the same session.
12. The shell command emits a model-facing handoff; only the Asterline agent manages the host goal lifecycle tools.
13. NEVER record `--status pass` while a QA-spawned process, `tmux` session, browser context, bound port, container, or temp file / dir is still alive, or while any worker is still open. The evidence string MUST include the cleanup receipt. Leftover runtime state = BLOCKED, not PASS.
14. Split independent bounded edits and QA tasks in parallel through the current Auggie agent tool. Never infer persistent teams, messaging, resumption, or threads, and never record PASS from a worker report without leader verification.
15. Every verified work unit that touched git-tracked files must leave either an atomic `git-master`-style commit hash or explicit no-commit blocker evidence before the next unit starts.

## Stop Rules
- All goals complete plus all criteria `pass` plus final quality gate clean: DONE.
- 3x same criterion failure: checkpoint failed, surface diagnosis.
- 5 cycles on one goal without all-pass: checkpoint failed, surface.
- Safety boundary such as destructive command, secret exfiltration, or production write: block and surface a safe substitute.
- Asterline `get_goal` reports a different active goal: checkpoint blocker, stop, surface.
- Leftover state from QA (live process, `tmux` session, browser context, bound port, temp dir): NOT pass. Clean up, append the receipt, then continue.
- User issues `/cancel`: release in-progress state cleanly and do not auto-resume.
