# COMMENT-CHECKER COMPONENT

## OVERVIEW

Post-edit adapter that converts supported edit payloads into the optional native comment checker contract. Warnings block with a normalized reason; missing checker, malformed input, and operational errors fail open.

## FLOW

```text
parent PostToolUse wrapper
  -> dist/cli.js
  -> @asterline/hook-bridge boundary
  -> Auggie edit mapper / apply-patch parser
  -> native checker subprocess
  -> capped warning feedback
```

## LOCAL CONTRACTS

- Avoid `unknown` casts when handwritten boundary guards can narrow the payload.
- Consume the committed `@asterline/hook-bridge` contract; do not reinterpret raw Auggie success/failure strings.
- Ignore deletes, empty additions, failed/cancelled/unknown states, malformed payloads, and unsupported tool names.
- Cap subprocess stdout/stderr independently and together; timeout/output-budget aborts must reap the child before returning.
- The checker is operator-provisioned. Missing/native errors must not break the hook or trigger dependency installation.
- Preserve the stable PostToolUse JSON adapter and newline normalization.
- Do not expose this component as an MCP server.

## INSTALLED WIRING

The aggregate plugin uses `comment-guard-post-tool-use.sh` for every `PostToolUse` event because Auggie 0.32 ignores `matcher`. The runtime itself recognizes `str-replace-editor`, `save-file`, and the shared `apply_patch` contract, then fails open for every other tool.

The standalone README/package references a component plugin manifest that is absent here. The parent plugin manifest is authoritative for this checkout.

## VALIDATION

```bash
node ../../scripts/bundle-component.mjs --source .. --output dist --config runtime/comment-checker.build.json
node --test ../../test/v4171-comment-checker.test.mjs
node ../../scripts/audit-runtime-imports.mjs --root dist --config runtime/runtime-audit.json
```

The v4.17.1 contract tests execute the committed dist. Then run the inherited plugin packaging gate.

## ANTI-PATTERNS

- Do not patch dist alone.
- Do not make optional checker absence a blocking error.
- Do not copy upstream edit names into aggregate matchers without adapting the payload contract.
- Do not couple this standalone package to internal upstream application source trees.
