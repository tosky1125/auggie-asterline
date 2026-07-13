---
name: upstream-fix
description: "Contribute a verified bug fix for Asterline, its bundled skills, or Auggie CLI bugs. Asterline-owned defects become verified-fix issues on tosky1125/auggie-asterline. Auggie-core work requires an authoritative repository supplied by the user."
metadata:
  short-description: Contribute verified Asterline or Auggie bug fixes
---

# upstream-fix

Use this skill to debug a concrete Asterline or Auggie defect, implement the smallest correct fix in a fresh temporary workspace, and deliver it. Work in English, keep the body short, and support every claim with runtime or source evidence.

Route ownership the same way as `$upstream-report`, but the deliverable differs by target:

- `tosky1125/auggie-asterline` for Asterline, bundled skills, hooks, MCP wiring, marketplace sync, docs, or packaging. Deliverable: a verified-fix issue with the patch embedded. Do not open a PR unless the user explicitly changes that delivery policy.
- For an Auggie-core defect, require the user to supply the authoritative repository as `AUGGIE_SOURCE_REPO`. The plugin does not publish or infer that repository.

## Required Outcome

For a user-supplied `AUGGIE_SOURCE_REPO`, create a fork PR only when the user requested one and it includes:

- a focused branch from a fresh `${TMPDIR:-/tmp}` clone/worktree
- reproduction logs from before the fix
- the smallest implementation that fixes the defect
- verification logs from after the fix
- apply `asterline-generated` when label management is available
- the required Asterline footer tag `Tag: asterline-generated`
- cleanup of temporary worktrees and clones

For `tosky1125/auggie-asterline`, create an issue that includes:

- reproduction logs from before the fix
- the root cause with source evidence
- the verified patch as a unified diff, produced and tested in a fresh `${TMPDIR:-/tmp}` clone/worktree
- verification logs from after the fix
- the `asterline-generated` label and the footer tag `Tag: asterline-generated`
- cleanup of temporary worktrees and clones

## Required Workflow

1. Read the user's bug report and identify the affected surface.
2. Invoke `$debug-trace` for the investigation.
3. Materialize the latest sources, then decide the target repository. Sync both checkouts on every run and compare them before choosing — a stale checkout routes the fix to the wrong repo:

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
4. Create a fresh temporary clone and branch under `${TMPDIR:-/tmp}`. Do not modify the user's current repository for the target fix unless the current repository is itself the requested target and the user explicitly asked for local edits.

```bash
ASTERLINE_SOURCE_REPO="${ASTERLINE_SOURCE_REPO:-tosky1125/auggie-asterline}"
TARGET_REPO="$ASTERLINE_SOURCE_REPO" # use $AUGGIE_SOURCE_REPO only when the user supplied it
WORK_ROOT="$(mktemp -d /tmp/asterline-fix-XXXXXX)"
gh repo clone "$TARGET_REPO" "$WORK_ROOT/repo" -- --depth=1
cd "$WORK_ROOT/repo"
BASE_BRANCH="$(git remote show origin | sed -n '/HEAD branch/s/.*: //p')"
git fetch origin "$BASE_BRANCH" --depth=1
BRANCH_NAME="asterline/bug-fix-<short-slug>"
git worktree add "$WORK_ROOT/worktree" -b "$BRANCH_NAME" "origin/$BASE_BRANCH"
cd "$WORK_ROOT/worktree"
```

If `gh` cannot clone, use `git clone --depth=1 "https://github.com/$TARGET_REPO" "$WORK_ROOT/repo"` and continue with the same worktree flow.

5. Reproduce the bug in the worktree through the real surface. Save exact command output to `/tmp/asterline-fix-<short-slug>-repro.log`.
6. Write or update a failing regression test before production changes. Confirm it fails for the bug, not for a missing fixture or typo.
7. Implement the smallest correct fix. Avoid reshape-codes unless the fix cannot be made safely without one.
8. Run the regression test, adjacent tests, and the smallest real-surface QA command that proves the user-visible behavior changed.
9. Commit the verified fix in the worktree. Inspect the status first so the delivered diff cannot be empty or stale:

```bash
git status --short
git add -A
git commit -m "fix: <short bug-fix summary>"
git log --oneline "origin/$BASE_BRANCH..HEAD"
```

10. Build the delivery body for the target:
   - User-supplied `AUGGIE_SOURCE_REPO`: generate the PR body with `scripts/create-pr-body.mjs`.
   - `tosky1125/auggie-asterline`: export the verified patch and write the issue body from the Verified-Fix Issue Template below:

```bash
PATCH_FILE="/tmp/asterline-fix-<short-slug>.patch"
git diff "origin/$BASE_BRANCH"..HEAD > "$PATCH_FILE"
```

11. Ensure the generated label exists when the target repo allows label management. Keep the footer tag even when label creation is unavailable:

