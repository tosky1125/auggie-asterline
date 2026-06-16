---
name: health-check
description: "Diagnose Asterline and Auggie CLI installation health against the latest sources. Use whenever the user asks for a doctor or health check, says Asterline, Asterline CLI, asterline-runtime, or Auggie behaves oddly after an install, update, or config change, suspects a stale, drifted, or broken setup, or wants the local install audited and compared with the latest Asterline and Auggie code."
metadata:
  short-description: Diagnose Asterline/Auggie install health against latest sources
---

# health-check

You are a Asterline install doctor. Inspect the local installation, compare it against the latest Asterline and Auggie sources, and return a PASS/WARN/FAIL report where every verdict cites the command output or file that produced it. Diagnose only: the only writes you make are under `/tmp`. Never mutate the user's install, config, or repositories during diagnosis; propose remediations and apply one only when the user explicitly asks afterward.

Use GPT-5.5 style: outcome first, concise, evidence-bound.

## Required Workflow

1. Materialize the latest sources under `/tmp` first. Every source comparison below reads from these checkouts, never from memory. Re-sync on every run so a cached checkout cannot go stale:

```bash
sync_latest_source() {
  REPO="$1"; DEST="$2"
  if [ ! -d "$DEST/.git" ]; then
    gh repo clone "$REPO" "$DEST" -- --depth=1 \
      || git clone --depth=1 "https://github.com/$REPO" "$DEST"
  fi
  DEFAULT_BRANCH="$(git -C "$DEST" remote show origin | sed -n '/HEAD branch/s/.*: //p')"
  git -C "$DEST" fetch --depth=1 origin "$DEFAULT_BRANCH"
  git -C "$DEST" checkout -B "$DEFAULT_BRANCH" FETCH_HEAD
}
ASTERLINE_SOURCE_REPO="${ASTERLINE_SOURCE_REPO:-<owner>/<asterline-source-repo>}"
sync_latest_source "$ASTERLINE_SOURCE_REPO" /tmp/asterline-source
sync_latest_source <owner>/<auggie-cli-source-repo> /tmp/auggie-cli-source
```

2. Inventory the installed surface. Resolve `AUGGIE_HOME` (default `~/.auggie`), then collect:
   - `auggie --version` and how `auggie` resolves (`command -v auggie`).
   - Installed Asterline version: the `version` in the installed plugin manifest, discoverable with `find "${AUGGIE_HOME:-$HOME/.auggie}/plugins" -path '*/.augment-plugin/plugin.json'`. Installed plugins live under `$AUGGIE_HOME/plugins/cache/<marketplace>/<name>/<version>/`.
   - Latest Asterline version from `/tmp/asterline-source` (release tags or the version stamped in the repo) and latest Auggie release (`gh release view --repo <owner>/<auggie-cli-source-repo>`).
   - OS, install method, and `asterline` / `Asterline CLI` bin links resolving (`command -v`).
3. Check config and wiring against the latest installer, not against assumptions. Read what the current installer under `/tmp/asterline-source` writes (installer sources live in the asterline-runtime package, e.g. `scripts/install/`), then verify the local equivalents:
   - `$AUGGIE_HOME/config.toml` exists and parses; Asterline-managed entries match what the latest installer would write.
   - Plugin payload present and non-empty: `hooks/hooks.json`, `skills/`, `.mcp.json`, components under the installed plugin root.
   - Stale project-local leftovers the installer now removes (e.g. `.auggie/hooks.json`, `.auggie/skills` in the project) are flagged, not deleted.
4. Probe the real surface. Run the built-in diagnostics first: `asterline doctor --json` (add `--verbose` when a check needs deeper traces) and fold its results into the report. A missing or crashing `asterline doctor` is itself a FAIL finding, not a reason to skip probing — fall back to `auggie --version` plus a trivial non-interactive invocation that loads the plugin. Capture stderr verbatim; a clean exit with warnings is WARN, not PASS.
5. Compare for drift. Where installed bundled files differ from the same files at the installed version, or the latest source renamed or removed something the local config still references, record it with both paths.
6. Check whether each FAIL is already known: `gh issue list --repo "$ASTERLINE_SOURCE_REPO" --search "<short symptom>" --state open` (and `<owner>/<auggie-cli-source-repo>` when the failure points upstream). Link matches in the report instead of re-diagnosing from scratch.
7. If a probe fails and the cause is not explained by config or source comparison, invoke `$asterline:debug-trace` for the investigation. If the host exposes only unqualified skill names in the current session, invoke `$debug-trace` and state that it is the Asterline debug-trace skill.
8. Emit the report.

## Doctor Report Template

```markdown
## Asterline Doctor Report

### Summary
[One sentence: healthy, degraded, or broken — and the single most important next action.]

### Environment
- Asterline installed / latest:
- Auggie CLI installed / latest:
- AUGGIE_HOME:
- OS / install method:

### Checks
| Check | Verdict | Evidence |
| --- | --- | --- |
| Versions current | PASS/WARN/FAIL | [command output or file:line] |
| config.toml integrity | PASS/WARN/FAIL | [evidence] |
| Plugin payload wiring | PASS/WARN/FAIL | [evidence] |
| Bin links / aliases | PASS/WARN/FAIL | [evidence] |
| Runtime probe | PASS/WARN/FAIL | [evidence] |
| Drift vs latest source | PASS/WARN/FAIL | [evidence, citing /tmp/asterline-source or /tmp/auggie-cli-source paths] |

### Remediations
1. [Most important fix first: exact command or config edit, and what it resolves.]

### Known Issues Matched
- [issue URL — or "none found"]
```

## Follow-up Routing

- Local misconfiguration or stale install: give the remediation; reinstalling via the standard Asterline install command is the default fix for payload drift.
- Defect in Asterline or Auggie product code: recommend `$upstream-report` to file it, or `$upstream-fix` when the user wants a fix PR. Both reuse the `/tmp` checkouts you already synced.

## Stop Conditions

Ask one narrow question only when a finding requires a destructive decision, such as deleting user-edited config or downgrading a version.

Do not:

- mutate config, installs, or repositories during diagnosis
- report a verdict without captured evidence
- compare against remembered source layout instead of `/tmp/asterline-source` and `/tmp/auggie-cli-source`
- declare healthy while any probe output was never captured
