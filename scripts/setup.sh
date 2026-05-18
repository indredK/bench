#!/bin/bash
# Tauri 项目一键初始化脚本 (Linux / macOS)
# npm run setup:unix 会自动调用此脚本

set -e

echo "=============================="
echo "  Tauri 项目一键初始化"
echo "=============================="
echo ""

# 1. 配置 Rust 国内镜像 (rsproxy.cn)
echo "[1/3] 配置 Rust 国内镜像源..."
CARGO_DIR="${HOME}/.cargo"
CONFIG_FILE="${CARGO_DIR}/config.toml"

mkdir -p "${CARGO_DIR}"

cat > "${CONFIG_FILE}" << 'EOF'
[source.crates-io]
replace-with = "rsproxy-sparse"

[source.rsproxy]
registry = "https://rsproxy.cn/crates.io-index"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"
EOF

echo "  -> Rust 镜像源已配置 (rsproxy.cn 稀疏协议)"
echo ""

# 2. 安装前端依赖
echo "[2/3] 安装前端依赖 (npm install)..."
npm install
echo "  -> 前端依赖安装完成"
echo ""

# 3. 验证 Rust 环境
echo "[3/3] 验证 Rust 环境..."
rustc --version
cargo --version

echo ""
echo "=============================="
echo "  初始化完成！"
echo "  启动开发: npm run tauri:dev"
echo "=============================="
