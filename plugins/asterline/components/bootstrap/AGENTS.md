# BOOTSTRAP COMPONENT

## OVERVIEW

Non-blocking SessionStart bootstrap that launches a detached worker to stage agents, stamp config, link runtime bins, and provision checksum-pinned ast-grep/Windows Node assets.

## WHERE TO LOOK

| Concern | Location |
| --- | --- |
| Fast SessionStart path | `src/hook.ts` |
| Worker locks/state/degraded ledger | `src/worker.ts`, `src/environment.ts` |
| Idempotent setup operations | `src/setup.ts` |
| Download/checksum boundary | `src/download.ts`, `src/provision.ts` |
| Pinned artifacts | `manifests/*.json` |
| Windows pre-Node fallback | `scripts/bootstrap.ps1` |
| Shipped runtime | `dist/cli.js` |

## LOCAL CONTRACTS

- Runtime is Node; Bun is only the current test/esbuild driver.
- Bootstrap source uses `.ts` imports because esbuild bundles it, unlike tsc sibling components.
- Hook and worker failures degrade to state/log entries and must not block SessionStart.
- Mutable state belongs under `PLUGIN_DATA`/`ASTERLINE_HOME`, never `PLUGIN_ROOT`.
- Preserve bootstrap/auto-update lock coordination, idempotent setup, and the prohibition on writing permission policy.
- Runtime downloads require pinned versions and SHA-256 verification. Only explicit manifest regeneration may discover network versions/hashes.
- Preserve PowerShell 5.1 compatibility and the Windows Node/Git Bash fallback chain.

## BUILD / TEST REALITY

```bash
bun test test/*.test.ts
node dist/cli.js help
```

- `dist/cli.js` is a committed single bundle and must be reviewed after regeneration.
- `scripts/build.mjs` invokes `bun x esbuild`, which may resolve/download tooling. Run it only with tooling already provisioned or explicit install/network authorization.
- Build failure currently reuses a non-empty old bundle; `Using bundled bootstrap dist` is not proof that source rebuilt.
- Source/tests reference absent upstream installer and ast-grep modules. Nine download tests pass, but environment/provision suites cannot currently load in this checkout.
- `environment.ts`, `setup.ts`, and `worker.ts` are at or near the component file ceiling; split by responsibility before adding policy.

## AGGREGATE INTEGRATION

Installed wiring is parent `hooks/hooks.json` → `hooks/bin/bootstrap-session-start.sh` → this dist. The aggregate manifest does not use the component-local Windows command.

## ANTI-PATTERNS

- Do not accept a fallback build as source/dist verification.
- Do not regenerate manifests during deterministic build/install.
- Do not patch bundled output to hide absent source dependencies.
