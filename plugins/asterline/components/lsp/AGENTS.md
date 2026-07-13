# LSP ADAPTER COMPONENT

## OVERVIEW

Asterline-specific PostToolUse/PostCompact adapter around vendored LSP daemon/tools. This component owns edited-path extraction and hook feedback; it does not own the core LSP manager implementation.

## SOURCE BOUNDARIES

| Surface | Owner |
| --- | --- |
| `src/` | Hook input, diagnostics feedback, per-session suppression, CLI |
| `dist/` | Tracked component runtime consumed by wrappers |
| `../../vendor/lsp-tools-mcp/dist/` | `LspManager`, clients, tools, server definitions |
| `../../vendor/lsp-daemon/dist/` | Daemon/socket/proxy runtime |
| `../../mcp/lsp/dist/` | Marketplace-transformed daemon/MCP copy |

- Runtime tool calls acquire clients through vendored `withLspClient`; static status is the exception.
- Rename applies workspace edits and must remain sequential at the MCP caller.
- Hook diagnostics may process up to four edited files concurrently.
- Missing-server/unavailable diagnostics are fail-open and cached per session until PostCompact.

## INSTALLED WIRING

Parent wrappers invoke diagnostics for Auggie `str-replace-editor|save-file`. `src/mutated-file-paths.ts` currently accepts only `apply_patch`, `write`, `edit`, `multiedit`, and `multi_edit`; require an installed-payload test when changing extraction or matchers.

The public MCP key is `lsp`; runtime configuration is `.asterline/lsp-client.json` with a top-level `lsp` map. Keep skill prose and helper scripts aligned with those actual names.

## BUILD REALITY

Component-local dependency metadata points at a machine-specific path and build helpers expect absent upstream sibling packages. The parent plugin runs committed artifacts; do not present standalone `npm install` as reproducible until those paths are fixed.

```bash
npm run check && npm test
```

Then run the inherited plugin/root gates. Any LSP runtime refresh must coordinate `mcp/lsp` and both vendored LSP packages, documenting the transformation between copies.

## ANTI-PATTERNS

- Do not patch vendored manager logic in component source.
- Do not hand-edit one daemon copy without checking the other.
- Do not document renamed helper/config files that do not exist.
- Do not add dependencies on internal upstream application source trees.
