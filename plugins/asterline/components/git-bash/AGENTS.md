# GIT-BASH REMINDER COMPONENT

## OVERVIEW

One-shot Windows Git Bash guidance hook plus the reproducible source recipe for the sibling Git Bash MCP bundle.

## SURFACES

- `src/asterline-hook.ts`: Auggie `launch-process` parsing, platform detection, atomic once-per-session marker.
- `src/cli.ts`: Node hook CLI; malformed input and operational errors fail open.
- `dist/`: tracked tsc output consumed by the installed wrappers.
- `hooks/hooks.json`: warning-free Auggie `PreToolUse` registration; the hook filters tool payloads itself.
- `runtime/`: exact v4.17.1 source pin, Asterline transforms, and deterministic F3 bundle build.
- `../../mcp/git_bash/`: self-contained MCP build plus transform provenance.

## LOCAL CONTRACTS

- Runtime is Node >=20; tests use Bun.
- Preserve exact one-shot behavior per hashed session under the shared plugin-data root (`ASTERLINE_PLUGIN_DATA`, `PLUGIN_DATA`, then `~/.augment/asterline/plugin-data`). Auggie 0.32 has no `PostCompact` hook.
- Keep Windows detection compatible with `platform`, `OS`, `ComSpec`, and `SystemRoot` signals.
- Source changes require a wrapper-level payload smoke after the inherited dist regeneration step.
- The reminder may inject context but must never block or crash a turn.

## AGGREGATE INTEGRATION

Parent wiring exposes the public feature as `git-flow`; the component accepts only Auggie's exact `launch-process` tool name. Do not add a hook-level matcher because Auggie 0.32 ignores it.

The separate MCP bundle exposes `which_bash` and `diagnose` on every host, and conditionally exposes `run` only on Windows with a resolved Git Bash executable. Aggregate registration remains owned by the parent manifest.

## VALIDATION

```bash
npm run build
bun test test/*.test.ts
node dist/cli.js help
node runtime/build-git-bash.mjs --source /tmp/omo-v417 --output ../../mcp/git_bash
```

Then run the inherited plugin packaging gate; wrapper changes also require the inherited root marketplace validator.

## ANTI-PATTERNS

- Do not infer MCP behavior from reminder tests.
- Do not add `matcher`, `statusMessage`, or unsupported hook events.
- Do not hand-edit the sibling MCP dist bundle; rebuild it from the pinned recipe.
