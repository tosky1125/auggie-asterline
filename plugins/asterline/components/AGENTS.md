# COMPONENT PACKAGES

## OVERVIEW

Nine independently shaped runtime packages embedded into one shipped plugin. Source edits are incomplete until the corresponding committed runtime artifact and aggregate adapter are verified.

## WHERE TO LOOK

| Component | Installed role | Dist shape | Test runner |
| --- | --- | --- | --- |
| `bootstrap` | Session startup/provisioning | Single esbuild bundle | Bun |
| `comment-checker` | Post-edit comment guard | tsc JS + declarations | Vitest |
| `git-bash` | Windows shell reminder | tsc JS + declarations | Bun |
| `lsp` | Post-edit diagnostics adapter | tsc + vendored daemon | Vitest/Node |
| `rules` | Rule discovery/injection/cache | tsc JS + declarations | Vitest |
| `start-work-continuation` | Stop/SubagentStop continuation | tsc JS + declarations | Vitest |
| `telemetry` | Silent daily activity event | tsc JS + declarations | Vitest |
| `ultrawork` | Deep-research trigger/directive | tsc JS + declarations | Vitest |
| `work-loop` | Durable goal CLI and steering | tsc JS + declarations | Vitest |

## SHARED CONVENTIONS

- Node >=20 runtime. Bun appears only as a build/test driver in bootstrap and git-bash.
- TypeScript components use strict ESM. Runtime-relative imports end in `.js`, except bootstrap source consumed directly by esbuild.
- Biome packages use tabs, double quotes, 120 columns, no enums, no `as any`, no non-null assertions, no TypeScript suppression comments, and no default exports except framework config. Existing targeted Biome-ignore files are exceptions, not templates. Start-work continuation and work-loop also reject `as unknown`.
- Tests use `#given/#when/#then` descriptions or `// given`, `// when`, `// then`; do not use Arrange/Act/Assert labels.
- Each child guide names its actual build/test order; component `check` scripts generally omit tests.
- Component-local manifests model standalone packages. Installed behavior is controlled by parent `hooks/hooks.json`, wrappers, package bins, and `.mcp.json`.

## SOURCE / DIST RULE

- Edit `src/` or the upstream source package, then regenerate tracked `dist/`; never patch generated JS as the only fix.
- Verify the generated import paths still resolve from the packaged marketplace. Some committed dist files contain intentional vendor-path rewrites not reproduced by component build scripts.
- CLI/integration tests often execute committed `dist`, while unit tests import `src`. Build before testing to avoid false confidence from stale artifacts.
- Root plugin validation checks loadability, not semantic source/dist equivalence.

## CROSS-SURFACE CHECKS

When an event, tool name, binary, or CLI contract changes, inspect all of:

```text
component src + tests + dist
component hooks/hooks.json
plugins/asterline/hooks/hooks.json + hooks/bin
plugins/asterline/package.json
plugins/asterline/test + both validators
```

## ANTI-PATTERNS

- Do not copy standalone package paths or matchers into the aggregate manifest without adapting them to Auggie.
- Do not rely on nested `.github/workflows`; they are inactive here and several assume missing lockfiles/sibling packages.
- Do not claim a component is reproducibly buildable when its source imports absent upstream modules or its build reuses old dist.
