---
description: Use the @general subagent to push the current branch, create a PR, and attempt a squash merge into the default branch
agent: build
subtask: true
model: opencode/big-pickle
---

Use @general as a subagent to handle the entire workflow below. The primary agent must not run git or gh commands directly.

Ask @general to:

1. Inspect the repository state with `git status --short --branch`.
2. Detect the default branch with `git fetch origin && DEFAULT_REF=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || true) && DEFAULT_BRANCH=${DEFAULT_REF#refs/remotes/origin/} && DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}`.
3. Detect the current branch with `CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)`.
4. Refuse to continue if `CURRENT_BRANCH` equals `DEFAULT_BRANCH`.
5. Push only when needed:
   - If `origin/$CURRENT_BRANCH` does not exist, run `git push -u origin HEAD`.
   - If `origin/$CURRENT_BRANCH` exists and local is ahead, run `git push -u origin HEAD`.
   - If `origin/$CURRENT_BRANCH` is already up to date, skip push.
   - Use `git rev-parse --verify origin/$CURRENT_BRANCH >/dev/null 2>&1` to check whether the remote branch exists.
   - Use `AHEAD_COUNT=$(git rev-list --count origin/$CURRENT_BRANCH..HEAD 2>/dev/null || printf '0')` and `[ "$AHEAD_COUNT" -gt 0 ]` to check whether local commits need pushing.
6. Reuse an existing PR if one exists with `gh pr view --json number,url,state`.
7. Otherwise create one with `gh pr create --fill --base "$DEFAULT_BRANCH" --head "$CURRENT_BRANCH"` and capture the PR number and URL.
8. Merge with `gh pr merge <number> --squash --delete-branch`.
9. If merge is blocked by approvals, checks, or branch protection, stop and report the blocker; do not use `--admin` unless the user explicitly asks.
10. If merge succeeds, run `git checkout "$DEFAULT_BRANCH" && git pull --ff-only`.

Return a concise summary with:

- default branch
- current branch
- whether push was needed
- PR URL
- merge result
- any blocker or required user action
