---
name: use-proxy
description: "Use when the user requests a network proxy, or requests to external services fail, time out, or are slow. Detect and reuse an existing working proxy; report if none is available."
allowed-tools: Bash(*)
---

# Use Proxy

检测并复用已有代理；未找到则报告并停止。仅使用 Bash 工具权限，不安装软件、不下载订阅、不启停进程、不写文件。

不依赖跨工具调用保留 shell 状态：在同一次调用内完成下方探测，并紧接着执行目标命令。

## 探测

```bash
find_proxy() {
  # 1) 已有环境变量
  for v in ALL_PROXY all_proxy HTTPS_PROXY https_proxy HTTP_PROXY http_proxy; do
    printenv "$v" 2>/dev/null
  done
  # 2) macOS 系统代理
  if command -v scutil >/dev/null 2>&1; then
    scutil --proxy 2>/dev/null | tr -d ' ' | awk -F: '
      { v[$1] = $2 }
      END {
        if (v["HTTPEnable"]  == "1") print "http://"   v["HTTPProxy"]  ":" v["HTTPPort"]
        if (v["HTTPSEnable"] == "1") print "http://"   v["HTTPSProxy"] ":" v["HTTPSPort"]
        if (v["SOCKSEnable"] == "1") print "socks5://" v["SOCKSProxy"] ":" v["SOCKSPort"]
      }'
  fi
  # 3) 本地常见端口
  for p in 7890 7891 7897 1080 6152; do echo "http://127.0.0.1:$p"; done
}

# 端口开着不等于能用：必须真发一次外部请求
proxy_ok() {
  curl -s -m 5 -x "$1" -o /dev/null -w '%{http_code}' \
    https://www.gstatic.com/generate_204 2>/dev/null | grep -qE '^(200|204)$'
}

PROXY=""
for p in $(find_proxy); do   # 故意不加引号：按行拆成候选
  if proxy_ok "$p"; then PROXY="$p"; break; fi
done

if [ -z "$PROXY" ]; then
  echo "未检测到可用代理（已查：*_PROXY 环境变量、系统代理、127.0.0.1:7890/7891/7897/1080/6152）"
  echo "请先启动代理后重试。"
  exit 1
fi

echo "已检测到可用代理"
export ALL_PROXY="$PROXY" HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY" \
       all_proxy="$PROXY" http_proxy="$PROXY" https_proxy="$PROXY"
```

`gstatic` 被单独墙时，把 `proxy_ok` 里的 URL 换成 `https://api.github.com` 再跑一次。

## 使用

紧接探测代码，在同一次调用内执行目标命令；以下示例按需选用：

```bash
curl -x "$PROXY" -L -O https://example.com/file
git -c http.proxy="$PROXY" clone https://github.com/user/repo.git
```

代理凭证不得输出到回复或日志。
