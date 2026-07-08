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
