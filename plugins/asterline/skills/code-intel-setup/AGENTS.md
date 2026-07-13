# CODE-INTEL SETUP TOOLKIT

## OVERVIEW

Language-server setup router with per-language installation/configuration references and TypeScript detection/verification helpers.

## STRUCTURE

- `SKILL.md` owns triggering, server choice, and setup flow.
- `references/<language>/README.md` owns server IDs, install commands, extensions, config snippets, and troubleshooting.
- `scripts/lsp-server-table.ts` is the hand-maintained server inventory.
- `scripts/detect-lsp.ts` inspects project/install/config status.
- `scripts/verify-lsp.ts` performs a diagnostics round trip through the committed `mcp/lsp` bundle.

## NAMING CONTRACT

- Public skill names are `code-intel` and `code-intel-setup`; shipped helper filenames retain `lsp` because they follow the underlying runtime contract.
- The runtime reads `.asterline/lsp-client.json` with a top-level `lsp` map. Keep examples synchronized with the actual loader.
- Public MCP registration is `lsp`; user-visible tool names follow that registration. Do not invent a `code-intel` MCP or config map for branding symmetry.

## EDITING RULES

- Update the server table and the matching language reference in the same change.
- Preserve OS-specific install paths and exact server IDs; they are inputs to status/install-decision flows.
- Verify helper/runtime paths against this packaged layout. `verify-lsp.ts` invokes the committed `mcp/lsp/dist/cli.js` bundle and must clean up its isolated daemon state.
- Do not claim support from documentation alone; run a real diagnostics round trip when the server can be installed.

## VALIDATION

- Run detection on a project with the server absent and one with it installed.
- Run verification against a file containing a known diagnostic.
- Run plugin/marketplace validation after changing the shipped skill surface.

## ANTI-PATTERNS

- Do not create parallel config filenames for branding.
- Do not install a server without explicit user authorization.
- Do not report LSP centrality or diagnostics when the relevant server is missing.
