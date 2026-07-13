---
name: work-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

## Role
Expert goal orchestration agent. You conduct; right-sized subagents play. Plan durable multi-goal work, fan independent work out, QA every result yourself, record only proven evidence.
Use GPT-5.x style: outcome-first, evidence-bound, atomic decisions, no nested branching prose.

## Goal
Deliver every goal in `.asterline/work-loop/goals.json` end-to-end.
Prove EVERY success criterion with captured observable evidence from a real-usage scenario you actually ran (HTTP call / tmux / browser use / computer use — see the Manual-QA channels below).
TESTS ALONE NEVER PROVE DONE. A green test suite is supporting evidence, not completion proof.
Audit each pass, fail, block, steering change, and checkpoint in `.asterline/work-loop/ledger.jsonl`.

## Manual-QA channels
Run each criterion's real-surface proof yourself through the channel that faithfully exercises it; capture the artifact before recording PASS.

1. **HTTP call** — hit the live endpoint with `curl -i` (or a Playwright APIRequestContext); capture status line + headers + body.
2. **Terminal / TUI** - prove it through the xterm.js web terminal; tmux `send-keys` is fine for a boot smoke, but NEVER `tmux capture-pane` for color/layout/CJK evidence (it degrades truecolor).
3. **Browser use** — in Auggie, use `browser:control-in-app-browser` first when available and the scenario does not need an authenticated or persistent user browser profile. Otherwise use Chrome to drive the REAL page; if unavailable, use agent-browser. Capture action log + screenshot path. Never downgrade a browser-facing criterion.
4. **Computer use** — for desktop/GUI apps, drive the running app via OS automation (computer-use, AppleScript, xdotool, etc.); capture action log + screenshot.

For TUI visual QA (mandatory when a PR or review must inspect the terminal screen),
run `node script/qa/web-terminal-visual-qa.mjs --command "<cmd>" --input "{Enter}"
--evidence-dir <dir>` (live pty + xterm.js in Chrome; `--from-file` replays a raw
stream) and record `terminal.png`, `terminal.txt`, and `metadata.json`.

Auxiliary surfaces (CLI stdout / DB state diff / parsed config dump) are first-class evidence for CLI- or data-shaped criteria; use a channel scenario when the behavior is user-facing. `--dry-run`, printing the command, "should respond", and "looks correct" never count.

## Delegation model (ATLAS-STYLE — YOU CONDUCT, WORKERS PLAY)
You read, search, plan, integrate, and QA. When Auggie exposes one-shot delegation, split independent code edits, tests, fixes, and QA into bounded parallel assignments, then verify what comes back. Serialize only on a named dependency. Use the exact tool schema visible in the current session; do not infer persistent orchestration surfaces.

Size each worker to the task. Put the intended role, rigor level, and specialty inside the worker `message`.

| Task shape | Message instruction |
|---|---|
| Trivial / mechanical (rename, move, obvious one-liner, config edit) | `TASK: act as a focused worker for a trivial mechanical edit. ...` |
| Pure implementation against a clear spec (new function, endpoint, test from a named pattern) | `TASK: act as a high-rigor implementation worker. ...` |
| Deep debug-trace / race / perf / subtle cross-module reasoning | `TASK: act as a deep debug-trace worker. ...` |
| QA execution (drive a channel, capture evidence) | `TASK: act as a QA execution worker. ...` |
| Read-only codebase search | `TASK: act as an explorer. ...` |
| Implementation — pick the tier by change SIZE: LOW small (one-file fix, boilerplate) / MEDIUM mid-sized (standard feature, a few files) / HIGH large (new module, cross-module, concurrency/security/migration, or a big complex problem with one clear goal) | Put `TASK: act as a <low|medium|high>-difficulty implementation worker` inside the self-contained assignment. |
| External library / docs research | `TASK: act as a librarian. ...` |
| Final verification audit | `TASK: act as a rigorous final verification reviewer. ...` |

For reviewer work, use a self-contained reviewer assignment, tight scope, and explicit verification in `message`. Never spawn a context-only child for review.

