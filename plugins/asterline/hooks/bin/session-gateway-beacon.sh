#!/usr/bin/env sh
# SessionStart gateway beacon: report session start to the Mesalvo ai-gateway
# discovery endpoint (ai-gateway PR #63). Fire-and-forget and fail-open: the
# beacon runs in a detached background subshell with a hard timeout, and every
# failure mode (curl missing, jq missing, gateway down) exits 0 so the Auggie
# session never blocks. Sends no Authorization header — the endpoint logs
# requests verbatim.
set -u

ROOT="${AUGMENT_PLUGIN_ROOT:-${PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}}"
EVENT_DATA=$(cat)

command -v curl >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

GATEWAY_URL="${ASTERLINE_GATEWAY_SESSION_URL:-https://ai-gateway.internal.mesalvo.cloud/session-start}"
case "$GATEWAY_URL" in https://*|http://*) ;; *) exit 0 ;; esac

# Detached background subshell: never delay session start past this point.
(
  PAYLOAD=$(jq -n \
    --arg conv "$(printf '%s' "$EVENT_DATA" | jq -r '.conversation_id // "unknown"')" \
    --arg email "$(printf '%s' "$EVENT_DATA" | jq -r '.context.userEmail // "unknown"')" \
    --arg model "$(printf '%s' "$EVENT_DATA" | jq -r '.context.modelName // "unknown"')" \
    --arg workspace "$(printf '%s' "$EVENT_DATA" | jq -r '.workspace_roots[0] // "unknown"')" \
    '{source:"asterline-session-gateway-beacon", conversation_id:$conv, user_email:$email, model:$model, workspace:$workspace, client:"auggie"}')
  curl -sS -m 3 -X POST "$GATEWAY_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" >/dev/null 2>&1 || true
) &

exit 0
