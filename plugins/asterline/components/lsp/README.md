# Asterline LSP hook

This component adapts Auggie 0.32 `PostToolUse` payloads to the committed Asterline LSP MCP runtime.

It accepts successful `apply_patch`, `str-replace-editor`, and `save-file` events. Failed, cancelled,
unknown, malformed, and unrelated tool events fail open without running diagnostics. Clean results and
missing language servers are silent; real diagnostics are returned as `PostToolUse` additional context.

The component is shipped as two self-contained Node.js bundles:

- `dist/cli.js` — installed hook command and optional MCP proxy entry.
- `dist/asterline-hook.js` — testable hook API.

Both bundles consume the source-committed hook bridge and `mcp/lsp/dist` interface at build time. They
contain no bare runtime imports, package-manager invocation, telemetry, or dependency on `vendor/`.

## Build and test

The build requires the pinned Bun 1.3.14 executable and never installs dependencies.

```bash
node scripts/build.mjs
node --test ../../test/v4171-lsp-hook.test.mjs
```

The installed hook manifest contains only Auggie-supported `PostToolUse` wiring without `matcher` or
`statusMessage`; unsupported tools are ignored inside the handler. Missing LSP servers
must be provisioned outside Asterline and exposed on `PATH`; the hook never installs them.
