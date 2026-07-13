# LSP ADAPTER COMPONENT

## OVERVIEW

Auggie-specific `PostToolUse` adapter around the committed `mcp/lsp/dist` interface. This component
owns payload-to-diagnostics feedback; `runtime/**` owns the upstream LSP MCP materialization.

## SOURCE BOUNDARIES

| Surface | Role |
| --- | --- |
| `src/` | Successful edit filtering, diagnostics feedback, CLI |
| `dist/` | Deterministic self-contained bundles consumed by installed wrappers |
| `runtime/` | Separately owned LSP MCP source lock and builder |
| `../../mcp/lsp/dist/` | Committed daemon/MCP interface bundled by this component |
| `../hook-bridge/src/` | Exact Auggie 0.32 payload boundary bundled by this component |

## CONTRACT

- Support only `PostToolUse` for `apply_patch`, `str-replace-editor`, and `save-file`.
- Diagnose only events whose normalized state is `succeeded` and only their affected paths.
- Failed, cancelled, unknown, malformed, clean, and unavailable-server outcomes fail open silently.
- Do not add unsupported events, `matcher`, `statusMessage`, telemetry, runtime package managers,
  `vendor/` imports, or bare runtime imports.
- Build with `scripts/build.mjs`; it delegates to the plugin's pinned F3 bundler and audits the output.
- Keep each handwritten source module at or below 250 pure lines.

## VERIFICATION

```bash
node scripts/build.mjs
node --test ../../test/v4171-lsp-hook.test.mjs
node ../../scripts/audit-runtime-imports.mjs --root dist --config scripts/runtime-audit.json
node ../../scripts/audit-package-manager-runtime.mjs --root dist --config scripts/runtime-audit.json
```

Do not edit `runtime/**` from this component task.
