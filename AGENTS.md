# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-13
**Commit:** 772d9dc
**Branch:** main

## OVERVIEW

Auggie marketplace wrapper for the Asterline 4.17.1 runtime. The repository ships manifests, prompts, hook adapters, committed self-contained component builds, MCP bundles, and locked build sources.

## STRUCTURE

```text
./
├── .augment-plugin/marketplace.json  # Marketplace discovery and version
├── plugins/asterline/                # Entire installable plugin payload
│   ├── components/                   # Source-bearing hook and workflow packages
│   ├── hooks/                        # Aggregate Auggie event adapters
│   ├── mcp/                          # Committed MCP runtime bundles
│   ├── skills/                       # Twenty-five public skill contracts
│   └── release/build-sources/        # Build-only locked dependency sources
├── scripts/validate-marketplace.mjs  # Cross-repository acceptance contract
└── scripts/smoke-auggie-local.sh     # Live command-surface smoke test
```

Ignored `.asterline/` and local planning/evidence directories are runtime state, not source.

## WHERE TO LOOK

| Task | Location | Notes |
| --- | --- | --- |
| Marketplace identity/version | `.augment-plugin/marketplace.json` | Must agree with plugin/package/validators |
| Public installation docs | `README.md` | Scanned by marketplace validation |
| Plugin exports | `plugins/asterline/.augment-plugin/plugin.json` | Skills, agents, rules, hooks, MCP |
| Hook event wiring | `plugins/asterline/hooks/hooks.json` | Auggie matchers and installed paths |
| Runtime bins/dependencies | `plugins/asterline/package.json` | Private ESM package, Node >=20 |
| Packaging contract | `scripts/validate-marketplace.mjs` | Exact skill set, paths, branding, loadability |
| Plugin contract tests | `plugins/asterline/test/asterline-contract.test.mjs` | Seven aggregate contracts |
| Imported runtime provenance | `plugins/asterline/UPSTREAM-PROVENANCE.md` | Upstream release and pinned commit |

## CODE MAP

Codegraph indexed 255 first-party files. TypeScript LSP is not installed, so the reach indicators below describe entry roles rather than full LSP centrality.

| Symbol / surface | Type | Location | Reach | Role |
| --- | --- | --- | --- | --- |
| marketplace validator | script entry | `scripts/validate-marketplace.mjs` | root gate | Cross-surface acceptance |
| `executeSessionStartHook` | function | `plugins/asterline/components/bootstrap/src/hook.ts` | hook entry | Detached bootstrap worker |
| `runSessionStartHook` et al. | functions | `plugins/asterline/components/rules/src/asterline-hook.ts` | 4 events | Rule injection/cache lifecycle |
| `workLoopCommand` | function | `plugins/asterline/components/work-loop/src/cli-commands.ts` | CLI entry | Durable goal operations |
| `CheckpointWorkLoopArgs` | interface | `plugins/asterline/components/work-loop/src/checkpoint.ts` | 5 | Completion/gate boundary |
| `runLspPostToolUseHook` | function | `plugins/asterline/components/lsp/src/asterline-hook.ts` | hook entry | Edited-file diagnostics |
| `extractAsterlineCommentCheckRequests` | function | `plugins/asterline/components/comment-checker/src/asterline-hook.ts` | hook entry | Edit-to-check requests |
| `runStopHook` | function | `plugins/asterline/components/start-work-continuation/src/asterline-hook.ts` | 2 events | Stop continuation gate |

## CONVENTIONS

- Run root scripts from repository root; both validator and smoke use cwd-relative paths.
- There is no root package manifest, lockfile, formatter, or active root CI. Use direct Node/Bash commands and `npm --prefix plugins/asterline`.
- Versions and skill inventories are duplicated intentionally. Update README, marketplace manifest, plugin manifest/package, validators, tests, and smoke expectations together.
- Public names are Asterline/Auggie. Validators reject legacy identities, aliases, obsolete plugin trees, and a plugin `commands/` directory.
- Hook/MCP commands intentionally target `$HOME/.augment/plugins/marketplaces/auggie-asterline/...`.

## ANTI-PATTERNS (THIS PROJECT)

- Do not treat committed component/MCP `dist/` output as disposable; it is the shipped runtime.
- Do not infer that the plugin `build` script compiles components. It only validates the committed payload.
- Do not add Markdown inside `plugins/asterline/agents/` or `plugins/asterline/rules/`; those directories are loader roots.
- Do not commit runtime state, local evidence, environment files, or dependency installs.
- Do not publish, push, or commit without explicit authorization.

## UNIQUE STYLES

- Source-bearing components resemble standalone upstream packages but are nested without workspace orchestration.
- Component-local hook manifests describe standalone behavior; `plugins/asterline/hooks/hooks.json` is the installed Auggie adapter.
- Nested component CI files are retained upstream metadata; GitHub does not execute them from this repository location.

## COMMANDS

```bash
node scripts/validate-marketplace.mjs
npm --prefix plugins/asterline run build
npm --prefix plugins/asterline test
bash scripts/smoke-auggie-local.sh
```

The smoke test requires `auggie` and writes ignored evidence under `.asterline/evidence/`.

## NOTES

- Aggregate validation does not run component TypeScript suites or prove source-to-dist reproducibility.
- Rebuild imported runtime output only through its checked-in source/provenance recipe. Read the nearest component `AGENTS.md` before changing a runtime surface.
- The TypeScript, Bash, Biome, and YAML language servers are absent in this checkout; use component checks when dependencies are available.
