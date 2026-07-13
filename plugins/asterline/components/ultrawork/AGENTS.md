# DEEP-RESEARCH TRIGGER COMPONENT

## OVERVIEW

UserPromptSubmit detector for word-boundary `ultrawork|ulw`, exposed publicly as Asterline deep research. It injects the separate directive once and suppresses malformed, duplicate, identifier-like, or context-pressure triggers.

## LAYOUT

- `src/cli.ts`: stdin/command adapter.
- `src/asterline-hook.ts`: pure matching, transcript dedup, pressure suppression.
- `src/directive.ts`: loads `directive.md` at runtime.
- `directive.md`: shipped orchestration policy; never inline it in TypeScript.
- `dist/`: committed JS/declarations used by aggregate wrappers.
- `agents/*.toml`: upstream component assets not directly exported by the Auggie plugin manifest.

## LOCAL CONTRACTS

- Valid hook paths fail open and make no network calls.
- Preserve case-insensitive word boundaries: `ulw_helper` and similar identifiers must not trigger.
- Search only the bounded transcript tail for dedup/context-pressure markers.
- Keep directive text external and measure size/entropy after edits; the formerly referenced prompt skill is not present in this checkout.
- Unsupported CLI commands may exit nonzero; do not document “always exit 0” beyond hook handling.

## INSTALLED WIRING

Parent `deep-research-user-prompt-submit.sh` invokes this component, and the package bin is `asterline-deep-research-engine`. Current source usage says `asterline-ultrawork` while committed dist says the public bin name; resolve source/dist naming intentionally.

No component-local plugin manifest exists. Parent plugin metadata is authoritative.

## VALIDATION

```bash
npm run check
npm test
printf '%s\n' '{"hook_event_name":"UserPromptSubmit","prompt":"please ultrawork","transcript_path":null}' | node dist/cli.js hook user-prompt-submit
```

Smoke a valid trigger, `ulw_helper`, malformed JSON, duplicate transcript, and context-pressure transcript, then run the inherited plugin packaging gate. Valid installed smoke currently emits a roughly 22k-character directive.

## ANTI-PATTERNS

- Do not duplicate directive content in code/tests.
- Do not expose upstream TOML agents as if they were installed Auggie agents.
- Do not keep stale README length/behavior claims after directive changes.
