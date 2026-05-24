#!/data/data/com.termux/files/usr/bin/bash
# use-proxy - mihomo proxy setup helper
# Usage: ./use-proxy.sh [subscription_url]

set -e

PROXY_PORT=7890
MIAOMO_BIN="/data/data/com.termux/files/usr/bin/mihomo"
CONFIG_DIR="$HOME/.config/mihomo"

usage() {
    echo "用法: $0 [subscription_url]"
    echo ""
    echo "订阅地址优先级：参数 > 环境变量 MIHOMO_SUB_URL"
    exit 1
}

# 1. 获取订阅地址
SUB_URL="${1:-$MIHOMO_SUB_URL}"
if [[ -z "$SUB_URL" ]]; then
    echo "❌ 未提供订阅地址！"
    usage
fi

echo "🔧 准备 mihomo 环境..."

# 2. 检查 mihomo 是否安装
if ! which mihomo >/dev/null 2>&1; then
    echo "📥 下载 mihomo..."
    MIRROR="https://github.com/MetaCubeX/mihomo/releases/download/v1.19.25/mihomo-linux-arm64-v1.19.25.gz"
    if command -v curl >/dev/null 2>&1; then
        DOWNLOADER="curl"
    elif command -v wget >/dev/null 2>&1; then
        DOWNLOADER="wget"
    else
        echo "❌ 需要 curl 或 wget"
        exit 1
    fi

    TEMP_GZ="$HOME/.mihomo-tmp.gz"
    if [[ "$DOWNLOADER" == "curl" ]]; then
        curl -L -o "$TEMP_GZ" "$MIRROR" 2>/dev/null
    else
        wget -O "$TEMP_GZ" "$MIRROR" 2>/dev/null
    fi
    
    gunzip "$TEMP_GZ" 2>/dev/null || true
    mv "${TEMP_GZ%.gz}" ~/.mihomo-temp 2>/dev/null || true
    
    # The file after gunzip might be named differently, let's handle this
    for f in ~/.mihomo-tmp ~/.mihomo-temp; do
        if [[ -f "$f" ]] && file "$f" | grep -q "ELF"; then
            chmod +x "$f"
            cp "$f" "$MIAOMO_BIN" 2>/dev/null || {
                cp "$f" /data/data/com.termux/files/usr/bin/
                echo "⚠️  需要 Termux 权限写入系统目录，请确保已授权"
            }
            rm -f "$f"
            break
        fi
    done
    
    if ! which mihomo >/dev/null 2>&1; then
        echo "⚠️  尝试通过 pkg install mihomo 安装..."
    fi
fi

# 3. 确保配置目录存在
mkdir -p "$CONFIG_DIR/{geodata}"

# 4. 基础配置（保留用户自定义部分）
if [[ ! -f "$CONFIG_DIR/config.yaml" ]]; then
    cat > "$CONFIG_DIR/config.yaml" <<'YAML'
log-level: info
ipv6: false
mixed-port: 7890
allow-lan: true
bind-address: "*"
mode: rule
geox-url:
  geoip: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb"
  geosite: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.db"
  mmdb: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb"
geo-auto-update: true
geo-update-interval: 24
YAML
    echo "✅ 基础配置已创建"
else
    # 更新 mixed-port 如果之前有设置
    if grep -q "^mixed-port:" "$CONFIG_DIR/config.yaml"; then
        true  # port already set
    fi
fi

# 5. 停止旧进程
if pgrep -x mihomo >/dev/null 2>&1; then
    PIDS=$(pgrep -x mihomo)
    kill $PIDS 2>/dev/null
    sleep 2
    kill -9 $PIDS 2>/dev/null || true
    echo "💤 已停止旧实例"
fi

# 6. 下载订阅
echo "📡 拉取订阅 ($PROXY_PORT port)..."
CLASH_FILE="$CONFIG_DIR/clash.yaml"

