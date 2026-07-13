# ASTERLINE PLUGIN PAYLOAD

## OVERVIEW

Installable Auggie plugin assembled from public prompts, aggregate adapters, committed component builds, MCP bundles, and vendored packages. This directory is a shipped distribution, not an npm workspace.

## STRUCTURE

```text
asterline/
├── .augment-plugin/plugin.json  # Exported plugin surfaces
├── agents/                      # Six loaded role prompts; no extra Markdown
├── components/                  # Nine implementation packages
├── hooks/                       # Installed Auggie adapters
├── mcp/                         # Dist-only MCP payloads
├── rules/                       # Three loaded native policies; no extra Markdown
├── skills/                      # Exact twenty-skill public API
├── test/                        # Aggregate contract suite
└── vendor/                      # Immutable dependency snapshots
```

## WHERE TO LOOK

| Change | Source of truth | Coupled surfaces |
| --- | --- | --- |
| Skill inventory | `skills/*/SKILL.md` | Root README/validator/smoke, runtime validator, contract test |
| Runtime bins | `package.json#bin` | Component `dist/cli.js`, validators |
| Hook registration | `hooks/hooks.json` + `hooks/bin/` | Component CLI contract, aggregate tests |
| MCP registration | `.mcp.json` | `mcp/*/dist`, installed-path assertions |
| Role prompt | `agents/*.md` | Filename equals frontmatter `name` |
| Native policy | `rules/*.md` | Terse H1 + unconditional bullets, no frontmatter |
| Version | package/plugin/marketplace manifests | Status text, validators, docs |

## DISTRIBUTION CONTRACT

- `npm run build` runs `scripts/validate-runtime.mjs`; it validates existing artifacts and does not compile component source.
- `dist/` and `vendor/` are runtime inputs. Preserve them in packaging reviews.
- Exactly twenty skill directories are public; aliases and extra skill directories fail the contract.
- The static `.mcp.json` omits `git_bash` on every platform, although its Windows-only bundle remains shipped and load-checked. Bootstrap still expects a Windows registration path; treat this as unresolved adapter drift.
- Local MCP commands and hook wrappers retain the installed marketplace path. Do not replace it with component-local `${PLUGIN_ROOT}` syntax in aggregate manifests.
- `agents/` and `rules/` are wholesale loader roots. Keep instruction files at this directory level, not inside those roots.

## VALIDATION

```bash
npm --prefix plugins/asterline run check
```

Run component-local build/tests separately after source edits; the plugin check only validates the packaged result. Use the inherited root gates for marketplace validation and live Auggie smoke.

## KNOWN DRIFT AREAS

- Aggregate edit matchers use Auggie tool names while comment-checker and LSP extractors still recognize upstream edit names; require an end-to-end payload test when changing either side.
- Bootstrap source imports absent upstream modules and its build may fall back to the old committed bundle.
- The LSP MCP tree is a lightly transformed copy of vendored daemon output without a checked-in regeneration step.
- Several standalone READMEs, changelogs, and nested workflows describe upstream layouts that do not exist here.
- Keep all duplicated public-file scan lists synchronized when adding a runtime surface.

## ANTI-PATTERNS

- Do not add unscanned public files without extending identity/contract validation.
- Do not hand-edit a vendored dependency or a dist-only MCP bundle as primary source.
- Do not assume nested component `npm ci` workflows are runnable; this checkout has no lockfiles.