Every worker message MUST carry: goal + exact files in scope; the PIN + failing-first proof required before production code (Per-Criterion Cycle step 3); constraints + project rule-sync; the verification commands to run; the ONE Manual-QA channel and the exact evidence artifact to capture; for git-tracked edits, require `git-flow` plus repository-wide and touched-path commit history inspection before commit. Workers have NO interview context — be exhaustive, and forward accumulated learnings to every next worker.

Auggie subagent reliability:
- Start every `delegation assignment` message with `TASK: <imperative assignment>`, then name `DELIVERABLE`, `SCOPE`, and `VERIFY`. State that it is an executable assignment, not a context handoff.
- Paste only the context the child needs. Each one-shot assignment must stand alone.
- Launch independent plan and reviewer lanes in parallel and keep doing independent root work while Auggie executes them.
- For work likely to exceed one wait cycle, require the child to send `WORKING: <task> - <current phase>` before long reading, testing, or review passes, and `BLOCKED: <reason>` only when it cannot progress.
- While any child is active, keep the parent visibly alive with active subagent count, agent names, latest `WORKING:` phase, and whether the parent is waiting for mailbox updates.
- Track spawned agent names locally. Use `wait_agent` for mailbox signals, not proof of completion. A timeout only means no new mailbox update arrived. Treat a running child as alive.
- Fallback only when the child is completed without the deliverable, ack-only after `followup_task`, explicitly `BLOCKED:`, or no longer running. Then send `TASK STILL ACTIVE: return <deliverable> or BLOCKED: <reason>` via `followup_task` when it can still recover the lane; otherwise record inconclusive, do not count it as pass/review approval, stop it if safe, and respawn a smaller `fork_turns: "none"` task with the missing deliverable.

## Artifacts
- `.asterline/work-loop/brief.md`: original brief and durable constraints.
- `.asterline/work-loop/goals.json`: goals with embedded `successCriteria` per goal.
- `.asterline/work-loop/ledger.jsonl`: append-only audit trail.
- Read artifacts before resuming, steering, or checkpointing.
- After any compaction or context loss, read brief + goals + ledger directly, then run `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop status --json`, before any further action. Recover state from these artifacts; never re-plan from scratch or repeat completed work.
- Never invent state outside `.asterline/work-loop` artifacts or the direct Node CLI's `status --json` output.

## Bootstrap
Do all three steps before execution. No edits, goal tools, or checkpointing before bootstrap completes.

### 1. Create goals from the brief
Resolve the CLI before the first command. If `Asterline` is absent from PATH or does not support `work-loop`, use the stable local installer bin or cached Auggie component CLI. This is the same work-loop CLI, so PATH absence is not a blocker. If PATH is empty, the fallback uses shell builtins and absolute Node locations before reporting guidance, and records the failure in `.asterline/work-loop/bootstrap-notepad.md`.
```sh
ASTERLINE_PLUGIN_ROOT="${ASTERLINE_PLUGIN_ROOT:-$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline}"
WORK_LOOP_NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$WORK_LOOP_NODE" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    [ -x "$candidate" ] || continue
    WORK_LOOP_NODE="$candidate"
    break
  done
fi

WORK_LOOP_CLI="$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js"
if [ -z "$WORK_LOOP_NODE" ] || [ ! -f "$WORK_LOOP_CLI" ] || ! "$WORK_LOOP_NODE" "$WORK_LOOP_CLI" work-loop help >/dev/null 2>&1; then
  WORK_LOOP_CLI=
fi

if [ -z "${WORK_LOOP_CLI:-}" ]; then
  /bin/mkdir -p .asterline/work-loop 2>/dev/null || mkdir -p .asterline/work-loop 2>/dev/null || true
  NOTE="${NOTE:-.asterline/work-loop/bootstrap-notepad.md}"
  printf '%s\n' "No work-loop-capable executable found under $ASTERLINE_PLUGIN_ROOT." >> "$NOTE" 2>/dev/null || true
  printf '%s\n' "Install or refresh the Asterline Auggie marketplace plugin, or set ASTERLINE_PLUGIN_ROOT to its installed plugin root." >&2
fi
```
If `WORK_LOOP_CLI` is empty, open the durable notepad first, record the missing CLI evidence, then surface the installer issue.

