#!/usr/bin/env bash
set -u

evidence=".asterline/evidence/task-17-auggie-smoke.txt"
mkdir -p "$(dirname "$evidence")"

{
  echo "Asterline Auggie local smoke"
  echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "command=timeout 45s auggie --plugin-dir . command list"
  echo "command=timeout 45s auggie --plugin-dir . mcp list"
  echo
} > "$evidence"

if ! command -v auggie >/dev/null 2>&1; then
  {
    echo "status=FAIL"
    echo "reason=auggie binary not found"
    echo "cleanup: no runtime resources spawned"
  } >> "$evidence"
  cat "$evidence"
  exit 1
fi

tmp="$(mktemp)"
mcp_tmp="$(mktemp)"
if timeout 45s auggie --plugin-dir . command list >"$tmp" 2>&1; then
  status="PASS"
else
  code=$?
  status="FAIL"
  echo "exit_code=$code" >> "$evidence"
fi

cat "$tmp" >> "$evidence"
if timeout 45s auggie --plugin-dir . mcp list >"$mcp_tmp" 2>&1; then
  cat "$mcp_tmp" >> "$evidence"
else
  echo "mcp_exit_code=$?" >> "$evidence"
  cat "$mcp_tmp" >> "$evidence"
  status="FAIL"
fi

if grep -Eiq "manifest|invalid plugin|no such file|enoent|schema|cannot find|failed to load|unknown property|invalid hook configuration" "$evidence"; then
  status="FAIL"
fi

for name in clean-ai-code code-engineer code-intel code-intel-setup comment-guard debug-trace deep-research deep-work git-flow health-check init-knowledge reshape-code review-pass rule-sync run-plan session-history structure-search team-mode ui-polish upstream-fix upstream-report visual-check web-access work-loop work-plan; do
  if ! grep -q "asterline:${name}" "$evidence"; then
    echo "missing_command=$name" >> "$evidence"
    status="FAIL"
  fi
done

for name in ast_grep codegraph context7 grep_app lsp; do
  if ! grep -q "$name" "$mcp_tmp"; then
    echo "missing_mcp=$name" >> "$evidence"
    status="FAIL"
  fi
done

if grep -Eq "asterline:(atlas|blueprint|cleanroom|codestyle|commentlint|deepmap|inspect|pixelproof|refinery|ruleweaver|run|symbolwire|tracebug|comment-checker|ulw-loop|ulw-plan|start-work|review-work|remove-ai-slops|lcx-)([[:space:]]|$)" "$evidence"; then
  echo "legacy_command_alias_present=true" >> "$evidence"
  status="FAIL"
fi

if grep -Eq 'lazycodex|LazyCodex|lazycodex-ai|omo-codex|lazycodex-generated|\(omo\)|\bOmO\b|\bOMO\b|create_goal|\$omo:|/omo:' "$evidence"; then
  echo "legacy_public_identity_present=true" >> "$evidence"
  status="FAIL"
fi

scan_tmp="$(mktemp)"
if node scripts/validate-marketplace.mjs >"$scan_tmp" 2>&1; then
  cat "$scan_tmp" >> "$evidence"
else
  echo "marketplace_validation_failed=true" >> "$evidence"
  cat "$scan_tmp" >> "$evidence"
  status="FAIL"
fi
rm -f "$scan_tmp"
rm -f "$tmp" "$mcp_tmp"

{
  echo
  echo "status=$status"
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "cleanup: rm -f $tmp $mcp_tmp $scan_tmp; no long-running resources spawned"
} >> "$evidence"

cat "$evidence"

if [ "$status" = "FAIL" ]; then
  exit 1
fi
