# COMMENT-CHECKER COMPONENT

## OVERVIEW

Post-edit adapter that converts supported edit payloads into the optional native comment checker contract. Warnings block with a normalized reason; missing checker, malformed input, and operational errors fail open.

## FLOW

```text
parent PostToolUse wrapper
  -> dist/cli.js
  -> strict hook input guard
  -> request-extractor / apply-patch parser
  -> native checker subprocess
  -> capped warning feedback
```

## LOCAL CONTRACTS

- Avoid `unknown` casts when handwritten boundary guards can narrow the payload.
- Keep raw patch and structured metadata extraction behavior aligned. Structured `files`, `result.files`, or `metadata.files` takes precedence.
- Ignore deletes, empty additions, failed tool output, and unsupported tool names.
- Cap subprocess stdout/stderr and user feedback; preserve the tighter context-pressure feedback budget.
- `@code-yeongyu/comment-checker` remains optional. Missing/native errors must not break the hook.
- Preserve the stable PostToolUse JSON adapter and newline normalization.
- Do not expose this component as an MCP server.

## INSTALLED WIRING

The aggregate plugin uses `comment-guard-post-tool-use.sh` and Auggie matchers `str-replace-editor|save-file`. The extractor currently recognizes `write`, `edit`, `multiedit`, `multi_edit`, and `apply_patch`; wrappers do not translate names. Require an end-to-end Auggie payload test before claiming the installed hook checks edits.

The standalone README/package references a component plugin manifest that is absent here. The parent plugin manifest is authoritative for this checkout.

## VALIDATION

```bash
npm run check
npm test
node dist/cli.js hook post-tool-use < test/fixtures/post-tool-use.json
```

CLI tests execute committed dist while most unit tests import source. Then run the inherited plugin packaging gate.

## ANTI-PATTERNS

- Do not patch dist alone.
- Do not make optional checker absence a blocking error.
- Do not copy upstream edit names into aggregate matchers without adapting the payload contract.
- Do not couple this standalone package to internal upstream application source trees.
