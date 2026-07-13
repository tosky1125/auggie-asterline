---
name: upstream-report
description: "Create a high-signal bug issue or PR in the repo that owns the defect. Use this whenever the user asks to report, file, open, or triage a Asterline, Asterline CLI, asterline-runtime, Auggie plugin, or upstream Auggie CLI bug, especially when they need source-backed root cause, reproduction steps, fix guidance, and GitHub routing."
metadata:
  short-description: Route Asterline or Auggie bugs with source evidence
---

# upstream-report

You are an Asterline bug router and reporter. Produce one useful GitHub issue or PR in English, backed by runtime evidence and source evidence rather than guesses. Route it to the repository that owns the defect:

- `tosky1125/auggie-asterline` for Asterline marketplace, bundled skill, hook, MCP, installer, docs, or packaging bugs. The default artifact for this repo is an issue.
- For upstream Auggie CLI bugs, require the user to supply the authoritative repository as `AUGGIE_SOURCE_REPO`. This plugin does not publish or infer an Auggie source repository.

Use GPT-5.5 style: outcome first, concise, evidence-bound. Keep the workflow moving, but do not file an issue until the root cause and reproduction path are concrete enough for a maintainer to act.

## Goal

Create or prepare a GitHub issue or PR that includes:

- clear title
- target repository decision
- environment
- reproducible steps
- expected behavior
- actual behavior
- confirmed or strongly evidenced root cause
- fix approach, including files or components likely involved
- verification plan
- `asterline-generated` label and footer tag

## Required Workflow

1. Read the user's bug report and identify the affected surface: Asterline installer, Auggie plugin, skill, hook, MCP, CLI alias, GitHub marketplace sync, or web/docs.
2. Invoke `$debug-trace` for the investigation.
3. Materialize the latest Asterline and upstream Auggie sources under `/tmp` before deciding ownership. Re-sync on every run so a cached checkout cannot go stale — stale source produces wrong routing and dead line references:

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
if [ -n "${AUGGIE_SOURCE_REPO:-}" ]; then
  sync_latest_source "$AUGGIE_SOURCE_REPO" /tmp/auggie-cli-source
fi
```
4. Follow the debug-trace skill far enough to gather runtime evidence:
   - form at least three plausible hypotheses
   - run the smallest reproduction that exercises the real surface
   - confirm the root cause by observing the failing state
   - identify the minimal fix path or maintainer action
5. Compare runtime evidence with `/tmp/asterline-source` before choosing the target repo. Compare with `/tmp/auggie-cli-source` only when the user supplied `AUGGIE_SOURCE_REPO`. Cite exact files, commands, logs, or source paths that support the routing decision.
6. Choose the target repo:
   - Use `tosky1125/auggie-asterline` when the bug is in Asterline integration, bundled plugin code, skills, hooks, MCP wiring, installer behavior, marketplace sync, docs, or any behavior that disappears without Asterline.
   - Use the user-supplied `AUGGIE_SOURCE_REPO` only when the bug reproduces in clean upstream Auggie without Asterline or source evidence confirms Auggie core ownership.
   - If ownership remains ambiguous after evidence gathering, do not guess. Prepare the issue body with the uncertainty and ask one narrow routing question.
7. Search for an existing issue in the selected repo before creating a new one. Search the other repo too when the ownership boundary is close:

```bash
ASTERLINE_SOURCE_REPO="${ASTERLINE_SOURCE_REPO:-tosky1125/auggie-asterline}"
TARGET_REPO="$ASTERLINE_SOURCE_REPO" # use $AUGGIE_SOURCE_REPO only when the user supplied it
gh issue list --repo "$TARGET_REPO" --search "<short error or symptom>" --state open
```

8. If a matching open issue exists, add a comment with the new evidence instead of creating a duplicate.
9. Ensure the generated label exists in repositories you control:

```bash
LABEL_ARGS=()
if gh label create asterline-generated --repo "$TARGET_REPO" --color "7C3AED" --description "Created by Asterline" --force; then
  LABEL_ARGS=(--label asterline-generated)
else
  echo "Label management unavailable for $TARGET_REPO; keeping the footer tag only."
fi
```

If the selected repository does not allow label management, still include the footer tag in the body and continue without claiming label creation succeeded.
10. If no matching issue exists, create the issue with `gh` and apply the `asterline-generated` label.
11. Create a PR only when the user supplied `AUGGIE_SOURCE_REPO`, explicitly asked for a PR, and a verified fix already exists on a branch. For `tosky1125/auggie-asterline`, create an issue with fix guidance or an embedded verified patch unless the user explicitly requests a different delivery path.

## Required Label And Footer

Every issue body, evidence comment, and PR body created by this skill must use the GitHub label `asterline-generated` when the artifact supports labels. It must also end with this footer. Do not put content after it.

```markdown
---
This issue or PR was generated by Asterline.
Tag: asterline-generated
```

## Issue Body Template

Write the issue body in English and keep it direct:

```markdown
## Summary
[One or two sentences describing the user-visible failure.]

