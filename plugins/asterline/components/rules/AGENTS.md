# RULE ENGINE COMPONENT

## OVERVIEW

Standalone rule discovery/matching/injection engine for SessionStart, UserPromptSubmit, PostToolUse, and PostCompact. It is separate from the parent `plugins/asterline/rules/*.md` native Auggie policy surface.

## ARCHITECTURE

- `src/asterline-hook.ts`: event coordination and stable hook output.
- `src/static-injection.ts`, `persistent-cache.ts`: budgets, transcript dedup, locks, compaction recovery.
- `src/rules/`: deterministic discovery → parse/frontmatter → match/order → truncate/format.
- `createRulesEngine`: dependency-injected core boundary.
- `dist/`: tracked one-to-one JS/declaration output consumed by the marketplace.

## LOCAL CONTRACTS

- Keep discovery deterministic and boundary failures fail-open.
- Cover all four events plus read/edit/patch/shell target extraction.
- Synchronize README, skill prose, config schema, source lists, environment variables, and tests when adding a source or budget.
- Parent native policy Markdown is not input to this engine; do not merge the two concepts.
- Warning-band files include `asterline-hook.ts`, `persistent-cache.ts`, and `parser-yaml.ts`; split by responsibility before they exceed the component ceiling.

## SOURCE / DIST HAZARD

`src/rules/matcher.ts` imports bare `picomatch`, while committed marketplace dist points directly into `../../../../vendor/picomatch`. The normal tsc build does not reproduce that rewrite and may overwrite the packaged-safe import. Fix/document the post-build transformation before treating `npm run check` as a reproducible package build.

Component-local hooks use standalone `${PLUGIN_ROOT}` commands and upstream matchers. Parent aggregate hooks use wrappers and Auggie matchers. Verify both targets deliberately.

## VALIDATION

```bash
npm run typecheck
npm run lint
```

The Vitest suite owns hook payload fixtures for all four events, but one process test invokes the build and rewrites dist. Run tests in a reviewable worktree, then regenerate dist, reapply the audited picomatch vendor-import transform, and confirm that only intended generated changes remain before the inherited plugin packaging gate.

## ANTI-PATTERNS

- Do not hand-edit dist without repairing the build transform.
- Do not re-enable agent instruction files as rule sources; current config/tests deliberately exclude them.
- Do not assume aggregate validation proves source/dist equivalence.
- Do not couple this standalone engine to internal upstream application source trees.
