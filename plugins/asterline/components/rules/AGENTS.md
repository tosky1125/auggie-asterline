# RULE ENGINE COMPONENT

## OVERVIEW

Standalone rule discovery/matching/injection engine for Auggie SessionStart and PostToolUse. It is separate from the parent `plugins/asterline/rules/*.md` native Auggie policy surface.

## ARCHITECTURE

- `src/asterline-hook.ts`: event coordination and stable hook output.
- `src/static-injection.ts`, `persistent-cache.ts`: budgets, transcript dedup, locks, compaction recovery.
- `src/rules/`: deterministic discovery → parse/frontmatter → match/order → truncate/format.
- `createRulesEngine`: dependency-injected core boundary.
- `dist/cli.js`: tracked self-contained F3 bundle consumed by the marketplace.

## LOCAL CONTRACTS

- Keep discovery deterministic and boundary failures fail-open.
- Cover all four events plus read/edit/patch/shell target extraction.
- Synchronize README, skill prose, config schema, source lists, environment variables, and tests when adding a source or budget.
- Parent native policy Markdown is not input to this engine; do not merge the two concepts.
- Warning-band files include `asterline-hook.ts`, `persistent-cache.ts`, and `parser-yaml.ts`; split by responsibility before they exceed the component ceiling.

## SOURCE / DIST HAZARD

`src/rules/matcher.ts` imports bare `picomatch`; `scripts/build.mjs` aliases the locked build-only source under `release/build-sources/`, and the F3 bundler must inline it. Runtime bare imports or build-source paths are release blockers.

Component-local hooks use standalone `${PLUGIN_ROOT}` commands. Auggie 0.32 ignores `matcher`, so tool filtering belongs at the hook-bridge boundary.

## VALIDATION

```bash
npm run typecheck
npm run lint
```

The component suite retains upstream engine characterization, while `plugins/asterline/test/v4171-rules-runtime.test.mjs` owns actual Auggie payload and dist behavior. Rebuild before runtime tests and confirm the emitted bundle passes both auditors.

## ANTI-PATTERNS

- Do not hand-edit dist without repairing the build transform.
- Do not re-enable agent instruction files as rule sources; current config/tests deliberately exclude them.
- Do not assume aggregate validation proves source/dist equivalence.
- Do not couple this standalone engine to internal upstream application source trees.
