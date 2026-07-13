# MCP RUNTIME BUNDLES

## OVERVIEW

Committed, dist-only MCP payloads imported from pinned upstream packages and adapted for the Asterline marketplace. Editable source is not present here.

## SURFACES

| Directory | Registration | Role |
| --- | --- | --- |
| `ast_grep/dist/` | Active as `ast_grep` | Structural search/replace through provisioned `sg` |
| `codegraph/dist/` | Active as `codegraph` | Checksum-pinned CodeGraph bridge with offline degradation |
| `lsp/dist/` | Active as `lsp` | Stdio proxy and daemon-backed LSP tools |
| `git_bash/dist/` | Unregistered by the static manifest | Windows Git Bash MCP payload |

## SOURCE BOUNDARY

- Never hand-edit these bundles as primary source.
- Change the canonical upstream package, rebuild it, then reapply reviewed Asterline identity, path, and vendor-import transformations.
- `mcp/lsp/dist` and `components/lsp/runtime/lsp-mcp.build.json` are one coordinated update unit.
- LSP runtime bundles are materialized from the exact F2 upstream lock and transformed into self-contained marketplace output.
- Use the checked-in runtime recipe and transform provenance; record the upstream revision and exact patch set when refreshing.
- Rebuild `ast_grep/dist/cli.js` from its exact v4.10.0 LazyCodex source lock; the recipe also normalizes every Node builtin to `node:` form.

## CONTRACTS

- `.mcp.json` is the registration source of truth.
- Preserve the active `ast_grep`/`lsp`/`codegraph` entries and typed HTTP servers. Do not register `git_bash` until the static cross-platform manifest and Windows bootstrap contract are reconciled.
- Keep local command paths rooted at the installed `auggie-asterline` marketplace.
- Preserve JSON-RPC stdio behavior and loadable `help` entrypoints.

## VALIDATION

Run the inherited plugin check and root marketplace validator. For LSP refreshes, also compare the two daemon trees and prove that only the documented substitutions differ.

## ANTI-PATTERNS

- Do not create local source shims inside `dist/` to hide a consumer defect.
- Do not register the Windows-only Git Bash server globally merely to make presence tests pass.
- Do not refresh one LSP copy without checking socket-name and vendor-import drift in the other.
