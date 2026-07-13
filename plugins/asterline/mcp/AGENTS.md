# MCP RUNTIME BUNDLES

## OVERVIEW

Committed, dist-only MCP payloads imported from pinned upstream packages and adapted for the Asterline marketplace. Editable source is not present here.

## SURFACES

| Directory | Registration | Role |
| --- | --- | --- |
| `ast_grep/dist/` | Active as `ast_grep` | Structural search/replace through provisioned `sg` |
| `lsp/dist/` | Active as `lsp` | Stdio proxy and daemon-backed LSP tools |
| `git_bash/dist/` | Unregistered by the static manifest | Windows Git Bash MCP payload |

## SOURCE BOUNDARY

- Never hand-edit these bundles as primary source.
- Change the canonical upstream package, rebuild it, then reapply reviewed Asterline identity, path, and vendor-import transformations.
- `mcp/lsp/dist` and `vendor/{lsp-daemon,lsp-tools-mcp}` are one coordinated update unit.
- Most LSP daemon files duplicate `vendor/lsp-daemon/dist`; marketplace copies intentionally rewrite three imports and a small daemon/socket naming set.
- No checked-in regeneration pipeline currently captures those transformations. Record the upstream revision and exact patch set when refreshing.

## CONTRACTS

- `.mcp.json` is the registration source of truth.
- Preserve the active `ast_grep`/`lsp` entries. Do not register `git_bash` until the static cross-platform manifest and Windows bootstrap contract are reconciled.
- Keep local command paths rooted at the installed `auggie-asterline` marketplace.
- Preserve JSON-RPC stdio behavior and loadable `help` entrypoints.

## VALIDATION

Run the inherited plugin check and root marketplace validator. For LSP refreshes, also compare the two daemon trees and prove that only the documented substitutions differ.

## ANTI-PATTERNS

- Do not create local source shims inside `dist/` to hide a consumer defect.
- Do not register the Windows-only Git Bash server globally merely to make presence tests pass.
- Do not refresh one LSP copy without checking socket-name and vendor-import drift in the other.
