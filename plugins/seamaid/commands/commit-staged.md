---
description: 提交已暂存的文件
agent: seamaid-code
---

!`result=$(git log -1 --pretty=%s | sed -En 's/^([^:]+): .+【([^-]+)-(.+)】$/提交已暂存的文件，消息格式严格为：\1: <description>【\2-\3】/p'); if [ -n "$result" ]; then printf '%s\n' "$result"; else printf '%s\n' '提交已暂存的文件，消息格式严格为：<type>: <description>【<version>-<主题>】'; fi`
