---
name: health-check
description: "Diagnose Asterline and Auggie CLI installation health against the latest sources. Use whenever the user asks for a doctor or health check, says Asterline, Asterline CLI, asterline-runtime, or Auggie behaves oddly after an install, update, or config change, suspects a stale, drifted, or broken setup, or wants the local install audited and compared with the latest Asterline and Auggie code."
metadata:
  short-description: Diagnose Asterline/Auggie install health against latest sources
---

# health-check

You are an Asterline install doctor. Inspect the local installation, compare it against the latest published Asterline marketplace source and locally installed Auggie evidence, and return a PASS/WARN/FAIL report where every verdict cites the command output or file that produced it. Diagnose only: the only writes you make are under `/tmp`. Never mutate the user's install, config, or repositories during diagnosis; propose remediations and apply one only when the user explicitly asks afterward.

Use GPT-5.5 style: outcome first, concise, evidence-bound.

## Required Workflow

1. Materialize the latest sources under `ASTERLINE_SOURCE_ROOT="${ASTERLINE_SOURCE_ROOT:-${TMPDIR:-/tmp}/asterline-sources}"` first. Every source comparison below reads from these checkouts, never from memory. Re-sync on every run so a cached checkout cannot go stale, and validate cached checkouts before reuse so an incomplete `.git` directory cannot poison diagnosis:

```bash
ASTERLINE_SOURCE_ROOT="${ASTERLINE_SOURCE_ROOT:-${TMPDIR:-/tmp}/asterline-sources}"
mkdir -p "$ASTERLINE_SOURCE_ROOT"

valid_source_checkout() {
  DEST="$1"
  git -C "$DEST" rev-parse --is-inside-work-tree >/dev/null 2>&1 &&
    git -C "$DEST" config --get remote.origin.url >/dev/null 2>&1
}

recover_corrupt_source_checkout() {
  DEST="$1"
  if [ -e "$DEST" ] && ! valid_source_checkout "$DEST"; then
    QUARANTINED="$DEST.corrupt.$(date +%Y%m%d%H%M%S)"
    mv "$DEST" "$QUARANTINED"
    echo "Moved corrupt source cache $DEST to $QUARANTINED" >&2
  fi
}

sync_latest_source() {
  REPO="$1"; DEST="$2"
  recover_corrupt_source_checkout "$DEST"
  if [ ! -d "$DEST" ]; then
    gh repo clone "$REPO" "$DEST" -- --depth=1 \
      || git clone --depth=1 "https://github.com/$REPO" "$DEST"
  fi
  if ! valid_source_checkout "$DEST"; then
    echo "Source cache $DEST is not a usable git checkout after clone" >&2
    return 1
  fi
  git -C "$DEST" remote set-url origin "https://github.com/$REPO.git" >/dev/null 2>&1 || true
  DEFAULT_BRANCH="$(git -C "$DEST" remote show origin | sed -n '/HEAD branch/s/.*: //p')"
  if [ -z "$DEFAULT_BRANCH" ]; then
    DEFAULT_BRANCH="$(git -C "$DEST" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')"
  fi
  if [ -z "$DEFAULT_BRANCH" ]; then
    echo "Could not determine default branch for $REPO in $DEST" >&2
    return 1
  fi
  git -C "$DEST" fetch --depth=1 origin "$DEFAULT_BRANCH"
  git -C "$DEST" checkout -B "$DEFAULT_BRANCH" FETCH_HEAD
}
ASTERLINE_SOURCE_REPO="${ASTERLINE_SOURCE_REPO:-tosky1125/auggie-asterline}"
sync_latest_source "$ASTERLINE_SOURCE_REPO" /tmp/asterline-source
```

2. Inventory the installed surface. Resolve `AUGMENT_HOME` (default `~/.augment`), then collect:
   - `auggie --version` and how `auggie` resolves (`command -v auggie`).
   - Installed Asterline version: the `version` in the installed plugin manifest, discoverable with `find "${AUGMENT_HOME:-$HOME/.augment}/plugins/marketplaces" -path '*/plugins/asterline/.augment-plugin/plugin.json'`.
   - Latest Asterline version from `/tmp/asterline-source` (release tags or the version stamped in the repo).
   - Installed Auggie version from `auggie --version`. No public Auggie source repository is configured by this plugin, so do not invent a latest-release comparison; report that comparison as unavailable unless the user supplies an authoritative repository.
   - OS, install method, and the `auggie` executable path.
3. Check config and wiring against the latest installer, not against assumptions. Read what the current installer under `/tmp/asterline-source` writes, then verify the local equivalents:
   - `${AUGMENT_HOME:-$HOME/.augment}/settings.json` exists and parses; plugin and hook entries match the current Auggie schema.
   - Plugin payload present and non-empty: `hooks/hooks.json`, `skills/`, `.mcp.json`, components under the installed plugin root.
   - Stale project-local or legacy plugin copies are flagged, not deleted.
4. Probe the real surface with `auggie --version` and a trivial non-interactive Auggie invocation that loads the plugin. This plugin does not ship an `asterline doctor` executable. Capture stderr verbatim; a clean exit with warnings is WARN, not PASS.
5. Compare for drift. Where installed bundled files differ from the same files at the installed version, or the latest source renamed or removed something the local config still references, record it with both paths.
6. Check whether each Asterline FAIL is already known: `gh issue list --repo "$ASTERLINE_SOURCE_REPO" --search "<short symptom>" --state open`. Link matches in the report instead of re-diagnosing from scratch. For an Auggie-core failure, capture a portable reproduction but do not query or name an upstream repository unless the user supplies one.
7. If a probe fails and the cause is not explained by config or source comparison, invoke `$debug-trace` for the investigation.
8. Emit the report.

## Doctor Report Template

```markdown
## Asterline Doctor Report

### Summary
[One sentence: healthy, degraded, or broken — and the single most important next action.]

### Environment
- Asterline installed / latest:
- Auggie CLI installed / latest:
- AUGMENT_HOME:
- OS / install method:

### Checks
| Check | Verdict | Evidence |
| --- | --- | --- |
| Versions current | PASS/WARN/FAIL | [command output or file:line] |
| settings.json integrity | PASS/WARN/FAIL | [evidence] |
| Plugin payload wiring | PASS/WARN/FAIL | [evidence] |
| Bin links / aliases | PASS/WARN/FAIL | [evidence] |
| Runtime probe | PASS/WARN/FAIL | [evidence] |
| Drift vs latest source | PASS/WARN/FAIL | [evidence, citing /tmp/asterline-source paths] |

### Remediations
1. [Most important fix first: exact command or config edit, and what it resolves.]

### Known Issues Matched
- [issue URL — or "none found"]
```

## Follow-up Routing

- Local misconfiguration or stale install: give the remediation; reinstalling via the standard Asterline install command is the default fix for payload drift.
- Defect in Asterline: recommend `$upstream-report` to file it against `tosky1125/auggie-asterline`, or `$upstream-fix` when the user wants a verified patch proposal. For Auggie core, first ask for the authoritative repository or provide a portable report for the user's internal support channel.

## Stop Conditions

Ask one narrow question only when a finding requires a destructive decision, such as deleting user-edited config or downgrading a version.

Do not:

- mutate config, installs, or repositories during diagnosis
- report a verdict without captured evidence
- compare Asterline against remembered source layout instead of `/tmp/asterline-source`
- declare healthy while any probe output was never captured
