---
name: before-pr
description: "Use when preparing to create or update a PR, before invoking the pr skill or writing the PR body. Clean redundant comments and exclude test changes from the squash-merge result while keeping tests on disk."
---

# Before PR

Prepare a clean squash-merge result by adding one cleanup commit to the PR branch. In this skill, **commits** means all commits belonging to that PR, not merely unpushed commits or the latest commit.

The cleanup commit corrects the final tree; original commits still contain their original changes. Do not rewrite history, amend commits, squash locally, or merge the PR. During the cleanup workflow, do not push; request push authorization only after the workflow has ended, as described in step 5. If nothing needs cleaning, create no commit.

## 1. Establish the PR scope

- Read the applicable project instructions and coding standards.
- Inspect the current branch, index, and working tree. Stop for detached HEAD or an ongoing Git operation. Untracked files and unstaged modifications/deletions are allowed: record and preserve them; they are not part of the committed PR scope.
- Check the index before any cleanup. If staged files exist, list their paths and ask the user to choose: **skip this skill and continue to the next phase**, **commit the staged files themselves**, or **have the Agent help commit them**. Do not choose for the user, unstage, stash, or begin cleanup while waiting.
  - **Skip:** leave HEAD, index, and working files untouched; report `SKIPPED — staged changes`, end cleanup and use the completion/handoff procedure in step 5 without claiming cleanup. Do not immediately re-trigger this skill.
  - **User commits:** pause until the user confirms completion, then recheck the index. Continue only when it is empty; recompute the PR scope after the new commit.
  - **Agent commits:** obtain explicit approval of the staged scope and message, use `commit-work`, and follow the repository's commit rules. Do not add unstaged/untracked files or silently omit staged files. If a rule prevents the requested commit, explain and ask again. After the authorized commit, recheck for an empty index and recompute the PR scope. This user-requested commit is separate from the later cleanup commit.
- Resolve the PR target from an existing PR or the user's explicit target. For GitHub, use `gh`. If neither provides a target, ask; do not guess from the branch's upstream or default to the entire repository history.
- Verify the target reference is available and current; fetch it if needed. Record the original `HEAD` as `BEFORE`, the target SHA, and `BASE=$(git merge-base <target-sha> "$BEFORE")`. Stop if the target or a unique merge base cannot be established.
- Inspect every commit in `BASE..BEFORE`, including merge changes, and the aggregate diff `BASE...BEFORE`. Enumerate paths with rename detection disabled so old and new names are both accounted for. Use NUL-delimited path output when processing filenames programmatically.
- Inspect file contents only for permitted paths; honor restrictions such as not reading `.env*` files, including through Git diffs, backups, or hashing. Leave restricted paths untouched. Review comments in the committed final code, not just isolated diff lines or a locally modified copy.

Completion: the target, base, complete commit range, and candidate comment/test changes are known. Previously pushed commits remain in scope.

## 2. Remove redundant comments

Review comments added or modified by the commits that remain in the final tree. Remove comments that merely restate an assignment, condition, loop, function name, or other self-evident code behavior. Leave unrelated pre-existing comments alone.

Keep comments that explain:

- **Why** an implementation or business decision exists.
- Non-intuitive behavior, workarounds, ordering, side effects, or failure modes.
- Protocol constraints, external contracts, compatibility, or invariants.

Preserve licenses, required documentation, and directives consumed by tools or runtimes, such as lint/type-check directives, coverage pragmas, bundler annotations, and generated-file markers. A short comment is not automatically redundant. When its purpose is unclear, keep it and report the uncertainty.

Edit only comments and the whitespace made unnecessary by their removal. Preserve runtime behavior, syntax, and tool behavior; do not run a bulk comment-stripping regex or refactor the surrounding code. If a candidate file has local changes or is locally deleted, construct its cleaned content from `BEFORE` and update only the index entry (for example, write a Git blob and use `git update-index --cacheinfo`, preserving mode). Keep that file's local bytes/existence unchanged; resulting unstaged comment differences are expected. For initially clean files, clean and stage the working copy normally. Do not stash or overwrite user work to simplify this step.

Completion: each comment change in scope is either removed as pure repetition or retained for a stated purpose; meaningful comments remain intact.

## 3. Exclude test changes, preserve local files

Identify all test files touched anywhere in the commits, across languages and frameworks. Use project test discovery rules, naming conventions, directories, and contents—not just `*.test.ts` / `*.test.tsx`. Include test-only snapshots, fixtures, and helpers when their role is confirmed. Do not classify production code or shared assets as tests merely because tests import them. Ask about ambiguous files.

Before index changes, record each candidate's existence and byte hash, and save a recoverable copy of existing files outside the tracked tree. Preserve unrelated local files. Do not modify `.gitignore`, `.git/info/exclude`, global ignore rules, or Git index flags to hide tests.

Handle each test path against `BASE`:

