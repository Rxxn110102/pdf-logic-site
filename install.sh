#!/usr/bin/env bash
# PDF逻辑解析工具 · 一键部署脚本（适用于国内 / 香港云服务器）
# 支持：Ubuntu 20.04+、Debian 11+、OpenCloudOS / TencentOS / Alibaba Cloud Linux / CentOS 8+
# 用法：在项目目录中运行  sudo bash deploy/install.sh
# 重复运行即可更新（会保留已有的 .env 配置）。
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="/opt/pdf-logic-site"   # 网站安装位置
APP_USER="pdflogic"
SERVICE="pdf-logic"
NODE_VERSION="v20.18.0"
NODE_MIRROR="https://registry.npmmirror.com/-/binary/node"
NPM_REGISTRY="https://registry.npmmirror.com"

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m注意：%s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m错误：%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 权限运行：sudo bash deploy/install.sh"
[ -f "$SRC_DIR/server.js" ] || die "找不到 server.js，请在项目目录中运行本脚本。"

# ---------- 1. 系统软件包 ----------
if command -v apt-get >/dev/null 2>&1; then
  PM="apt"
elif command -v dnf >/dev/null 2>&1; then
  PM="dnf"
elif command -v yum >/dev/null 2>&1; then
  PM="yum"
else
  die "不支持的系统，请使用 Ubuntu、Debian 或 CentOS 系列系统。"
fi

say "安装 Nginx 等系统组件（使用云服务商自带的软件源）"
case "$PM" in
  apt) export DEBIAN_FRONTEND=noninteractive
       apt-get update -y
       apt-get install -y nginx curl tar xz-utils ca-certificates ;;
  *)   $PM install -y nginx curl tar xz ca-certificates ;;
esac

# ---------- 2. Node.js（从国内镜像下载） ----------
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major; major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge 18 ]
}
if node_ok; then
  say "已安装 Node.js $(node -v)，跳过"
else
  case "$(uname -m)" in
    x86_64|amd64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) die "不支持的 CPU 架构：$(uname -m)" ;;
  esac
  say "从 npmmirror 下载 Node.js $NODE_VERSION（$ARCH）"
  TMP="$(mktemp -d)"
  curl -fL --retry 3 -o "$TMP/node.tar.xz" "$NODE_MIRROR/$NODE_VERSION/node-$NODE_VERSION-linux-$ARCH.tar.xz" \
    || die "Node.js 下载失败，请检查服务器网络后重试。"
  rm -rf /usr/local/lib/nodejs && mkdir -p /usr/local/lib/nodejs
  tar -xJf "$TMP/node.tar.xz" -C /usr/local/lib/nodejs --strip-components=1
  rm -rf "$TMP"
  ln -sf /usr/local/lib/nodejs/bin/node /usr/local/bin/node
  ln -sf /usr/local/lib/nodejs/bin/npm  /usr/local/bin/npm
  ln -sf /usr/local/lib/nodejs/bin/npx  /usr/local/bin/npx
  node_ok || die "Node.js 安装失败。"
fi
npm config set registry "$NPM_REGISTRY" >/dev/null

# ---------- 3. 复制网站文件到 /opt（保留已有的 .env 和前端组件） ----------
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  say "复制网站文件到 $APP_DIR"
  mkdir -p "$APP_DIR"
  tar -C "$SRC_DIR" --exclude=./.git --exclude=./.env --exclude=./node_modules -cf - . | tar -C "$APP_DIR" -xf -
fi

# ---------- 4. 模型配置（.env） ----------
ENV_FILE="$APP_DIR/.env"
set_env() {  # set_env KEY VALUE —— 写入或替换 .env 中的一项
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    local tmp; tmp="$(mktemp)"
    awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' "$ENV_FILE" > "$tmp" && cat "$tmp" > "$ENV_FILE" && rm -f "$tmp"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

CONFIGURE=1
if [ -f "$ENV_FILE" ] && grep -q '^LLM_API_KEY=.\+' "$ENV_FILE"; then
  read -r -p "已有模型配置（.env）。要重新填写吗？[y/N] " ans
  case "${ans:-N}" in [yY]*) CONFIGURE=1 ;; *) CONFIGURE=0 ;; esac
fi

