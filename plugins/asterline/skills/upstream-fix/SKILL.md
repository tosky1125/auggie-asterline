---
name: upstream-fix
description: "Contribute a verified bug fix for Asterline, Asterline CLI, asterline-runtime, bundled Asterline skills, or upstream Auggie CLI bugs. Opens a fork PR only for upstream <owner>/<auggie-cli-source-repo>; Asterline-owned defects become a verified-fix issue on Asterline upstream source repository (never a PR — that repo is a generated distribution mirror). Use when the user asks to fix a bug, contribute a bug fix, contribute to fix bug, open a PR for a bug, or debug and PR a Asterline/Auggie defect."
metadata:
  short-description: Contribute verified Asterline or Auggie bug fixes
---

# upstream-fix

Use this skill to debug a concrete Asterline or Auggie defect, implement the smallest correct fix in a fresh temporary workspace, and deliver it. Work in English, keep the body short, and support every claim with runtime or source evidence.

Route ownership the same way as `$upstream-report`, but the deliverable differs by target:

- `Asterline upstream source repository` for Asterline, Asterline CLI, asterline-runtime, bundled skills, hooks, MCP wiring, installer behavior, marketplace sync, docs, or packaging. Deliverable: a verified-fix issue with the patch embedded. NEVER open a PR or push a branch against this repo — its contents are regenerated from the source tree on every release, so PRs there cannot be merged and will be closed.
- `<owner>/<auggie-cli-source-repo>` for upstream Auggie CLI bugs that reproduce without Asterline or come from Auggie core behavior. Deliverable: a PR from a fork.

## Required Outcome

For `<owner>/<auggie-cli-source-repo>`, create a fork PR that includes:

- a focused branch from a fresh `/tmp` clone/worktree
- reproduction logs from before the fix
- the smallest implementation that fixes the defect
- verification logs from after the fix
- apply `asterline-generated` when label management is available
- the required Asterline footer tag `Tag: asterline-generated`
- cleanup of temporary worktrees and clones

For `Asterline upstream source repository`, create an issue (never a PR) that includes:

- reproduction logs from before the fix
- the root cause with source evidence
- the verified patch as a unified diff, produced and tested in a fresh `/tmp` clone/worktree
- verification logs from after the fix
- the `asterline-generated` label and the footer tag `Tag: asterline-generated`
- cleanup of temporary worktrees and clones

## Required Workflow

1. Read the user's bug report and identify the affected surface.
2. Invoke `$asterline:debug-trace` for the investigation. If only unqualified skill names are exposed, invoke `$debug-trace` and state that it is the Asterline debug-trace skill.
3. Materialize the latest sources, then decide the target repository. Sync both checkouts on every run and compare them before choosing — a stale checkout routes the fix to the wrong repo:

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
4. Create a fresh temporary clone and branch. Do not modify the user's current repository for the target fix unless the current repository is itself the requested target and the user explicitly asked for local edits.

```bash
ASTERLINE_SOURCE_REPO="${ASTERLINE_SOURCE_REPO:-<owner>/<asterline-source-repo>}"
TARGET_REPO="$ASTERLINE_SOURCE_REPO" # or <owner>/<auggie-cli-source-repo>
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
   - `<owner>/<auggie-cli-source-repo>`: generate the PR body with `scripts/create-pr-body.mjs`.
   - `Asterline upstream source repository`: export the verified patch and write the issue body from the Verified-Fix Issue Template below:

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
   - `Asterline upstream source repository`: create the verified-fix issue. Never push a branch to this repo and never run `gh pr create` against it:

```bash
ISSUE_BODY="/tmp/asterline-fix-<short-slug>-issue.md"
gh issue create --repo "$ASTERLINE_SOURCE_REPO" --title "<short fix title>" "${LABEL_ARGS[@]}" --body-file "$ISSUE_BODY"
```

   - `<owner>/<auggie-cli-source-repo>`: fork, push the branch to the fork, and create the PR:

```bash
gh repo fork <owner>/<auggie-cli-source-repo> --remote --remote-name fork
GH_USER="$(gh api user --jq .login)"
git push -u fork "$BRANCH_NAME"
gh pr create --repo <owner>/<auggie-cli-source-repo> --base "$BASE_BRANCH" --head "$GH_USER:$BRANCH_NAME" --title "<short fix title>" "${LABEL_ARGS[@]}" --body-file "$PR_BODY"
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
This fix was debugged, implemented, and verified with [Asterline](https://github.com/<owner>/<asterline-source-repo>).
Tag: asterline-generated
````

## PR Body Generator (<owner>/<auggie-cli-source-repo>)

Use the bundled script to generate the PR body. Create a JSON file with this shape:

```json
{
  "title": "Fix short user-visible failure",
  "targetRepository": "<owner>/<auggie-cli-source-repo>",
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

## PR Body Template (<owner>/<auggie-cli-source-repo>)

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
This PR was debugged, implemented, and created with [Asterline](https://github.com/<owner>/<asterline-source-repo>).
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
