# auggie-asterline

Asterline is an Auggie marketplace plugin that ports the upstream 4.17.1
runtime surface into an Asterline-branded Auggie package. It provides durable
planning loops, deep research and deep work, code intelligence, review pressure,
cleanup, visual checks, hooks, and MCP servers through the `asterline` plugin namespace.

## Install

```sh
auggie plugin marketplace add tosky1125/auggie-asterline
auggie plugin install asterline@auggie-asterline
```

## Update

Existing users who already added this marketplace should refresh it from GitHub
and reinstall the plugin entry:

```sh
auggie plugin marketplace update auggie-asterline
auggie plugin install asterline@auggie-asterline
```

The update command also accepts the repository name when the local marketplace
name is unclear:

```sh
auggie plugin marketplace update tosky1125/auggie-asterline
```

If the plugin was enabled for a project or local settings file, keep the same
scope flag when reinstalling:

```sh
auggie plugin install --project asterline@auggie-asterline
auggie plugin install --local asterline@auggie-asterline
```

Verify that the refreshed commands are available:

```sh
auggie plugin list
auggie command list | grep 'asterline:'
```

For local verification during development:

```sh
auggie --plugin-dir . command list
```

## Contents

| Surface | Path |
| --- | --- |
| Marketplace manifest | `.augment-plugin/marketplace.json` |
| Plugin manifest | `plugins/asterline/.augment-plugin/plugin.json` |
| Skills | `plugins/asterline/skills/` |
| Agents | `plugins/asterline/agents/` |
| Rules | `plugins/asterline/rules/` |
| Hooks | `plugins/asterline/hooks/` |
| MCP config | `plugins/asterline/.mcp.json` |
| Runtime components | `plugins/asterline/components/` |
| MCP runtimes | `plugins/asterline/mcp/` |

## Skill Set

- `/asterline:clean-ai-code`: remove generated-code smells after proof exists.
- `/asterline:code-engineer`: apply strict implementation discipline.
- `/asterline:code-intel`: use language-aware diagnostics and navigation.
- `/asterline:code-intel-setup`: configure language-server support.
- `/asterline:comment-guard`: check edited-code comments for low-signal text.
- `/asterline:debug-trace`: reproduce, isolate, fix, and verify runtime defects.
- `/asterline:deep-research`: run broad evidence-backed research.
- `/asterline:deep-work`: apply the Asterline deep-work execution discipline.
- `/asterline:git-flow`: inspect history and prepare intentional Git changes.
- `/asterline:health-check`: diagnose local install and plugin health.
- `/asterline:init-knowledge`: initialize durable project guidance.
- `/asterline:reshape-code`: refactor while preserving behavior.
- `/asterline:review-pass`: run a post-implementation verification pass.
- `/asterline:rule-sync`: understand and maintain scoped project rules.
- `/asterline:run-plan`: execute an approved plan with evidence checkpoints.
- `/asterline:session-history`: inspect supported local coding-agent session stores.
- `/asterline:structure-search`: search and rewrite source with AST-aware patterns.
- `/asterline:team-mode`: split work across parallel Auggie agents without durable team claims.
- `/asterline:ui-polish`: review and improve UI/UX implementation quality.
- `/asterline:upstream-fix`: prepare a source-backed upstream bug fix.
- `/asterline:upstream-report`: create a high-signal upstream bug report.
- `/asterline:visual-check`: run rigorous visual QA.
- `/asterline:web-access`: escalate blocked web access through bounded retrieval tiers.
- `/asterline:work-loop`: execute durable goal loops with observable proof.
- `/asterline:work-plan`: produce a decision-complete implementation plan.

The exact public inventory is 25 skills. Local MCP servers include structural search,
language intelligence, and checksum-pinned CodeGraph; `grep_app` and `context7` use
explicit HTTP transport entries. Auggie hooks use only `SessionStart`, `PreToolUse`,
`PostToolUse`, and `Stop`, without unsupported matcher or status-message properties.

## Validation

```sh
node scripts/validate-marketplace.mjs
npm --prefix plugins/asterline run build
npm --prefix plugins/asterline test
bash scripts/smoke-auggie-local.sh
```

The smoke script writes local evidence under `.asterline/evidence/`.
