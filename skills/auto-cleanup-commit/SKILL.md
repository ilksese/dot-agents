---
name: auto-cleanup-commit
description: Clean up ignored files (per .gitignore + built-in paths) from unpushed commits; drop commits that become empty
---

# Auto Cleanup Commit

## Goal

Remove files from unpushed commits that should have been ignored (per `.gitignore` or built-in ignore paths), without touching the working tree. If a commit becomes empty after removal, drop it entirely.

## Constraints (mandatory)

- Never execute `git push` or any of its subcommands
- Never modify, create, or delete working directory files — index-only operations only (`git rm --cached`). Note: `git rm --cached` will cause the removed files to become untracked in the working tree; this is expected and acceptable.
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

## Workflow (checklist)

### 1. Validate environment and assert working tree is clean

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "HEAD" ]; then
  echo "ERROR: detached HEAD — not on a valid branch"
  exit 1
fi

git status --porcelain
```

If non-empty output, warn and stop — uncommitted changes would interfere with rebase.

### 2. Determine the base commit ("upstream")

```bash
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null)

if [ -n "$UPSTREAM" ]; then
  # Case A: Remote tracking branch exists. Compare local with remote.
  USE_ROOT=0
else
  # Case B/C/D: No remote branch — detect local base branch
  if git show-ref --verify --quiet refs/heads/main; then
    BASE_BRANCH="main"
  elif git show-ref --verify --quiet refs/heads/master; then
    BASE_BRANCH="master"
  else
    BASE_BRANCH=""
  fi

  if [ -n "$BASE_BRANCH" ] && [ "$CURRENT_BRANCH" = "$BASE_BRANCH" ]; then
    # Case B: Current branch IS the base branch with no remote — show all commits
    USE_ROOT=1
  elif [ -n "$BASE_BRANCH" ]; then
    # Case C: Feature branch, compare with the local base branch
    UPSTREAM="$BASE_BRANCH"
    USE_ROOT=0
  else
    # Case D: No main/master branch found at all — show all commits
    USE_ROOT=1
  fi
fi
```

### 3. List the target commits

```bash
if [ "$USE_ROOT" -eq 1 ]; then
  LOG_RANGE="$CURRENT_BRANCH"
else
  LOG_RANGE="$UPSTREAM..$CURRENT_BRANCH"
fi

git log "$LOG_RANGE" --oneline --format="%C(yellow)%h%C(reset) - %s %C(green)(%cd)%C(reset)" --date=short
```

If no commits shown, report "no unpushed commits" and exit.

### 4. Record original commit SHAs for deliverable

```bash
if [ "$USE_ROOT" -eq 1 ]; then
  git log --format="%H %s" > /tmp/cleanup-before.txt
else
  git log --format="%H %s" "$UPSTREAM..HEAD" > /tmp/cleanup-before.txt
fi
```

### 5. Interactive rebase — mark all target commits as `edit`

```bash
if [ "$USE_ROOT" -eq 1 ]; then
  GIT_SEQUENCE_EDITOR="sed -i '' 's/^pick/edit/'" git rebase -i --root
else
  GIT_SEQUENCE_EDITOR="sed -i '' 's/^pick/edit/'" git rebase -i "$UPSTREAM"
fi
```

**Platform note**: `sed -i ''` is macOS/BSD syntax. On Linux, use `sed -i 's/^pick/edit/'` (no empty backup extension).

If the branch contains merge commits, add `--rebase-merges` to the rebase command to preserve merge topology. Merge commits themselves are left untouched (not edited).

### 6. For each commit in edit mode, repeat these sub-steps

#### 6a. List files in the current commit

```bash
git diff-tree --no-commit-id --name-only -r HEAD
```

This works regardless of whether the commit is a root commit or has parents, and it reads directly from the commit tree (not the index).

#### 6b. Identify files to remove

For each file, mark for removal if:

- It matches any built-in ignored path (see above), OR
- `git check-ignore --no-index -- <file>` exits with code 0

Using `--no-index` ensures the check works on files that are already tracked by git.

**Performance tip**: Batch the check by piping all files through `git check-ignore --stdin --no-index` to avoid spawning a process per file.

#### 6c. Remove matched files from index only

```bash
git rm --cached -- <file1> <file2> ...
```

The `--` prevents paths starting with `-` from being interpreted as options. `git rm --cached` only removes from the index; the working directory file remains on disk but becomes untracked.

#### 6d. Check if commit is now empty

```bash
if git diff --cached --quiet; then
  IS_EMPTY=1
else
  IS_EMPTY=0
fi
```

If `IS_EMPTY=1`, there are no staged changes (all files were ignored). If `IS_EMPTY=0`, meaningful changes remain.

#### 6e. Rewrite the commit

- **Files removed + remaining changes** (`IS_EMPTY=0`):
  ```bash
  git commit --amend --no-edit
  git rebase --continue
  ```
- **Files removed + no remaining changes** (`IS_EMPTY=1`):
  ```bash
  git rebase --skip
  ```
  `git rebase --skip` drops the current (now empty) commit and continues the rebase. This works correctly for both root and non-root commits.
- **No files removed**:
  ```bash
  git rebase --continue
  ```

### 7. Handle special cases during rebase

- **Conflict during rebase**: abort immediately with `git rebase --abort`. Conflicts indicate the commit cannot be cleanly replayed — the user must resolve manually. Never use `--skip` to resolve conflicts (it drops the entire commit, including meaningful changes).
- **Rebase aborted**: `git rebase --abort` restores the original history and working tree.
- **Merge commits**: if `--rebase-merges` is in use, merge commits will be preserved but not edited. The `edit` flag only applies to non-merge commits in the todo list.

### 8. Verify result

```bash
echo "=== Rewritten commits ==="
if [ "$USE_ROOT" -eq 1 ]; then
  git log --oneline
else
  git log --oneline "$UPSTREAM..HEAD"
fi

echo ""
echo "=== Checking for remaining ignored files ==="

if [ "$USE_ROOT" -eq 1 ]; then
  RANGE="$(git rev-list --max-parents=0 HEAD)..HEAD"
else
  RANGE="$UPSTREAM..HEAD"
fi

git diff "$RANGE" --name-only | while IFS= read -r f; do
  if git check-ignore --no-index -- "$f" >/dev/null 2>&1; then
    echo "WARNING: .gitignore-ignored file still present: $f"
  fi
  case "$f" in
    docs/superpowers/*|.codegraph/*|.superpowers/*|.vercel/cache/*|.vercel/node/*)
      echo "WARNING: built-in ignored file still present: $f" ;;
    tsconfig.tsbuildinfo|.playwright*)
      echo "WARNING: built-in ignored file still present: $f" ;;
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