```bash
LABEL_ARGS=()
if gh label create asterline-generated --repo "$TARGET_REPO" --color "7C3AED" --description "Created by Asterline" --force; then
  LABEL_ARGS=(--label asterline-generated)
else
  echo "Label management unavailable for $TARGET_REPO; keeping the footer tag only."
fi
```

12. Deliver the fix.
   - `tosky1125/auggie-asterline`: create the verified-fix issue. Never push a branch to this repo unless the user explicitly changes the delivery policy:

```bash
ISSUE_BODY="/tmp/asterline-fix-<short-slug>-issue.md"
gh issue create --repo "$ASTERLINE_SOURCE_REPO" --title "<short fix title>" "${LABEL_ARGS[@]}" --body-file "$ISSUE_BODY"
```

   - User-supplied `AUGGIE_SOURCE_REPO`: fork, push the branch to the fork, and create the PR:

```bash
gh repo fork "$AUGGIE_SOURCE_REPO" --remote --remote-name fork
GH_USER="$(gh api user --jq .login)"
git push -u fork "$BRANCH_NAME"
gh pr create --repo "$AUGGIE_SOURCE_REPO" --base "$BASE_BRANCH" --head "$GH_USER:$BRANCH_NAME" --title "<short fix title>" "${LABEL_ARGS[@]}" --body-file "$PR_BODY"
```

13. Clean up:

```bash
cd /
git -C "$WORK_ROOT/repo" worktree remove "$WORK_ROOT/worktree"
find "$WORK_ROOT" -mindepth 1 -maxdepth 1 -exec rm -r -- {} +
rmdir "$WORK_ROOT"
```

Return the PR or issue URL, the reproduction command, the verification command, and the cleanup receipt.

## Verified-Fix Issue Template (Asterline upstream source repository)

Write the issue body in English. Embed the patch verbatim so a maintainer can apply it to the source tree:

````markdown
## Problem Situation
[What failed for the user.]

## Reproduction Logs
[Exact failing command and relevant log excerpt.]

## Root Cause
[Confirmed cause with runtime and source evidence.]

## Verified Fix
[What changed and why this is the smallest correct fix.]

```diff
[Contents of $PATCH_FILE.]
```

## Verification
- [RED test output or repro before the fix]
- [GREEN test output after the fix]
- [Manual QA command and result]

---
This fix was debugged, implemented, and verified with [Asterline](https://github.com/tosky1125/auggie-asterline).
Tag: asterline-generated
````

## PR Body Generator (user-supplied Auggie repository)

Use the bundled script to generate the PR body. Create a JSON file with this shape:

```json
{
  "title": "Fix short user-visible failure",
  "targetRepository": "value of AUGGIE_SOURCE_REPO",
  "problem": "What is broken for the user.",
  "reproductionLogs": "Exact failing command, log excerpt, or trace.",
  "approach": "What changed and why this is the smallest correct fix.",
  "confidence": "Why the diagnosis and fix are strongly supported.",
  "risks": "Risk level and what could regress.",
  "userVisibleBehaviorChanges": "What changes for the user after the PR.",
  "verification": ["failing test before fix", "passing test after fix", "manual QA command"]
}
```

Run:

```bash
PR_INPUT="/tmp/asterline-fix-<short-slug>-pr.json"
PR_BODY="/tmp/asterline-fix-<short-slug>-pr.md"
node "<skill-root>/scripts/create-pr-body.mjs" "$PR_INPUT" "$PR_BODY"
```

## PR Body Template (user-supplied Auggie repository)

The generated body must follow this structure:

```markdown
## Problem Situation
[What failed for the user.]

## Reproduction Logs
[Exact failing command and relevant log excerpt.]

## Approach
[What changed and why.]

## Why I Am Confident
[Evidence that proves the root cause and fix.]

## Risks
[Risk level and possible regressions.]

## User-Visible Behavior Changes
[What users experience after this PR.]

## Verification
- [RED test output or repro before the fix]
- [GREEN test output after the fix]
- [Manual QA command and result]

---
This PR was debugged, implemented, and created with [Asterline](https://github.com/tosky1125/auggie-asterline).
Tag: asterline-generated
```

## Stop Conditions

Stop and ask one narrow question only when:

- the bug cannot be reproduced from available information
- target repository ownership remains ambiguous after comparing Asterline and upstream Auggie evidence
- authentication is missing for creating the issue or pushing and creating the PR
- the fix requires a product decision rather than a technical correction

Do not open:

- a PR or pushed branch targeting `Asterline upstream source repository` — deliver the verified-fix issue instead, always
- a PR or verified-fix issue without a failing-before and passing-after test
- a PR or verified-fix issue without a real-surface QA command
- a PR or issue without the `Tag: asterline-generated` footer
- a verified-fix issue without the patch embedded in a `diff` block
- a vague fix that does not identify the root cause
- a broad reshape-code disguised as a bug fix
