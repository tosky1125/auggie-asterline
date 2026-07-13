# VENDORED RUNTIME SNAPSHOT

## OVERVIEW

Third-party package payload copied into the shipped plugin. Apparent `src/` files belong to upstream packages; they are not Asterline-owned source.

## PACKAGES

| Package | Version | Origin |
| --- | --- | --- |
| `picomatch` | 4.0.4 | micromatch/picomatch |
| `posthog-node` | 5.35.6 | PostHog JavaScript monorepo |
| `@posthog/core` | 1.29.13 | PostHog JavaScript monorepo |
| `@posthog/types` | 1.376.4 | PostHog JavaScript monorepo |
| `lsp-tools-mcp` | 0.1.0 | code-yeongyu/lsp-tools-mcp |
| `lsp-daemon` | 0.1.0 | Pinned upstream runtime snapshot |

## REFRESH RULES

- Never hand-edit files under this directory as primary source.
- Refresh a package atomically from an exact release/tag or rebuilt upstream source.
- Preserve package metadata, declarations, license/notice files, and runtime entrypoints as one unit.
- Record source URL/revision and artifact integrity in the refresh change; this checkout has no vendoring script or lockfile.
- Rebuild LSP packages upstream. Their editable sources are absent here.

## CONSUMERS

- Rules loads vendored picomatch from committed dist.
- Telemetry lazily loads posthog-node; failures degrade to a no-op client.
- Component LSP hooks load vendored lsp-daemon.
- MCP LSP routing loads vendored lsp-tools-mcp.

## VALIDATION

Run the inherited plugin check and root marketplace validator. Also exercise the consuming component; package presence/load checks do not prove lazy imports or telemetry capture work.

## KNOWN RISKS

- Telemetry currently targets a posthog-node path absent from this snapshot and silently falls back to no-op; fix the consumer, not vendor.
- Some LSP/PostHog license payloads declared by package metadata are absent.
- `mcp/lsp/dist` is a transformed duplicate of part of this tree and must remain coordinated.
