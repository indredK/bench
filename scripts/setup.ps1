# Tauri 项目一键初始化脚本 (Windows PowerShell)
# npm run setup 会自动调用此脚本

param()

Write-Host "==============================" -ForegroundColor Cyan
Write-Host "  Tauri 项目一键初始化" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# 1. 配置 Rust 国内镜像 (rsproxy.cn)
Write-Host "[1/3] 配置 Rust 国内镜像源..." -ForegroundColor Yellow
$cargoDir = "$env:USERPROFILE\.cargo"
$configFile = "$cargoDir\config.toml"

if (-not (Test-Path $cargoDir)) {
    New-Item -ItemType Directory -Force -Path $cargoDir | Out-Null
}

@"
[source.crates-io]
replace-with = "rsproxy-sparse"

[source.rsproxy]
registry = "https://rsproxy.cn/crates.io-index"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"
"@ | Set-Content -Path $configFile -Encoding UTF8

Write-Host "  -> Rust 镜像源已配置 (rsproxy.cn 稀疏协议)" -ForegroundColor Green
Write-Host ""

# 2. 安装前端依赖
Write-Host "[2/3] 安装前端依赖 (npm install)..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [!] npm install 失败，请检查网络或手动重试" -ForegroundColor Red
    exit 1
}
Write-Host "  -> 前端依赖安装完成" -ForegroundColor Green
Write-Host ""

# 3. 验证 Rust 环境
Write-Host "[3/3] 验证 Rust 环境..." -ForegroundColor Yellow
rustc --version
cargo --version

Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "  初始化完成！" -ForegroundColor Green
Write-Host "  启动开发: npm run tauri:dev" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Cyan
