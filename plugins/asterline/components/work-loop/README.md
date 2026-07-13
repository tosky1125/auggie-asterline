# Asterline work-loop

Self-contained Auggie runtime for durable, repository-scoped goals, evidence, checkpoints, steering, quality gates, and third-occurrence authorization escalation.

State is stored under `.asterline/work-loop[/<session>]/{brief.md,goals.json,ledger.jsonl}`. Goal mutations use an atomic cross-process lock and atomic plan replacement. Session identifiers and existing path components are validated before access.

New plans use evidence layout v2. `status --json` advertises the active `currentAttemptDir` under `.asterline/evidence/work-loop/`; final review reports and manual-QA artifacts must exist, be non-empty, and remain inside that directory. Intermediate aggregate goals require their essential criteria, while final completion requires every criterion across the plan.

## Commands

```sh
node "$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline/components/work-loop/dist/cli.js" work-loop create-goals --brief "..." --json
node "$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline/components/work-loop/dist/cli.js" work-loop status --json
node "$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline/components/work-loop/dist/cli.js" work-loop complete-goals --json
node "$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline/components/work-loop/dist/cli.js" work-loop record-evidence --goal-id G001 --criterion-id C001 --status pass --evidence "..." --json
node "$HOME/.augment/plugins/marketplaces/auggie-asterline/plugins/asterline/components/work-loop/dist/cli.js" work-loop checkpoint --goal-id G001 --status complete --evidence "..." --host-goal-json "..." --json
```

The committed `dist/cli.js` is a self-contained Node.js bundle. Build and runtime do not resolve packages or invoke a package manager.

```sh
node runtime/build-work-loop.mjs
node --test ../../test/v4171-work-loop.test.mjs
```

## Auggie limits

The installed component registers no unsupported hook event. Its explicit hook CLI remains available for protocol testing and reports public session identities as `auggie:<session_id>`. Parallel task decomposition is supported by the `team-mode` skill; persistent team messaging, resumption, and durable worker threads are not.

See [NOTICE](NOTICE) for pinned v4.17.1 provenance and [LICENSE](LICENSE) for licensing.
