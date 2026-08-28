---
description: 为当前分支创建或更新 GitHub PR，要求 CC 标题和规范正文
agent: build
subtask: true
---

为当前分支创建或更新 GitHub PR。

目标分支参数：

- `$1`：可选，PR 目标分支。示例：`/create-pr main`、`/create-pr master`、`/create-pr dev`。
- 如果 `$1` 为空，使用 GitHub 仓库默认分支。

用户附加要求（如有）：

```text
$ARGUMENTS
```

按以下流程执行：

1. 检查环境和仓库状态。
   - 运行 `gh auth status`，如果未登录或无仓库权限，停止并报告。
   - 运行 `git status --short --branch`，如果存在未提交变更，停止并要求用户先提交或清理；不要把未提交内容写进 PR 正文。
   - 运行 `git fetch origin --prune` 更新远端引用。
   - 如果 `$1` 不为空，用 `BASE_BRANCH="$1"` 作为 PR 目标分支；否则用 `BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')` 获取 GitHub 仓库默认分支。
   - 用 `CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)` 获取当前分支。
   - 运行 `git rev-parse --verify "origin/$BASE_BRANCH" >/dev/null 2>&1` 检查目标分支存在；不存在则停止并说明目标分支无效。
   - 如果 `CURRENT_BRANCH` 等于 `BASE_BRANCH`，停止并说明不能从目标分支给自己创建 PR。
   - 用 `git rev-parse --verify "origin/$CURRENT_BRANCH" >/dev/null 2>&1` 检查远端分支是否存在；不存在则停止并说明需要用户先推送当前分支。
   - 用 `git rev-list --left-right --count "origin/$CURRENT_BRANCH...HEAD"` 检查本地和远端是否一致；任一计数大于 0 都停止并说明需要先同步分支。

2. 收集生成 PR 所需事实，所有结论必须来自实际 diff、提交和项目文件。
   - 查看提交：`git log --no-merges --pretty=format:'- %s (%h)' "origin/$BASE_BRANCH..HEAD"`。
   - 查看变更摘要：`git diff --stat "origin/$BASE_BRANCH...HEAD"`。
   - 查看变更文件：`git diff --name-only "origin/$BASE_BRANCH...HEAD"`。
   - 查看必要的 diff 细节：`git diff "origin/$BASE_BRANCH...HEAD"`；如果 diff 很大，只读取能支撑标题、摘要、风险和测试说明的关键文件。
   - 如果没有任何提交或有效 diff，停止并报告当前分支没有可创建 PR 的变更。
   - 如果仓库存在 `.github/pull_request_template.md`、`.github/PULL_REQUEST_TEMPLATE.md` 或 `.github/PULL_REQUEST_TEMPLATE/*.md`，优先遵循项目模板；缺失的关键信息仍按本指令补齐。

3. 生成 PR 标题，必须符合 Conventional Commits（CC）规范。
   - 格式必须是 `type(scope): subject` 或 `type: subject`；破坏性变更使用 `type(scope)!: subject` 或 `type!: subject`。
   - `type` 只能使用 `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。
   - `scope` 只在能从模块、包名、应用名或目录清晰判断时使用；不确定就省略。
   - `subject` 用一句话概括真实变更，保持简洁、具体、无句号，避免只复述分支名。
   - 创建或更新 PR 前，自查标题能匹配 `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._-]+\))?(!)?: .+`。

4. 生成详细规范的 PR 正文并写入临时文件 `BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/pr-body.XXXXXX")`。
   - 正文必须具体说明做了什么、为什么做、如何验证、风险和回滚方式。
   - 不要编造测试结果；没有运行的测试必须写明原因。
   - 不适用的章节保留并写 `N/A - 原因`，不要留空。
   - 最终正文不得保留空白项目或占位文本。
   - 默认使用以下社区常见结构；如项目模板更严格，合并两者信息。

```markdown
## 概述

- <用 1-3 句话概括 PR 目的和结果>

## 变更内容

- <按模块或行为列出具体变更>

## 背景与原因

- <说明为什么需要这些变更，以及方案选择依据>

## 验证

- [ ] `命令或人工验证步骤` - 结果

## 风险与影响

- 风险：
- 影响范围：
- 回滚方式：

## 关联信息

- Issue/任务：N/A - 未提供
- 破坏性变更：N/A - 无
- 文档/迁移：N/A - 无需

## 截图或录屏

- N/A - 无界面变更

## Checklist

- [ ] PR 标题符合 Conventional Commits
- [ ] 正文覆盖变更、原因、验证、风险和回滚
- [ ] 已确认没有无关变更
- [ ] 测试、文档或迁移已完成，或已说明不适用原因
```

5. 使用 `gh` 创建或更新 PR，不要使用 `--fill`、`--web` 或交互式提示。
   - 先查找当前分支是否已有打开的 PR：`gh pr list --head "$CURRENT_BRANCH" --state open --json number --jq '.[0].number // empty'`。
   - 如果已存在 PR，运行 `gh pr edit "$PR_NUMBER" --base "$BASE_BRANCH" --title "$PR_TITLE" --body-file "$BODY_FILE"`，再用 `gh pr view "$PR_NUMBER" --json url --jq '.url'` 获取 URL。
   - 如果不存在 PR，运行 `gh pr create --base "$BASE_BRANCH" --head "$CURRENT_BRANCH" --title "$PR_TITLE" --body-file "$BODY_FILE"` 并记录输出的 URL。
   - 如果用户附加要求包含 draft、reviewer、assignee、label 或 milestone，只在信息明确时追加对应的 `gh pr create` / `gh pr edit` 参数。
   - 不要自动 merge，不要删除分支，不要使用 `--admin`。

6. 返回中文摘要，必须包含：
   - 目标分支
   - 当前分支
   - 创建还是更新 PR
   - PR 标题
   - PR URL
   - 已运行的验证
   - 阻塞项或需要用户处理的事项
