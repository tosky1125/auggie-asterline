# Repository Conventions

Conventions for human contributors and AI agents working on this repository.

## Style

- Terse technical prose. No emojis in commits, issues, PR comments, or code.
- TypeScript strict mode. No `any`, no `unknown` casts where avoidable, no `@ts-ignore`, no `@ts-expect-error`, no enums.
- ESM modules with `.js` suffix in runtime import paths.
- Tabs for indentation. Double quotes for strings.
- Tests use vitest with `#given .. #when .. #then` descriptions or plain `// given / // when / // then` body comments.

## Commands

- `npm install` - install dependencies.
- `npm test` - run vitest once.
- `npm run typecheck` - strict TypeScript check.
- `npm run check` - type check, biome, and build.
- `npm pack --dry-run` - release package smoke test.
- `node dist/cli.js hook post-tool-use < fixture.json` - smoke-test the Asterline hook.

## Constraints

- No Bun APIs. Runtime is Node only because Asterline launches plugin hooks with Node.
- Keep Asterline `PostToolUse` hook behavior covered by tests.
- Keep `apply_patch` extraction covered by tests.
- `apply_patch` must support Asterline `tool_input.command`, raw patch text, and ASTERLINE-compatible metadata.
- Hook output must use the stable Asterline hook JSON contract.
- Do not expose an MCP server or MCP tool from this plugin.

## Don'ts

- No `git add -A` or `git add .`. Stage only the files you changed.
- No `git commit --no-verify`. No force pushes. No history rewriting on shared branches.
- Do not couple this package back to pi, asterline, or senpi internal source paths.