# 如果订阅URL是加密格式（mihamo:// 开头），先解码
if echo "$SUB_URL" | grep -qE '^mihamo://|^ss://|^vmess://|^socks://'; then
    echo "📦 单个节点链接，转换为配置..."
    PROTO=$(echo "$SUB_URL" | cut -d: -f1)
    
    case "$PROTO" in
        vmess)
            PAYLOAD=$(echo "$SUB_URL" | sed 's|vmess://||')
            DECODED=$(echo "$PAYLOAD" | base64 -d 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'proxies:\n- name: \"{d[\"ps\"]}\" \n  type: {d[\"type\"]}\n  server: {d[\"add\"]}\n  port: {d[\"port\"]}\n  uuid: \"{d[\"id\"]}\"\n  alterId: {d.get(\"aid\",0)}\n  cipher: auto\n  udp: true\nproxy-groups:\n- name: PROXY\n  type: select\n  proxies:\n  - \"{d[\"ps\"]}\"\n- name: DIRECT\n  type: select\n  proxies:\n  - DIRECT\nrules:\n- GEOIP,CN,DIRECT\n- DOMAIN-SUFFIX,google.com,PROXY\n- DOMAIN-SUFFIX,github.com,PROXY\n- MATCH,DIRECT')" 2>/dev/null || echo "⚠️ JSON 转换失败，使用原始解析")
            echo "$DECODED" > "$CLASH_FILE"
            ;;
        *)
            # 直接作为代理列表
            echo "proxies:
- name: proxy-node
  type: direct
proxy-groups:
- name: PROXY
  type: select
  proxies:
  - DIRECT
rules:
- GEOIP,CN,DIRECT
- MATCH,PROXY" > "$CLASH_FILE"
            ;;
    esac
else
    # 普通 HTTP(S) 订阅 URL
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "$CLASH_FILE" "$SUB_URL" --max-time 30 2>/dev/null
    else
        wget -O "$CLASH_FILE" "$SUB_URL" --timeout=30 2>/dev/null
    fi
    
    if [[ ! -s "$CLASH_FILE" ]]; then
        echo "❌ 订阅拉取失败"
        exit 1
    fi
fi

# 验证订阅内容
if ! grep -qE 'proxies|proxy-providers' "$CLASH_FILE" 2>/dev/null; then
    echo "⚠️  订阅文件不包含代理配置，可能是加密订阅"
    echo "   请确认订阅格式为 Clash/Meta YAML"
fi

echo "🚀 启动 mihomo..."
mihomo -d "$CONFIG_DIR" &>/tmp/mihomo.log &
sleep 3

if pgrep -x mihomo >/dev/null 2>&1; then
    echo ""
    echo "============================================="
    echo " ✅ 代理已就绪 (mixed-port: $PROXY_PORT)"
    echo "============================================="
    echo ""
    
    # ---- GitHub ----
    echo "# === GitHub ==="
    echo "git clone https://ghproxy.lvedouble.site/https://github.com/user/repo.git"
    echo ""
    
    # ---- Google & AI API ----
    echo "# === Google / AI API / HuggingFace ==="
    export_out='export ALL_PROXY=http://127.0.0.1:'"$PROXY_PORT"' HTTP_PROXY=http://127.0.0.1:'"$PROXY_PORT"' HTTPS_PROXY=http://127.0.0.1:'"$PROXY_PORT""
    echo "$export_out"
    echo ""
    
    # ---- Package Managers ----
    echo "# === npm ==="
    echo 'npm config set proxy http://127.0.0.1:'"$PROXY_PORT""
    echo 'npm config set https-proxy http://127.0.0.1:'"$PROXY_PORT""
    echo ""
    
    echo "# === pip ==="
    echo "pip install xxx --proxy http://127.0.0.1:$PROXY_PORT"
    echo ""
    
    echo "# === go ==="
    echo "export GOPROXY=https://goproxy.cn,direct"
    echo ""
    
    echo "# === Docker Hub (用 ghcr 镜像替换) ==="
    echo "# docker pull hub.example/img  →  docker pull ghcr.io/example/img"
    echo ""
    
    # ---- Universal Download ----
    echo "# === wget/curl 指定代理 ==="
    echo "curl -x http://127.0.0.1:$PROXY_PORT -O https://example.com/file"
    echo "wget -e use_proxy=yes -e https_proxy=http://127.0.0.1:$PROXY_PORT URL"
    echo ""
    
    # ---- One-line shortcut ----
    echo "💡 一键设置代理变量："
    echo ""
    echo "export ALL_PROXY=http://127.0.0.1:${PROXY_PORT} \\n     HTTP_PROXY=http://127.0.0.1:${PROXY_PORT} \\n     HTTPS_PROXY=http://127.0.0.1:${PROXY_PORT}"
    echo ""
    
    echo "============================================="
    
    # Save to session for easy recall
    echo "$export_out" >> "$HOME/.profile_local_proxy" 2>/dev/null || true
else
    echo "❌ mihomo 启动失败，查看日志："
    tail -20 /tmp/mihomo.log 2>/dev/null
    exit 1
fi
