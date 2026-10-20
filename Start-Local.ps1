$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $taskNode -and (Test-Path -LiteralPath 'C:\Program Files\nodejs\node.exe')) { $taskNode = 'C:\Program Files\nodejs\node.exe' }
if (-not $taskNode) { throw '既存のNode.jsが見つかりません。自動インストールは行いません。' }
& $taskNode (Join-Path $PSScriptRoot 'scripts\start-local.mjs')
