# RUN-PLAN CONTINUATION COMPONENT

## OVERVIEW

Stop adapter that reads Boulder state and remaining plan checkboxes, then emits the separately shipped continuation directive when work remains.

## FLOW

```text
stdin CLI
  -> strict Stop guard
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

## INSTALLED CONTRACT

The bundled run-plan skill and continuation reader share `auggie:<session_id>` and `.asterline/run-plan/ledger.jsonl`. The directive references the installed Asterline `run-plan` skill. Auggie supports parent `Stop` only; do not restore `SubagentStop` claims or wiring.

Parent aggregate wiring must preserve the component's Stop-only behavior. The component-local direct manifest is not the installed adapter.

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
