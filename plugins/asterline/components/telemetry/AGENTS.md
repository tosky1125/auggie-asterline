# TELEMETRY COMPONENT

## OVERVIEW

Silent SessionStart activity telemetry with daily local deduplication. The hook ignores session/transcript payload fields, emits no conversation context, and degrades to empty output on telemetry failures.

## DATA FLOW

- `src/cli.ts`: validates `hook session-start`; malformed/unknown payloads no-op.
- `src/asterline-hook.ts`: constructs client, derives distinct ID, captures once, shuts down.
- `src/posthog.ts`: metadata envelope and lazy PostHog adapter.
- `src/posthog-activity-state.ts`: once-per-UTC-day gate.
- `src/data-path.ts`, `atomic-write.ts`, `diagnostics.ts`: local state and retained diagnostics.
- `src/product-identity.ts`: event/cache/version constants used by aggregate contract tests.

## LOCAL CONTRACTS

- Telemetry failure paths stay silent, exit 0, and return empty stdout. Unsupported CLI commands may return usage failure.
- Never emit `additionalContext` or `systemMessage`.
- PostHog is the only network sink. New events need independent dedup state rather than replacing the daily-active slot.
- Do not capture prompt, transcript, cwd, API keys, or raw hook payload fields.
- New environment variables require matching README/privacy documentation.

## PRIVACY / INTEGRITY NOTES

The current payload includes a stable hostname-derived hash plus machine/OS/locale metadata, and geo-IP is not disabled. Describe it as pseudonymous device activity, not anonymous data. Local diagnostics currently persist raw error messages with default permissions; add secret/path redaction and user-only file mode before treating them as privacy-safe.

The existing README and former AGENTS references to an absent cross-package identity file/test are not valid in this checkout. The aggregate contract test is the live identity assertion.

Vendored `posthog-node` lacks the exact path currently imported by telemetry; lazy import failure silently selects the no-op client. Fix the consumer path and add a capture-envelope test rather than adding a vendor shim.

## VALIDATION

```bash
npm run check
npm test
printf '%s\n' '{"hook_event_name":"SessionStart","session_id":"qa","transcript_path":null,"cwd":"/tmp","model":"qa","permission_mode":"default","source":"startup"}' | ASTERLINE_DISABLE_POSTHOG=1 node dist/cli.js hook session-start
```

Keep routine smoke tests opted out so they cannot send device metadata. Exercise constructor/capture/shutdown failure, dedup, and a real lazy-import success path only in a stubbed test harness. Then run the inherited plugin packaging gate.

## ANTI-PATTERNS

- Do not infer network success from empty hook output.
- Do not weaken privacy wording to match stale README claims.
- Do not inject telemetry status into the conversation.