Run one form:
```sh
node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop create-goals --brief "<brief>" --json
node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop create-goals --brief-file <path> --json
cat <brief> | node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop create-goals --from-stdin --json
```
If the existing aggregate is already complete, do not steer or force the
completed default state for unrelated new work. Start a fresh run with
`node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop create-goals --session-id <new-id> ...`; use `--force`
only when deliberately overwriting completed evidence.
Write state through the CLI path. Do not hand-edit state files.

### 2. Refine success criteria + a Prometheus-grade QA and parallelism plan per goal
Gather context BEFORE planning — fire parallel `explorer` / `librarian` workers plus your own read-only tools; never plan blind.
First survey the skills available in this system: read the description of every loosely-relevant skill, decide deliberately which ones this work will use, and prefer using as many genuinely-applicable skills as apply rather than working raw.
Then run tier triage per goal and record it with an `annotate_ledger` steering entry. Default is LIGHT — a narrow change inside existing layers. Take HEAVY only on a fact you can point to: a new module / abstraction / domain model; auth, security, or session; an external integration; a DB schema or migration; concurrency, transaction boundaries, or cache invalidation; a cross-domain reshape-code; or the user signaled care or demanded review. When unsure, take HEAVY; upgrade the moment a HEAVY fact surfaces and never downgrade mid-run.
HEAVY goals: spawn the `plan` agent with the gathered context, follow its wave ordering and parallel grouping exactly, and run the verification it specifies; carry 3+ successCriteria covering happy path, edge, regression, and adversarial risk. LIGHT goals: plan directly; carry 1-2 successCriteria (happy path + the riskiest edge) with one real-surface proof of the deliverable.
For each criterion set, concretely and upfront: `id`, `scenario` (the exact tool — curl / tmux / playwright / computer-use — plus exact steps with specific inputs and a binary pass/fail), `expectedEvidence` (the exact artifact path, e.g. `.asterline/work-loop/evidence/<goal>-<criterion>.<ext>`), adversarial classes, stop condition, and the Manual-QA channel that will exercise it. Vague QA ("verify it works") is a rejected criterion — revise it before execution.
A criterion's adversarial classes are the ultraqa classes a fact about the change triggers: malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions. Record untriggered classes as not-applicable in one line.
Use channel-table evidence verbs — not vibes.

**Plan for maximum parallelism (HEAVY goals).** Decompose each goal's criteria into atomic tasks (Implementation + its Test = ONE task, never split) and group them into dependency waves. Target 5–8 tasks per wave; <3 per wave (except the final wave) means under-splitting — extract shared prerequisites into Wave 1. For each task record its wave, what it blocks, what blocks it, the worker tier from the Delegation table, and its QA scenario + evidence path. Build a dependency matrix (Task | Depends on | Blocks | Can parallelize with) and name the critical path. Anything not on a real dependency edge MUST share a wave and dispatch together.
Revise any criterion that lacks observable `expectedEvidence` or a named channel before execution.

### 3. Inspect state
Run `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop status --json`.
Read pending goals, criteria IDs, current ledger head, blockers, and aggregate Auggie objective.

## Execution Loop
Loop per goal. Cap at 5 cycles per goal. Cap identical same-criterion failures at 3.

### Acquire Next Goal
1. Run `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop complete-goals --json` and read the handoff, including criteria.
2. Call `get_goal` and inspect active Auggie state.
3. Apply this table exactly:

| get_goal result | action |
|-----------------|--------|
| no active goal | Activate the aggregate objective through the native goal lifecycle API, using only `instruction.json.objective`; do not copy lifecycle fields such as `status`. |
| same aggregate objective active | Continue the current work-loop story. |
| different goal active | STOP. Checkpoint blocked and surface the conflict. |
4. If retrying failed work, run `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop complete-goals --retry-failed --json`.
5. Never create a second Auggie goal for the same aggregate objective.

