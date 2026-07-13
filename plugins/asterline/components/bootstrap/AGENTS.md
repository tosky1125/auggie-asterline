# BOOTSTRAP COMPONENT

## OVERVIEW

Fail-open Auggie `SessionStart` adapter. A short-lived hook launches a detached worker that provisions checksum-pinned native assets into mutable plugin data; the hook never blocks the session on provisioning.

## WHERE TO LOOK

| Concern | Location |
| --- | --- |
| SessionStart decision/spawn | `src/hook.ts` |
| Native provisioning/state | `src/worker.ts` |
| Path containment | `src/paths.ts` |
| Atomic state/stale locks | `src/state.ts` |
| Reproducible F3 bundle | `scripts/build.mjs` |
| Port provenance | `UPSTREAM-PROVENANCE.json` |

## LOCAL CONTRACTS

- Runtime is Node; exact Bun 1.3.14 is only the build driver.
- `AUGMENT_PLUGIN_ROOT` is the Auggie root signal; `PLUGIN_ROOT` remains a compatibility fallback.
- Mutable state belongs under `ASTERLINE_PLUGIN_DATA`/`PLUGIN_DATA` or the derived user data root, never the marketplace cache.
- Hook and worker failures are fail-open. Worker failures are persisted as degraded entries.
- Native downloads are selected exclusively from `native/SBOM.json`, verified, probed, and atomically published by the shared native asset framework.
- Do not restore Codex config writers, agent links, package-manager execution, vendor imports, telemetry, `matcher`, or `statusMessage`.

## COMMANDS

```bash
bun test test/*.test.ts
node scripts/build.mjs
node dist/cli.js help
node --test ../../test/v4171-bootstrap.test.mjs
```

The build uses the plugin F3 bundler and replaces `dist/` only after import and package-manager runtime audits pass.