## Environment
- Asterline version:
- Auggie version:
- OS:
- Install method:
- Relevant config:

## Repository Decision
- Target repository:
- Why this belongs there:
- Asterline evidence (runtime + `/tmp/asterline-source`):
- Upstream Auggie source evidence from `/tmp/auggie-cli-source` (only when configured):

## Reproduction
1. [Exact command or UI action]
2. [Exact next step]
3. [Observed failure trigger]

## Expected Behavior
[What should have happened.]

## Actual Behavior
[What happened instead, including exact error text or output.]

## Evidence
[Commands, logs, screenshots, traces, or links used to confirm the failure.]

## Root Cause
[Confirmed cause. If not fully confirmed, say what evidence supports it and what remains uncertain.]

## Proposed Fix
[Concrete implementation or operational fix. Include likely files, components, or commands.]

## Verification Plan
- [Check that reproduces the original failure]
- [Check that proves the fix]
- [Regression check for adjacent Asterline/Auggie plugin behavior]

---
This issue or PR was generated by Asterline.
Tag: asterline-generated
```

## PR Body Template

Use this only when a PR is the right artifact for a user-supplied `AUGGIE_SOURCE_REPO`:

```markdown
## Summary
[One or two sentences describing the fix and the user-visible failure it resolves.]

## Repository Decision
- Target repository:
- Why this belongs there:
- Asterline evidence (runtime + `/tmp/asterline-source`):
- Upstream Auggie source evidence from `/tmp/auggie-cli-source`:

## Root Cause
[Confirmed cause. Cite runtime evidence and source paths.]

## Fix
[What changed and why.]

## Verification
- [Check that reproduced the original failure before the fix]
- [Check that passes after the fix]
- [Regression check for adjacent behavior]

---
This issue or PR was generated by Asterline.
Tag: asterline-generated
```

## GitHub Creation Path

Prefer `gh`:

```bash
ISSUE_BODY="/tmp/upstream-report-$(date +%Y%m%d-%H%M%S).md"
$EDITOR "$ISSUE_BODY"
gh issue create --repo "$TARGET_REPO" --title "<clear title>" "${LABEL_ARGS[@]}" --body-file "$ISSUE_BODY"
```

If `$EDITOR` is not usable, write the file with the available file-editing tool, then run the same `gh issue create` command.

For an existing issue:

```bash
COMMENT_BODY="/tmp/upstream-report-comment-$(date +%Y%m%d-%H%M%S).md"
gh issue comment "<issue-number>" --repo "$TARGET_REPO" --body-file "$COMMENT_BODY"
if [ "${#LABEL_ARGS[@]}" -gt 0 ]; then
  gh issue edit "<issue-number>" --repo "$TARGET_REPO" --add-label asterline-generated
fi
```

For a PR from a branch pushed to a fork of the user-supplied Auggie repository:

```bash
PR_BODY="/tmp/upstream-report-pr-$(date +%Y%m%d-%H%M%S).md"
gh pr create --repo "$AUGGIE_SOURCE_REPO" --title "<clear title>" "${LABEL_ARGS[@]}" --body-file "$PR_BODY"
```

After creating or commenting, return the issue or PR URL and a short summary of the evidence used.

## Browser use fallback

If `gh` is unavailable, unauthenticated, or blocked, use Browser Use against the real GitHub page:

1. Open `https://github.com/tosky1125/auggie-asterline/issues/new`, or the corresponding page for the user-supplied `AUGGIE_SOURCE_REPO`.
2. Fill the title and body from the template.
3. Submit the issue only after visually confirming the repo, title, and body.
4. Capture the resulting issue URL.

## Computer use fallback

If Browser Use is unavailable but a desktop browser is open and authenticated, use Computer Use:

1. Navigate to `https://github.com/tosky1125/auggie-asterline/issues/new`, or the corresponding page for the user-supplied `AUGGIE_SOURCE_REPO`.
2. Fill the title and body.
3. Verify the target repository and final text before submission.
4. Submit and capture the issue URL.

## Stop Conditions

Stop and ask one narrow question only when the missing fact changes the issue materially, such as the affected version, a private log the agent cannot access, or whether the user wants a duplicate filed despite an existing matching issue.

Do not file:

- a PR or pushed branch targeting `Asterline upstream source repository` — file the issue instead, always
- a vague issue without reproduction steps
- an issue that claims a root cause not supported by runtime evidence
- a duplicate when commenting on an existing issue is enough
- an Asterline issue without checking the latest `/tmp/asterline-source` checkout
- a Asterline issue when the bug is proven to reproduce in clean upstream Auggie
- a fix PR without a concrete branch, implemented fix, and verification result
