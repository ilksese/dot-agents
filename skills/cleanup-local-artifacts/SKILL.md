---
name: "cleanup-local-artifacts"
description: "Clean task byproducts from the current git repo: log files, screenshots, scratch test files, and local branches or git worktrees already absorbed by dev, main, or master. Use when the user asks to clean artifacts, leftover files, merged local branches, or worktrees from this task or earlier tasks. Squash and rebase merges do not show up in git branch --merged or git cherry; compare content before deleting a branch."
---

# Cleanup Local Artifacts

Remove byproducts of the current task and earlier tasks from the current repository. Report what was removed, what was kept, and why.

## Scope

In scope:

- Untracked or ignored byproducts: logs, screenshots, traces, HAR files, coverage output, Playwright reports, debug dumps, `conflict-*.md`.
- Scratch test files created for a task and never meant to stay. Do not delete tracked tests that belong to the project's test suite.
- Local branches whose changes are already on `dev`, `main`, or `master`.
- Git worktrees that only exist to hold such a branch, and stale worktree registrations.

Out of scope unless the user names them:

- `.codegraph/`
- `.env*` files. Do not read them.
- The current branch, `dev`, `main`, `master`, and any branch checked out in a worktree.
- Remote branches. Do not fetch, push, or delete them.
- `node_modules`, lockfiles, and tracked source.

## 1. Inventory

Record the current branch, worktrees (`git worktree list`), and local branches. A detached `HEAD` or an in-progress rebase, merge, or cherry-pick stops the branch and worktree cleanup; file cleanup may continue.

List candidate files with the repo's ignore rules. Keep asset images under source directories. A file is a byproduct only when its name, location, or git status shows it is a log, screenshot, trace, or scratch output.

Completion: every candidate is classified as remove, keep, or unknown. Ask before deleting an unknown file.

## 2. Judge branches by content, not ancestry

`git branch --merged` and `git cherry` answer the wrong question after a squash or rebase merge. A squash creates a new commit, so the old branch is never an ancestor and its patch-ids never match. That mismatch is not evidence the content is missing.

For each local branch other than the current branch and the integration branches:

1. Pick the integration tip that contains the branch's subject. Check local `dev`, `main`, and `master` only; do not invent a remote-tracking branch that is not present. If none of them exists, skip branch deletion and say so.
2. Diff the branch tip against that tip. Ignore test files the project intentionally keeps untracked, and ignore paths the user excluded.
3. A difference is absorbed when the integration tip already has that change, or has a newer version of it. A comment rewritten into a shorter comment, a layout replaced by a later fix, and a file deleted on purpose are absorbed. A line, behavior, or file that exists only on the branch is not.
4. Intermediate branch tips are expected to differ. A later commit on another local branch, or the squash commit itself, usually replaced that intermediate text. Compare the branch's unique content with the final integration tree, not each old line with today's file.
5. Delete a branch only when every difference is absorbed. One unabsorbed difference keeps the whole branch. Deleting the branch name does not delete its commits while another branch or the reflog still points at them; say which one still holds them.

`git branch -D` is appropriate here because the ancestry check is exactly the check that gives false negatives. Do not use it for a branch that failed step 5.

Completion: each branch is either deleted or kept with one concrete unabsorbed difference named.

## 3. Worktrees

Remove a worktree only when it is not the current worktree and its branch was deleted in step 2, or it has no branch and its `HEAD` is already contained in an integration tip. A worktree with uncommitted changes, or a branch that was kept, stays. Use `git worktree remove` without `--force` unless the user explicitly confirms forced removal. Run `git worktree prune` only for registrations whose directory is already gone.

## 4. Report

State what was deleted, what was kept, and the reason for each kept branch or unknown file. Do not claim a branch was never merged when the evidence only shows it is not an ancestor.