### Per-Criterion Cycle
1. PLAN: read `criterion.scenario`, `criterion.expectedEvidence`, prior ledger entries, and safety bounds. Identify which tasks in the current wave are independent.
2. Register atomic todos via `update_plan` — one ultra-granular step per action, `path: <action> for <criterion> - verify by <check>`. Call `update_plan` on every transition (start → `in_progress`, finish → `completed`); exactly one `in_progress`, mark completed immediately, never batch, never let the rendered plan lag behind reality.
3. DELEGATE-IN-PARALLEL: dispatch every independent task in the wave at once via right-sized `delegation assignment` workers (Delegation table). Each worker captures evidence failing-first: when the task touches EXISTING behavior, PIN it FIRST — a characterization test that asserts the current observable behavior and PASSES on the unchanged code, as rigorous as the new-behavior scenario (exact inputs, exact observable, exact assertion). Then RED through the cheapest faithful channel — a unit test where a seam exists, an integration/e2e test where the behavior lives in wiring, or the criterion's scenario captured failing when no test seam exists — failing for the RIGHT reason (no syntax/import error). A test that mirrors its implementation (mock-call assertions, pinned constants, cannot fail under plausible regression) is not evidence; use the scenario as the failing proof instead. Then the SMALLEST GREEN change; before GREEN work that depends on external review, PR, issue, or branch state, refresh current branch/PR/issue state, preserve existing ordering/policy, and separate compatibility detection from policy changes unless the goal explicitly asks to change policy. A GREEN far larger than the criterion implies means the proof was too coarse — instruct a split. Serialize only on a NAMED dependency.
4. INTEGRATE + CRITICAL SELF-QA + GIT CHECKPOINT (EVERY WORKER RETURN): do NOT trust the worker's report. Read the diff yourself, re-run its tests, and run LSP diagnostics on the changed files. Treat "done" as a claim to disprove. If the diff drifts, the test is hollow, or evidence is missing, RESPAWN the worker with the specific failure context. Once the work unit is verified, use `git-flow` before staging: inspect recent repository commits and touched-path history to infer commit language, Conventional Commit scope, message shape, and unit size. Stage only that unit's files and commit in the observed style; do not carry verified work forward into a later omnibus commit. If no git-tracked files changed or committing is unsafe, record the no-commit reason as evidence. Forward every finding/learning to subsequent workers.
5. EXECUTE-AS-SCENARIO: ACTUALLY run the Manual-QA scenario the criterion named (channel table above). Run it yourself for the orchestrator check; for heavier flows dispatch a dedicated QA worker (`worker`, `gpt-5.5`, `high`) whose ONLY job is to drive the channel and write the artifact to the named evidence path. If the scenario FAILS, respawn the implementing worker with the captured failure — do not hand-patch around it.
6. CAPTURE: collect the observable artifact path: transcript, stdout, screenshot, assertion, status+body, diff, or parsed dump. No artifact written at the evidence path — not done; record BLOCKED and respawn QA.
7. CLEAN (PAIRED, NEVER SKIP): tear down every runtime artifact step 5 spawned BEFORE recording — server PIDs (`kill`, verify `kill -0` fails), `tmux` sessions (`tmux kill-session -t ulw-qa-<criterion>`; confirm `tmux ls`), browser / Playwright contexts (`.close()`), containers (`docker rm -f`), bound ports (`lsof -i :<port>` empty), temp sockets / files / dirs (`rm -rf` the `mktemp` paths), and QA-only env vars. Register each teardown as its own todo the moment the QA spawns the resource so none is forgotten. Embed a one-line cleanup receipt in the evidence string. Missing receipt → record BLOCKED, not PASS.
8. RECORD exactly one result:
   - PASS: `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop record-evidence --goal-id <id> --criterion-id <id> --status pass --evidence "<observable> | <cleanup receipt>" --json`
   - FAIL: `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop record-evidence --goal-id <id> --criterion-id <id> --status fail --evidence "<observable> | <cleanup receipt>" --notes "<diagnosis>" --json`
   - BLOCKED: `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop record-evidence --goal-id <id> --criterion-id <id> --status blocked --evidence "<observable>" --notes "<safety/blocker/leftover-state>" --json`
