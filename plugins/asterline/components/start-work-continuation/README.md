# asterline-run-plan-continuation

Asterline Stop-hook continuation injector for the Auggie `run-plan` skill.

It reads `.asterline/boulder.json` in the hook payload `cwd`, resolves the active work, inspects the active plan for incomplete top-level checkboxes, and emits Asterline Stop-hook JSON when the plan still has work:

```json
{"decision":"block","reason":"<directive>"}
```

The `reason` is loaded from `directive.md` on every invocation and filled with current plan state. The hook returns no output when `stop_hook_active` is `true`, when no active Boulder work exists, when the work is completed, when the active work is not tied to `auggie:<session_id>`, or when all top-level plan checkboxes are complete. Auggie does not expose `SubagentStop`, so this component intentionally supports only the parent `Stop` event.

This pairs with the installed skill at `plugins/asterline/skills/run-plan/SKILL.md`. That skill writes `.asterline/boulder.json` with session ids prefixed as `auggie:` and evidence under `.asterline/run-plan/ledger.jsonl`, so the hook continues only its own active Auggie session.

## Counted plan checkboxes

Only column-0 checkboxes under these sections are counted:

- `## TODOs`
- `## Final Verification Wave`

Nested checkboxes under `### Acceptance Criteria`, `### Evidence`, and `### Definition of Done` are ignored.

## Smoke test

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/.asterline/plans"
cat > "$TMP/.asterline/plans/test.md" <<EOF
## TODOs
- [ ] Task one
- [ ] Task two
EOF
cat > "$TMP/.asterline/boulder.json" <<EOF
{"schema_version":2,"active_work_id":"w1","works":{"w1":{"work_id":"w1","active_plan":".asterline/plans/test.md","plan_name":"test","session_ids":["auggie:smoke-session"],"status":"active"}}}
EOF
PAYLOAD='{"session_id":"smoke-session","turn_id":"t1","transcript_path":"","cwd":"'"$TMP"'","hook_event_name":"Stop","model":"gpt-5.5","permission_mode":"default","stop_hook_active":false}'
echo "$PAYLOAD" | node dist/cli.js hook stop

PAYLOAD_LOOP='{"session_id":"smoke-session","turn_id":"t1","transcript_path":"","cwd":"'"$TMP"'","hook_event_name":"Stop","model":"gpt-5.5","permission_mode":"default","stop_hook_active":true}'
echo "$PAYLOAD_LOOP" | node dist/cli.js hook stop

rm -rf "$TMP"
```

Expect the first command to print JSON containing `"decision":"block"`; expect the anti-loop command to print nothing.

## License

MIT. See `LICENSE`.

## Privacy

This plugin only reads local hook payloads, `.asterline/boulder.json`, the active plan, and the bundled directive. It makes no network calls and stores no telemetry.
