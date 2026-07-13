# CODE-INTEL SETUP TOOLKIT

## OVERVIEW

Language-server setup router with per-language installation/configuration references and TypeScript detection/verification helpers.

## STRUCTURE

- `SKILL.md` owns triggering, server choice, and setup flow.
- `references/<language>/README.md` owns server IDs, install commands, extensions, config snippets, and troubleshooting.
- `scripts/lsp-server-table.ts` is the hand-maintained server inventory.
- `scripts/detect-lsp.ts` inspects project/install/config status.
- `scripts/verify-lsp.ts` performs the diagnostics round trip when its runtime dependency is available.

## NAMING CONTRACT

- Shipped helper filenames retain `lsp`; do not document renamed `code-intel` filenames unless the files/imports are renamed too.
- The runtime currently reads `.asterline/lsp-client.json` with a top-level `lsp` map. Keep examples synchronized with the actual loader.
- Public MCP registration is `lsp`; user-visible tool names follow that registration until the runtime and manifest change together.

## EDITING RULES

- Update the server table and the matching language reference in the same change.
- Preserve OS-specific install paths and exact server IDs; they are inputs to status/install-decision flows.
- Verify helper imports against this packaged layout. `verify-lsp.ts` still searches for an absent upstream package source tree.
- Do not claim support from documentation alone; run a real diagnostics round trip when the server can be installed.

## VALIDATION

- Run detection on a project with the server absent and one with it installed.
- Run verification against a file containing a known diagnostic.
- Run plugin/marketplace validation after changing the shipped skill surface.

## ANTI-PATTERNS

- Do not create parallel config filenames for branding.
- Do not install a server without explicit user authorization.
- Do not report LSP centrality or diagnostics when the relevant server is missing.
