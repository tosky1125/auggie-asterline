#!/usr/bin/env bash
set -u

evidence=".asterline/evidence/task-17-auggie-smoke.txt"
mkdir -p "$(dirname "$evidence")"

{
  echo "Asterline Auggie local smoke"
  echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "command=timeout 45s auggie --plugin-dir . command list"
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
if timeout 45s auggie --plugin-dir . command list >"$tmp" 2>&1; then
  status="PASS"
else
  code=$?
  status="FAIL"
  echo "exit_code=$code" >> "$evidence"
fi

cat "$tmp" >> "$evidence"
rm -f "$tmp"

if grep -Eiq "manifest|invalid plugin|no such file|enoent|schema|cannot find|failed to load" "$evidence"; then
  status="FAIL"
fi

for name in clean-ai-code code-engineer code-intel code-intel-setup comment-guard debug-trace deep-research git-flow health-check init-knowledge reshape-code review-pass rule-sync run-plan ui-polish upstream-fix upstream-report visual-check work-loop work-plan; do
  if ! grep -q "asterline:${name}" "$evidence"; then
    echo "missing_command=$name" >> "$evidence"
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
if command -v rg >/dev/null 2>&1; then
  rg -n '\$omo:|/omo:|\$lcx|lcx-|ulw-loop|ulw-plan|LazyCodex|lazycodex|lazycodex-ai|omo-codex|lazycodex-generated|\(omo\)|\bOmO\b|\bOMO\b|\bCodex\b|\bcodex\b|CODEX|\.codex|codex-|openai/codex|create_goal|call_omo_agent|[A-Za-z]Codex|Codex[A-Za-z]' \
    plugins/asterline/.augment-plugin/plugin.json \
    plugins/asterline/hooks/hooks.json \
    plugins/asterline/hooks/bin \
    plugins/asterline/.mcp.json \
    plugins/asterline/package.json \
    plugins/asterline/skills \
    plugins/asterline/components/*/README.md \
    plugins/asterline/components/*/NOTICE \
    plugins/asterline/components/*/package.json \
    plugins/asterline/components/*/directive.md \
    plugins/asterline/components/*/hooks \
    plugins/asterline/components/*/skills \
    plugins/asterline/components/*/dist \
    plugins/asterline/mcp/*/dist >"$scan_tmp" 2>&1 || true
else
  grep -RInE '\$omo:|/omo:|\$lcx|lcx-|ulw-loop|ulw-plan|LazyCodex|lazycodex|lazycodex-ai|omo-codex|lazycodex-generated|\(omo\)|\bOmO\b|\bOMO\b|\bCodex\b|\bcodex\b|CODEX|\.codex|codex-|openai/codex|create_goal|call_omo_agent|[A-Za-z]Codex|Codex[A-Za-z]' \
    plugins/asterline/.augment-plugin/plugin.json \
    plugins/asterline/hooks/hooks.json \
    plugins/asterline/hooks/bin \
    plugins/asterline/.mcp.json \
    plugins/asterline/package.json \
    plugins/asterline/skills \
    plugins/asterline/components/*/README.md \
    plugins/asterline/components/*/NOTICE \
    plugins/asterline/components/*/package.json \
    plugins/asterline/components/*/directive.md \
    plugins/asterline/components/*/hooks \
    plugins/asterline/components/*/skills \
    plugins/asterline/components/*/dist \
    plugins/asterline/mcp/*/dist >"$scan_tmp" 2>&1 || true
fi
if [ -s "$scan_tmp" ]; then
  echo "legacy_public_surface_scan_present=true" >> "$evidence"
  cat "$scan_tmp" >> "$evidence"
  status="FAIL"
fi
rm -f "$scan_tmp"

{
  echo
  echo "status=$status"
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "cleanup: rm -f $tmp $scan_tmp; no long-running resources spawned"
} >> "$evidence"

cat "$evidence"

if [ "$status" = "FAIL" ]; then
  exit 1
fi
