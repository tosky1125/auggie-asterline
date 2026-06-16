## Summary

<!-- Brief description, 1-3 bullets -->

-

## Verification

- [ ] `npm run check` (typecheck + biome + build)
- [ ] `npm test` (unit tests)
- [ ] `npm pack --dry-run` (release sanity)
- [ ] Hook smoke-tested locally with `node dist/cli.js hook post-tool-use`

## Asterline plugin impact

- [ ] `.augment-plugin/plugin.json` remains valid
- [ ] `hooks/hooks.json` still uses stable Asterline hook JSON
- [ ] No MCP server or MCP tool is exposed
- [ ] CHANGELOG entry added for user-facing changes
