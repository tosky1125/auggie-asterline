# auggie-asterline

Asterline is an Auggie marketplace plugin that ports the upstream 4.10.0
runtime surface into an Asterline-branded Auggie package. It provides durable
planning loops, deep research, code intelligence, review pressure, cleanup,
visual checks, hooks, and MCP servers through the `asterline` plugin namespace.

## Install

```sh
auggie plugin marketplace add tosky1125/auggie-asterline
auggie plugin install asterline@auggie-asterline
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

- `/asterline:comment-guard`: check edited-code comments for low-signal text.
- `/asterline:debug-trace`: reproduce, isolate, fix, and verify runtime defects.
- `/asterline:ui-polish`: review and improve UI/UX implementation quality.
- `/asterline:git-flow`: inspect history and prepare intentional Git changes.
- `/asterline:init-knowledge`: initialize durable project guidance.
- `/asterline:upstream-fix`: prepare a source-backed upstream bug fix.
- `/asterline:health-check`: diagnose local install and plugin health.
- `/asterline:upstream-report`: create a high-signal upstream bug report.
- `/asterline:code-intel-setup`: configure language-server support.
- `/asterline:code-intel`: use language-aware diagnostics and navigation.
- `/asterline:code-engineer`: apply strict implementation discipline.
- `/asterline:reshape-code`: refactor while preserving behavior.
- `/asterline:clean-ai-code`: remove generated-code smells after proof exists.
- `/asterline:review-pass`: run a post-implementation verification pass.
- `/asterline:rule-sync`: understand and maintain scoped project rules.
- `/asterline:run-plan`: execute an approved plan with evidence checkpoints.
- `/asterline:deep-research`: run broad evidence-backed research.
- `/asterline:work-loop`: execute durable goal loops with observable proof.
- `/asterline:work-plan`: produce a decision-complete implementation plan.
- `/asterline:visual-check`: run rigorous visual QA.

## Validation

```sh
node scripts/validate-marketplace.mjs
npm --prefix plugins/asterline run build
npm --prefix plugins/asterline test
bash scripts/smoke-auggie-local.sh
```

The smoke script writes local evidence under `.asterline/evidence/`.
