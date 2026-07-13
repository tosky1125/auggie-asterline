# RUN-PLAN CONTINUATION COMPONENT

## OVERVIEW

Stop/SubagentStop adapter that reads Boulder state and remaining plan checkboxes, then emits the separately shipped continuation directive when work remains.

## FLOW

```text
stdin CLI
  -> strict Stop/SubagentStop guard
  -> .asterline/boulder.json lookup
  -> plan checkbox count
  -> directive.md placeholder render
  -> block JSON
```

## LOCAL CONTRACTS

- Malformed input, recursive stop hooks, missing state, completed plans, and context-pressure transcripts must not block a turn.
- No network calls. Keep directive prose in `directive.md`, not TypeScript.
- Count only column-zero checkboxes under `## TODOs` and `## Final Verification Wave`; fall back to all column-zero checkboxes only when both sections are absent.
- Active and paused Boulder works are eligible when their session ID matches exactly.
- `directive.md` is a runtime asset beside dist; tsc does not copy it.
- Spawned CLI tests execute committed dist; the inherited component build-order rule applies.

## INSTALLED CONTRACT DRIFT

The bundled run-plan skill writes `auggie:<session_id>` and `.asterline/run-plan/ledger.jsonl`. Current source/dist reader expects `asterline:<session_id>` and `.asterline/start-work/ledger.jsonl`; the directive also references an absent upstream skill path. A real `auggie:` probe currently emits nothing. Treat this as an unresolved integration defect; do not encode the stale prefix/ledger in new tests.

Parent aggregate wiring uses `hooks/bin/run-plan-{,subagent-}stop.sh`; the component-local direct manifest is not the installed adapter.

## VALIDATION

```bash
npm run check
npm test
```

The spawned CLI tests own temporary Boulder/plan payloads. Include one installed-contract fixture using `auggie:` state and the run-plan ledger path, then run the inherited plugin packaging gate.

## ANTI-PATTERNS

- Do not inline or duplicate the directive.
- Do not let tests preserve obsolete session/ledger names merely because current dist uses them.
- Do not run tests against stale dist.
