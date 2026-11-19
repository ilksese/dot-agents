# dot-agents

将项目中的 `agents/`、`commands/`、`plugins/`、`skills/` 同步到 OpenCode 配置目录。

## 使用方式

```bash
# 同步到 ~/.config/opencode/
npx @ryucode/dot-agents init

# 使用 sync 同步全部资源
npx @ryucode/dot-agents sync

# 同步指定资源（选项可重复）
npx @ryucode/dot-agents sync --plugin seamaid --agent seamaid-code

# 注意：--plugin 会把插件目录写入目标 opencode.json[c] 的 plugins 数组，已存在相同目录时跳过

# 使用短选项同步指定资源
npx @ryucode/dot-agents sync -p seamaid -a seamaid-code -c create-pr

# 同步某一类全部资源
npx @ryucode/dot-agents sync --plugin all --skill all

# 未匹配的资源会跳过，并输出到 stderr
npx @ryucode/dot-agents sync -a missing -a seamaid-code

# 以 tree 结构列出全部资源
npx @ryucode/dot-agents list

# 列出某一类全部资源
npx @ryucode/dot-agents list --agent

# 使用大小写不敏感的 glob 过滤
npx @ryucode/dot-agents list --agent "seamaid*" --skill "*CLEANUP*"

# 使用短选项过滤列表
npx @ryucode/dot-agents list -a "seamaid*" -s "*cleanup*"

# 预览变更
npx @ryucode/dot-agents sync --dry-run

# 同步到自定义目录（用于测试）
npx @ryucode/dot-agents sync --target test/.opencode

# 查看帮助
npx @ryucode/dot-agents --help
```

## PR 前置清理

`before-pr` 在准备创建或更新 PR、调用 `pr` 技能或撰写 PR 正文前触发：追加清理提交，删除纯复述代码行为的注释，保留原因、非直觉行为和协议约束说明。

测试变更从最终 squash merge 结果中剔除，本地文件保留：新增测试取消跟踪，目标分支已有测试只恢复索引中的基线版本。不修改忽略规则、不重写历史；执行期间不 push，结束后如有未推送提交才申请授权，批准后另行执行普通 push；原始提交仍保留原内容。

允许工作区有未跟踪文件和未暂存修改，清理只处理已提交内容并保留本地改动。如果已有 staged 文件，先由用户选择：跳过清理进入下一阶段、自行提交后继续，或授权 Agent 帮助提交后继续；不会自动提交或清空暂存区。