| State at `BASE`                                 | Cleanup action                                                                                                                           | Local result                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Path absent; currently tracked                  | Use `git rm --cached -- <path>` to exclude it from the final tree. Since the entry index matches `BEFORE`, unstaged edits are preserved. | Current contents remain at the original path, untracked; a locally absent file stays absent. |
| Path already tracked                            | Use `git restore --source="$BASE" --staged -- <path>` to restore only its index entry, including mode.                                   | Current local contents remain untouched; differences from the base remain unstaged.          |
| Path absent; already absent from the final tree | No index change is needed.                                                                                                               | Preserve any current local copy.                                                             |

For renamed tests, apply these rules to both the old and new paths: restore any base-tracked old path in the index and remove any newly introduced path from it. Treat deleted base-tracked tests as base-tracked paths too; restoring their index entries excludes their deletion from the PR. Preserve the pre-cleanup working-tree state, including intentional local absence.

An existing base-tracked test stays tracked in the squash result; only its PR changes are excluded. Do not delete baseline tests from the repository to make every local test untracked. If cleanup leaves production code or tooling dependent on a newly excluded test-only file, stop and surface the dependency rather than making unrelated changes or silently shipping a broken result.

Completion: the staged final tree contains no test differences from `BASE`, and every pre-existing local test copy still has identical bytes. Tests already removed by earlier commits need no resurrection from history.

## 4. Verify and create the cleanup commit

- Stage only the reviewed comment edits. For locally modified/deleted files, use the cleaned committed blob from step 2, not `git add <path>` on the working copy. Keep test index entries from step 3 intact; avoid broad staging commands that would re-add tests or capture unrelated files.
- Review `git diff --cached "$BEFORE"` for the cleanup itself and `git diff --cached "$BASE"` for the proposed squash result, filtering out restricted paths before reading patches. Check every test candidate against the index: base-tracked paths match `BASE` exactly, and new paths are absent.
- Verify the cleanup changes only the selected comments and test index entries. Confirm committed ignore rules are unchanged from `BEFORE` and local ignore files from their entry state; compare permitted local test existence and byte hashes with the saved values.
- Run the smallest relevant project-approved validation. Validate the proposed committed tree when local edits differ from it; label working-copy checks separately so user changes are not presented as PR evidence. Locally retained tests can verify behavior, but do not claim that a fresh checkout can run excluded tests. Report validation limits honestly.
- If checks pass and staged changes exist, create a **new** commit, for example `chore: clean up PR comments and test changes`. This task intentionally uses a new commit rather than amending prior work. If commit hooks alter or re-stage files, repeat the final-tree and local-file checks before declaring success.
- Verify the resulting commit and aggregate PR diff again. Confirm that all entry-time unstaged/untracked contents and absences are preserved, alongside retained tests and expected unstaged comment differences from index-only cleanup. Do not auto-stash, delete, or commit them to obtain a clean status.

Completion: the cleanup commit passes the checks, or no cleanup was necessary. On failure, report the exact state and recovery copies; do not run destructive recovery commands or discard user files.

## 5. Finish cleanup, request push authorization, and hand off

Report the target/base, reviewed commit range, cleanup commit SHA (or no-op), removed/retained comment categories, excluded test paths and their local status, validations, and blockers.

State explicitly that history was not rewritten, original commits still contain the original test changes, ignore rules were unchanged, and no push occurred during cleanup. The guarantee concerns the **squash-merge result**, not erasure from Git history.

Once cleanup has ended (success, no-op, or the user's explicit skip), inspect whether the current branch has unpushed commits, including commits from before this run. This completion check is not reached while waiting for a staged-files decision or a user commit. Respect an explicit task-level prohibition against push or asking for it; report pending synchronization instead.

- Resolve the intended remote and branch from the PR head or a verified push destination. Do not compare against the PR target branch to infer push status. If the destination is ambiguous, ask which destination to use before offering a push.
- Refresh the relevant remote reference when needed. Compare remote and local history with `git rev-list --left-right --count <remote-head>...HEAD`. Local-only commits require a push authorization request; identical branches require none. If the remote branch does not yet exist and local commits are not published there, ask permission to create/push that branch explicitly.
- List the destination and pending commits, then ask whether to push. Creating/updating a PR or choosing Agent-assisted local commit does not by itself authorize push. A remote-ahead branch or divergence needs synchronization planning; do not offer or run a force push as ordinary publication.
- Only after the user explicitly approves the specific push may a separate post-cleanup publication action execute it. Use a normal push, never an implicit force push. Declining or deferring leaves local commits intact. Report the actual publication result; do not describe an authorization request as a completed push.

After handling the completion-time push decision, continue to the `pr` skill using the verified cleaned diff and actual validation evidence. On the user's **skip** choice, continue to the requested next phase with the unchanged committed diff and the explicit skipped status instead. Local-only changes are not PR content. A downstream workflow may still enforce its own clean-tree or remote-sync requirements: report such blockers there, without changing the user's local files or overriding that workflow. A declined push does not cancel the requested handoff, but the next phase may be blocked by an unpublished branch.
