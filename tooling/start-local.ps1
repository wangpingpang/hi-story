[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '请先安装符合 package.json engines 的 Node.js（建议 Node.js 24），再重新打开 PowerShell。'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw '未找到 npm.cmd，请检查 Node.js 安装与 PATH。'
}

Push-Location $projectRoot
try {
    & node (Join-Path $PSScriptRoot 'check-local.mjs') --node-only
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 版本不符合项目要求。' }
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\.bin\vite.cmd'))) {
        throw '尚未安装依赖，请先运行 .\tooling\setup-local.ps1。'
    }
    Write-Host '本地开发入口：http://127.0.0.1:5173/ （按 Ctrl+C 停止）'
    & npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
    if ($LASTEXITCODE -ne 0) { throw '开发服务已退出，请检查上方错误（包括端口占用）。' }
} finally {
    Pop-Location
}