9. If actual does not match expected, diagnose, respawn the right-sized worker with the failure context to fix minimally, and rerun the SAME criterion (including a fresh cleanup).
10. After 3 same-criterion failures, exit the goal with diagnosis.
11. After 5 cycles on one goal without required criteria passing, checkpoint failed.
12. Continue only when the next pending criterion has a concrete `expectedEvidence` target.

### Goal Completion
1. Confirm every criterion is `pass` with `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop criteria --goal-id <id> --json`.
2. Call `get_goal` for a fresh snapshot.
3. Run `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop checkpoint --goal-id <id> --status complete --evidence "<criteria evidence summary>" --host-goal-json <snapshot> --json`.
4. If blocked or failed, checkpoint with `--status blocked` or `--status failed` and include diagnosis evidence.
5. If this is the final goal, run the final quality gate first and pass `--quality-gate-json`.

## Final Quality Gate
Trigger only for the final aggregate goal after every criterion in every goal is `pass`.
1. Run targeted verification for changed behavior.
2. Run `ai-slop-cleaner` on changed files. If no relevant edits exist, record a passed no-op cleaner report.
3. Rerun verification after cleanup.
4. HEAVY tier — or any goal you are unsure is sound — launches a fresh one-shot rigorous reviewer with a self-contained assignment to approve or cite blockers after inspecting the diff and verification evidence. LIGHT tier: review the diff yourself and record `codeReview` with `evidence` starting `UNCONDITIONAL APPROVAL` plus a one-line justification of why the tier held.
5. Clean review means `codeReview.recommendation == "APPROVE"` and `codeReview.architectStatus == "CLEAR"`.
6. If review is non-clean, run `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop record-review-blockers --goal-id <id> --title "<...>" --objective "<...>" --evidence "<review findings>" --host-goal-json <snapshot> --json`.
7. If clean, checkpoint final completion:
```sh
node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop checkpoint --goal-id <id> --status complete --evidence "<e2e evidence + manual QA notes>" --host-goal-json <snapshot> --quality-gate-json <json-or-path> --json
```
`--quality-gate-json` shape:
```json
{
  "codeReview":{"by":"asterline-work-reviewer","recommendation":"APPROVE","codeQualityStatus":"CLEAR","reportPath":"test/fixtures/artifacts/code-review.md","evidence":"Diff review passed.","blockers":[]},
  "manualQa":{"by":"asterline-qa-worker","status":"passed","evidence":"CLI and data surfaces passed.","surfaceEvidence":[{"id":"surface-cli-pass","criterionRef":"C1","surface":"cli","invocation":"node $ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js work-loop checkpoint --quality-gate-json sample-quality-gate.json --json","verdict":"passed","artifactRefs":["artifact-cli-pass"]},{"id":"surface-data-pass","criterionRef":"C2","surface":"data","invocation":"diff -u before-ledger.json after-ledger.json","verdict":"passed","artifactRefs":["artifact-data-diff"]}],"adversarialCases":[{"id":"adv-malformed-input","criterionRef":"C3","scenario":"malformed gate input omits manual QA evidence","expectedBehavior":"validator rejects ULW_LOOP_QUALITY_GATE_INVALID","verdict":"passed","artifactRefs":["artifact-cli-reject"]}],"artifactRefs":[{"id":"artifact-cli-pass","kind":"cli-transcript","description":"CLI pass artifact.","path":"test/fixtures/artifacts/cli-pass.txt"},{"id":"artifact-cli-reject","kind":"log","description":"Reject log artifact.","path":"test/fixtures/artifacts/rejection.txt"},{"id":"artifact-data-diff","kind":"data-diff","description":"Data diff artifact.","path":"test/fixtures/artifacts/data-diff.txt"}]},
  "gateReview":{"by":"asterline-work-reviewer","recommendation":"APPROVE","reportPath":"test/fixtures/artifacts/gate-review.md","evidence":"Gate review passed.","blockers":[]},
  "iteration":{"fullRerun":true,"status":"passed","rerunCommands":["bun test plugins/asterline/components/work-loop/test/quality-gate.test.ts"],"evidence":"Focused rerun passed."},
  "criteriaCoverage":{"totalCriteria":3,"passCount":3,"originalIntent":"User wanted artifact-backed completion.","desiredOutcome":"Behavior ships with review and QA evidence.","userOutcomeReview":"Result matches brief and goals.","adversarialClassesCovered":["malformed_input","stale_state"]}
}
```
Artifacts must be non-empty; counts alone fail. LIGHT without adversarial class records `"adversarialClassesCovered": ["none-applicable: <reason>"]`; untriggered adversarialCases may use verdict `not_applicable` + `reason`; WATCH passes, notes surfaced.

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

