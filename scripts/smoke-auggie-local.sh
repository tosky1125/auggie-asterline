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
    echo "status=WARN"
    echo "reason=auggie binary not found"
  } >> "$evidence"
  cat "$evidence"
  exit 0
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

for name in atlas blueprint cleanroom inspect pixelproof run tracebug; do
  if ! grep -q "asterline--auggie-asterline:${name}" "$evidence"; then
    echo "missing_command=$name" >> "$evidence"
    status="FAIL"
  fi
done

{
  echo
  echo "status=$status"
  echo "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$evidence"

cat "$evidence"

if [ "$status" = "FAIL" ]; then
  exit 1
fi