if [ "$CONFIGURE" -eq 1 ]; then
  [ -f "$ENV_FILE" ] || cp "$APP_DIR/.env.example" "$ENV_FILE"
  say "配置 AI 模型"
  echo "  1) DeepSeek（默认）"
  echo "  2) 通义千问（阿里云百炼）"
  echo "  3) Kimi（月之暗面）"
  echo "  4) 其他 OpenAI 兼容接口"
  read -r -p "请选择模型服务 [1-4，默认 1]：" choice
  case "${choice:-1}" in
    2) PROVIDER="qwen" ;;
    3) PROVIDER="kimi" ;;
    4) PROVIDER="custom" ;;
    *) PROVIDER="deepseek" ;;
  esac
  set_env LLM_PROVIDER "$PROVIDER"

  KEY=""
  while [ -z "$KEY" ]; do
    read -r -s -p "请粘贴 API 密钥（输入时不显示）：" KEY; echo
  done
  set_env LLM_API_KEY "$KEY"

  if [ "$PROVIDER" = "custom" ]; then
    read -r -p "接口地址（例如 https://xxx.com/v1）：" BASE
    read -r -p "模型名称：" MODEL
    set_env LLM_BASE_URL "$BASE"
    set_env LLM_MODEL "$MODEL"
  else
    read -r -p "模型名称（直接回车使用默认值）：" MODEL
    set_env LLM_MODEL "${MODEL:-}"
    set_env LLM_BASE_URL ""
  fi

  read -r -p "设置访问码（访客需输入才能使用，直接回车表示不设置）：" CODE
  set_env ACCESS_CODE "${CODE:-}"
  [ -n "${CODE:-}" ] || warn "没有设置访问码，任何人都能使用你的 AI 额度。可以以后编辑 $ENV_FILE 补上。"
fi
set_env HOST "127.0.0.1"
grep -q '^PORT=.\+' "$ENV_FILE" || set_env PORT "8787"
PORT="$(grep '^PORT=' "$ENV_FILE" | head -1 | cut -d= -f2)"

# ---------- 5. 前端组件（下载到本站，不依赖外部 CDN） ----------
say "下载前端组件到 public/vendor"
( cd "$APP_DIR" && node scripts-vendor.js ) || warn "前端组件下载失败，网页会改用 npmmirror 在线加载。可稍后运行 npm run vendor 重试。"

# ---------- 6. 运行用户与系统服务 ----------
say "创建系统服务 $SERVICE"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" 2>/dev/null \
  || useradd -r -M -s /sbin/nologin "$APP_USER"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod 600 "$ENV_FILE"

cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=PDF逻辑解析工具
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) $APP_DIR/server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"

# ---------- 7. Nginx 反向代理 ----------
say "配置 Nginx"
# CentOS 系列开启了 SELinux 时，需要允许 Nginx 转发到本机服务
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  setsebool -P httpd_can_network_connect 1 || warn "无法设置 SELinux，若网页打不开请检查 SELinux。"
fi
NGINX_CONF="/etc/nginx/conf.d/pdf-logic.conf"
sed "s/__PORT__/$PORT/g" "$APP_DIR/deploy/nginx.conf" > "$NGINX_CONF"
# 去掉系统自带的默认站点，避免与本站冲突
rm -f /etc/nginx/sites-enabled/default
if [ -f /etc/nginx/nginx.conf ] && grep -q 'listen[[:space:]]\+80 default_server' /etc/nginx/nginx.conf; then
  sed -i.bak 's/listen\([[:space:]]\+\)80 default_server;/listen\180;/; s/listen\([[:space:]]\+\)\[::\]:80 default_server;/listen\1[::]:80;/' /etc/nginx/nginx.conf
fi
nginx -t
systemctl enable nginx >/dev/null
systemctl restart nginx

# 系统防火墙（若启用）放行 80 端口
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http >/dev/null && firewall-cmd --reload >/dev/null
fi

# ---------- 8. 检查 ----------
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/config" >/dev/null; then
  CFG="$(curl -fsS "http://127.0.0.1/api/config" 2>/dev/null || true)"
  IP="$(curl -fsS --max-time 4 https://ifconfig.me 2>/dev/null || curl -fsS --max-time 4 https://api.ipify.org 2>/dev/null || true)"
  say "部署完成！"
  echo "  访问地址：http://${IP:-你的服务器公网IP}"
  echo "  （如果显示的不是公网 IP，以云服务器控制台里显示的公网 IP 为准）"
  echo "  服务状态：$CFG"
  echo
  echo "  如果打不开，请到云服务器控制台的“防火墙 / 安全组”放行 TCP 80 端口。"
  echo "  查看日志：journalctl -u $SERVICE -f"
  echo "  修改配置：编辑 $ENV_FILE 后运行 systemctl restart $SERVICE"
else
  die "服务没有正常启动，请运行 journalctl -u $SERVICE -n 50 查看原因。"
fi