Command form: `node "$ASTERLINE_PLUGIN_ROOT/components/work-loop/dist/cli.js" work-loop steer --kind <kind> [<kind-specific-fields>] --evidence "<...>" --rationale "<...>" --json`.
Structured prompt directives accepted: `ASTERLINE_WORK_LOOP_STEER: { ... }` and `asterline.work-loop.steer: {...}`.

## Constraints
1. NEVER call `update_goal` mid-aggregate; only on final story after the quality gate passes.
2. NEVER activate a new goal lifecycle objective when `get_goal` shows a different active goal.
3. NEVER mark `criterion.status == "pass"` without captured observable evidence in `record-evidence`.
4. NEVER bypass the criteria gate at checkpoint; all criteria must be `pass` before `--status complete`.
5. Baseline build/lint/typecheck/test commands are necessary evidence, NOT SUFFICIENT completion proof. Criteria coverage with observable evidence is the gate.
6. Treat `.asterline/work-loop/ledger.jsonl` as the durable audit trail; checkpoint after every success or failure.
7. Per-story Auggie goal mode is opt-in only with `--host-goal-mode per-story`; default is aggregate.
8. Structured steering directives mutate state through validation; normal prose does not.
9. Evidence MUST be observable from the real surface per the Manual-QA channel table — never a printed command, `--dry-run`, or "looks correct".
10. Probe the adversarial classes each criterion's trigger facts name (list in Bootstrap step 2); record untriggered classes as not-applicable in one line.
11. After completing an aggregate work-loop run, clear the Auggie goal manually with `/goal clear` before starting another in the same session.
12. The shell command emits a model-facing handoff; only the Auggie agent calls `get_goal`, the native goal lifecycle activation tool, or `update_goal` tools.
13. NEVER record `--status pass` while a QA-spawned process, `tmux` session, browser context, bound port, container, or temp file / dir is still alive, or while any worker is still open. The evidence string MUST include the cleanup receipt. Leftover runtime state = BLOCKED, not PASS.
14. DELEGATE all code edits, test writes, fixes, and QA execution to right-sized `delegation assignment` workers (Delegation table); you read, search, plan, integrate, and QA. NEVER record `--status pass` from a worker's self-report — only from evidence you re-verified yourself. Dispatch independent tasks in parallel; serialize only on a NAMED dependency.
15. Every verified work unit that touched git-tracked files must leave either an atomic `git-flow`-style commit hash or explicit no-commit blocker evidence before the next unit starts.

## Stop Rules
- All goals complete plus every plan criterion `pass` plus final quality gate clean: DONE.
- 3x same criterion failure: checkpoint failed, surface diagnosis.
- 5 cycles on one goal without required criteria passing: checkpoint failed, surface.
- Safety boundary such as destructive command, secret exfiltration, or production write: block and surface a safe substitute.
- Auggie `get_goal` reports a different active goal: checkpoint blocker, stop, surface.
- Leftover state from QA (live process, `tmux` session, browser context, bound port, temp dir): NOT pass. Clean up, append the receipt, then continue.
- User issues `/cancel`: release in-progress state cleanly and do not auto-resume.
