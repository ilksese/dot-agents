---
name: auto-cleanup-commit
description: Clean up ignored files (per .gitignore + built-in paths) from unpushed commits; drop commits that become empty
---

# Auto Cleanup Commit

## Goal
Remove files from unpushed commits that should have been ignored (per `.gitignore` or built-in ignore paths), without touching the working tree. If a commit becomes empty after removal, drop it entirely.

## Constraints (mandatory)
- Never execute `git push` or any of its subcommands
- Never modify, create, or delete working directory files — index-only operations only (`git rm --cached`)
- Never use `git filter-branch` (deprecated, unsafe); always use interactive rebase

## Built-in Ignored Paths
Always treat these as ignored, regardless of `.gitignore`:
- `docs/superpowers/**`
- `.codegraph/**`
- `tsconfig.tsbuildinfo`
- `.superpowers/**`
- `.playwright*/**`
- `.vercel/cache/**`
- `.vercel/node/**`

## Input
- `$1`: (optional) branch name to clean. If provided, compares against `origin/$1`; if omitted, uses the current branch's upstream (`@{u}`).

## Workflow (checklist)

### 1. Assert working tree is clean
```bash
git status --porcelain
```
If non-empty output, warn and stop — uncommitted changes would interfere with rebase.

### 2. Determine upstream and commit range
```bash
if [ -n "$1" ]; then
  UPSTREAM="origin/$1"
else
  UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null) || {
    echo "ERROR: no upstream configured for current branch and no branch name provided"
    exit 1
  }
fi

git log --oneline "$UPSTREAM..HEAD"
```
If no commits shown, report "no unpushed commits" and exit.

### 3. Record original commit SHAs for deliverable
```bash
git log --format="%H %s" "$UPSTREAM..HEAD" > /tmp/cleanup-before.txt
```

### 4. Interactive rebase — mark all target commits as `edit`
```bash
GIT_SEQUENCE_EDITOR="sed -i '' 's/^pick/edit/'" git rebase -i "$UPSTREAM"
```
If the branch contains merge commits, add `--rebase-merges` to the rebase command to preserve merge topology. Merge commits themselves are left untouched (not edited).

### 5. For each commit in edit mode, repeat these sub-steps

#### 5a. List files in the current commit
```bash
git diff-tree --no-commit-id --name-only -r HEAD
```
This works regardless of whether the commit is a root commit or has parents, and it reads directly from the commit tree (not the index).

#### 5b. Identify files to remove
For each file, mark for removal if:
- It matches any built-in ignored path (see above), OR
- `git check-ignore --no-index -- <file>` exits with code 0

Using `--no-index` ensures the check works on files that are already tracked by git.

#### 5c. Remove matched files from index only
```bash
git rm --cached -- <file1> <file2> ...
```
The `--` prevents paths starting with `-` from being interpreted as options. `git rm --cached` only removes from the index; the working directory file remains untouched (but becomes untracked — this is expected).

#### 5d. Check if commit is now empty
```bash
git diff --cached --quiet && rc=$? || rc=$?
```
If `rc=0`, there are no staged changes (empty commit). If `rc=1`, changes remain.

#### 5e. Rewrite the commit
- **Files removed + remaining changes**:
  ```bash
  git commit --amend --no-edit
  ```
- **Files removed + no remaining changes (empty commit)**:
  ```bash
  git reset --soft "$UPSTREAM" && git rebase --continue
  ```
  Using `$UPSTREAM` as the reset target is safe: it resets HEAD to the upstream base, effectively dropping the empty commit. This works correctly for both root and non-root commits in the rebase sequence.
- **No files removed**:
  ```bash
  git rebase --continue
  ```

### 6. Handle special cases during rebase
- **Conflict during rebase**: abort immediately with `git rebase --abort`. Conflicts indicate the commit cannot be cleanly replayed — the user must resolve manually. Never use `--skip` as it drops the entire commit.
- **Rebase aborted**: `git rebase --abort` restores the original history and working tree.
- **Merge commits**: if `--rebase-merges` is in use, merge commits will be preserved but not edited. The `edit` flag only applies to non-merge commits in the todo list.

### 7. Verify result
```bash
echo "=== Rewritten commits ==="
git log --oneline "$UPSTREAM..HEAD"

echo ""
echo "=== Checking for remaining ignored files ==="
git diff "$UPSTREAM..HEAD" --name-only | while IFS= read -r f; do
  if git check-ignore --no-index -- "$f" >/dev/null 2>&1; then
    echo "WARNING: .gitignore-ignored file still present: $f"
  fi
  # Check built-in ignored paths
  case "$f" in
    docs/superpowers/*|.codegraph/*) echo "WARNING: built-in ignored file still present: $f" ;;
    tsconfig.tsbuildinfo|.superpowers/*|.playwright*) echo "WARNING: built-in ignored file still present: $f" ;;
  esac
done
echo "=== Done ==="
```

## Deliverable
Report:
- The list of rewritten commits (original SHAs vs new SHAs)
- How many files were removed across all commits
- Whether any commits were dropped because they became empty
- Confirmation that no ignored files remain in history
