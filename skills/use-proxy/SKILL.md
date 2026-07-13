---
name: use-proxy
description: "访问境外网络（Google、GitHub、HuggingFace 等）时使用 mihomo 代理解决网络连接慢或不通的问题。订阅地址从环境变量 MIHOMO_SUB_URL 读取，也可以通过参数覆盖优先级更高。提供本地代理设置和一键加速下载命令。Triggers: proxy, 代理, google, github, huggingface, download slow, 下载慢, 科学上网, 翻墙, 外网, 境外, 梯子"
allowed-tools: Bash(*)
---

# Use Proxy (mihomo)

当用户需要访问国外网站（Google、GitHub、npm registry、Docker Hub、HuggingFace、AI API 等）遇到连接失败或速度慢时，激活此技能。

## 工作流程

### 1. 确定订阅地址

```bash
# 优先级：命令行参数 > 环境变量 MIHOMO_SUB_URL
SUB_URL="${1:-$MIHOMO_SUB_URL}"

if [[ -z "$SUB_URL" ]]; then
    echo "❌ 未提供订阅地址！"
    echo "用法："
    echo "  /skills use-proxy <subscription-url>"
    echo "  或设置环境变量 export MIHOMO_SUB_URL='your-url'"
    exit 1
fi
```

### 2. 检查并启动 mihomo

```bash
# 检查 mihomo 是否安装
which mihomo >/dev/null 2>&1 || {
    echo "⚠️  mihomo 未安装，正在下载..."
    MIRROR="https://github.com/MetaCubeX/mihomo/releases/download/v1.19.25/mihomo-linux-arm64-v1.19.25.gz"
    curl -L -o ~/.mihomo.gz "$MIRROR" 2>/dev/null && gunzip ~/.mihomo.gz && chmod +x ~/.mihomo
    mv ~/.mihomo /data/data/com.termux/files/usr/bin/mihomo 2>/dev/null || true
    which mihomo >/dev/null 2>&1 || echo "❌ mihomo 安装失败"
}

# 检查是否已在运行
if pgrep -x mihomo >/dev/null 2>&1; then
    echo "✅ mihomo 已在运行"
else
    echo "🚀 启动 mihomo..."
    mkdir -p ~/.config/mihomo/{rules,geodata}
    mihomo -d ~/.config/mihomo -d &>/tmp/mihomo.log &
    sleep 2
    pgrep -x mihomo >/dev/null 2>&1 && echo "✅ mihomo 已启动" || echo "❌ mihomo 启动失败"
fi
```

### 3. 更新订阅

```bash
SUB_DIR="$HOME/.config/mihomo"
mkdir -p "$SUB_DIR"

echo "📡 更新订阅..."
curl -L -o "$SUB_DIR/clash.yaml" "$SUB_URL" 2>/dev/null

if [[ $? -ne 0 ]] || ! head -5 "$SUB_DIR/clash.yaml" | grep -q 'proxies\|proxy-providers'; then
    # 尝试 base64 解码（加密订阅）
    echo -n "$SUB_URL" | grep -qP '^miedge|^ss?://' && {
        echo "🔐 检测到加密订阅，尝试解码..."
        echo "$SUB_URL" | sed 's|mihamo://||;s|mihomo://||' | base64 -d 2>/dev/null > "$SUB_DIR/clash.yaml"
    }
fi

# 重启 mihomo 加载新配置
kill $(pgrep -x mihomo) 2>/dev/null
sleep 1
mihomo -d "$SUB_DIR" &>/tmp/mihomo.log &
sleep 3
echo "✅ 订阅已更新并生效"
```

### 4. 输出代理使用指南

```bash
PROXY_PORT=${MIHOMO_PORT:-7890}

echo ""
echo "============================================="
echo " 🔥 代理已就绪 (mixed-port: $PROXY_PORT)"
echo "============================================="
echo ""

# ---- GitHub ----
echo "# === GitHub ==="
echo "git clone https://ghproxy.lvedouble.site/https://github.com/user/repo.git"
echo "gh pr list --repo user/repo          # 用全局代理也可以"
echo ""

# ---- Google/API ----
echo "# === Google & AI API ==="
echo "export all_proxy=http://127.0.0.1:$PROXY_PORT"
echo "export HTTP_PROXY=http://127.0.0.1:$PROXY_PORT"
echo "export HTTPS_PROXY=http://127.0.0.1:$PROXY_PORT"
echo ""

# ---- npm/Pip/Go/Apt ----
echo "# === npm ==="
echo "npm config set proxy http://127.0.0.1:$PROXY_PORT"
echo "npm config set https-proxy http://127.0.0.1:$PROXY_PORT"
echo ""
echo "# === pip ==="
echo "pip install xxx --proxy http://127.0.0.1:$PROXY_PORT"
echo ""
echo "# === go ==="
echo "export GOPROXY=https://goproxy.cn,direct"
echo ""
echo "# === apt ==="
echo "Acquire::http::Proxy \"http://127.0.0.1:$PROXY_PORT\";" > /etc/apt/apt.conf.d/proxy.conf
echo ""

# ---- 通用下载 ----
echo "# === wget/curl 指定代理 ==="
echo "curl -x http://127.0.0.1:$PROXY_PORT -O https://example.com/file"
echo "wget -e use_proxy=yes -e https_proxy=http://127.0.0.1:$PROXY_PORT URL"
echo ""

# ---- Docker Hub ----
echo "# === Docker Hub ==="
echo "docker pull ghcr.io/user/image       # 走 ghcr.io 镜像"
echo ""

echo "💡 提示：常用代理变量 one-line 快捷设置："
echo "export ALL_PROXY=http://127.0.0.1:${PROXY_PORT} HTTP_PROXY=http://127.0.0.1:${PROXY_PORT} HTTPS_PROXY=http://127.0.0.1:${PROXY_PORT}"
echo ""
echo "============================================="
```

## 触发场景

以下情况自动调用本技能：

| 场景                                     | 示例                              |
| ---------------------------------------- | --------------------------------- |
| 用户提到访问 Google、YouTube、Twitter 等 | "帮我搜一下 Google"               |
| 克隆 GitHub 仓库慢/失败                  | "clone 这个仓库"、"github 连不上" |
| 下载 GitHub/HuggingFace/npm 资源         | "下载 stable-diffusion"           |
| 访问 AI API 不稳定                       | "openai api 超时"                 |
| 用户说需要代理/梯子/科学上网             |                                   |
| Docker pull 国内缓慢                     | "pull docker image"               |
| Python/Node.js 包管理慢                  | "pip install tensorflow"          |

## 注意事项

- **不替代完整网络翻墙**：本技能为终端代理方案，提供 `HTTP_PROXY`/`SOCKS5` 级别的细粒度控制
- **混合端口**：`mixed-port` 同时支持 HTTP/HTTPS/SOCKS5，用 `http://127.0.0.1:7890` 即可
- **安全退出**：`kill $(pgrep mihomo)` 可停止代理
- **订阅格式**：支持 Clash/Meta YAML 格式的订阅链接
- **Termux 特有**：建议加 `termux-wake-lock` 防止休眠断连
