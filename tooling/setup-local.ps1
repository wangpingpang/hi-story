[CmdletBinding()]
param(
    [switch]$InstallBrowser,
    [switch]$E2E,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw '请先安装符合 package.json engines 的 Node.js（建议 Node.js 24），再重新打开 PowerShell。'
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw '未找到 npm.cmd，请检查 Node.js 安装与 PATH。'
}

$localArguments = @((Join-Path $PSScriptRoot 'check-local.mjs'))
if ($SkipInstall) { $localArguments += '--skip-install' }
if ($InstallBrowser) { $localArguments += '--install-browser' }
if ($E2E) { $localArguments += '--e2e' }

Push-Location $projectRoot
try {
    & node @localArguments
    if ($LASTEXITCODE -ne 0) { throw '本地准备或检查失败，请先修复上方首个错误。' }
    Write-Host '准备完成。运行 .\tooling\start-local.ps1 启动本地开发。'
} finally {
    Pop-Location
}
