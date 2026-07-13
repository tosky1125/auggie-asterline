---
name: team-mode
description: "Auggie에서는 병렬 작업 분할만 지원하며 지속 팀, 메시징, 재개, 스레드는 지원하지 않습니다. Use when the user asks for team mode, a team of agents, or parallel workers and the work can be split into bounded independent subtasks with disjoint ownership."
---

# Auggie Team Mode

Auggie에서는 병렬 작업 분할만 지원하며 지속 팀, 메시징, 재개, 스레드는 지원하지 않습니다.

Treat team mode as one-shot parallel decomposition. Use the available Auggie subagent or delegation surface to run bounded independent subtasks and collect each terminal result; the parent verifies and integrates the work.

## Capability boundary

Support only this lifecycle:

1. Confirm that the goal is clear and contains at least two bounded independent subtasks.
2. Inspect the currently available Auggie subagent or delegation surface. Do not invent a tool name or capability that is not visible.
3. Give each worker disjoint ownership of files, outputs, or an investigation lens. Include all required context and verification commands in its one-shot assignment.
4. Launch independent workers in parallel. Avoid concurrent writes to the same file or shared mutable state.
5. Observe workers through the host's available completion surface and collect every terminal result. Silence is not proof of success.
6. Have the parent verify the returned evidence, inspect any changes, rerun relevant checks, and integrate only confirmed results.

If the task does not split safely, explain the overlap and continue serially. If no compatible Auggie delegation surface is available, state that limitation and continue serially.

## Unsupported requests

- Durable team state and persistent rosters are unavailable. Do not create hidden team-state files or imply that a roster survives the current run.
- A mailbox and durable messaging are unavailable. Do not promise worker-to-worker communication or later delivery.
- If the user asks to `resume team thread`, say it is unavailable in Auggie and offer a new one-shot decomposition from the current context.
- The ability to create, title, or archive threads is unavailable. Do not claim a thread lifecycle exists.
- Cross-turn member identity is unavailable. A later run must not pretend to be the same worker.
- Automated worktree merge behavior is unavailable. Do not promise a worktree merge or hidden integration machinery; the parent may perform ordinary repository verification and integration separately when authorized.

Never copy or emulate another harness's durable team scripts, state directories, thread controls, or transport vocabulary. Do not turn a one-shot worker into a fictional persistent teammate.

## Assignment contract

Make every worker prompt self-contained:

- State one concrete deliverable and its exact ownership boundary.
- List paths it may change and paths it must not change.
- Include relevant facts, constraints, and acceptance criteria.
- Require exact verification commands and a concise terminal report.
- Tell the worker not to stage, commit, push, or integrate unless the user separately authorized that action and assigned it to that worker.

The parent owns conflict prevention, result collection, verification, and final integration. A worker report is evidence to inspect, not an automatic pass.

## Example

Example decomposition:

- Worker A owns only `src/parser/**` and implements the agreed parser behavior.
- Worker B owns only `test/fixtures/**` and prepares the fixed acceptance fixtures.
- The parent waits for both terminal results, checks that ownership did not overlap, runs the combined test command, and only then integrates the changes.

For a request such as "resume the old team and message worker A," refuse the persistent-team portion, reconstruct only the necessary current context, and offer fresh independent one-shot assignments.
