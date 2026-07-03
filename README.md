# dot-agents

将项目中的 `agents/`、`commands/`、`plugins/`、`skills/` 同步到 OpenCode 配置目录。

## 使用方式

```bash
# 同步到 ~/.config/opencode/
npx @ryucode/dot-agents init

# 预览变更
npx @ryucode/dot-agents init --dry-run

# 同步到自定义目录（用于测试）
npx @ryucode/dot-agents init --target test/.opencode

# 查看帮助
npx @ryucode/dot-agents --help
```