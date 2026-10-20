@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "WAGE_TAX_NODE=node.exe"
where node.exe >nul 2>&1
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "WAGE_TAX_NODE=C:\Program Files\nodejs\node.exe"
  ) else (
    echo Node.js が見つかりません。自動インストールは行いません。
    echo 松本さんの既存Node.jsの場所を確認してください。
    pause
    exit /b 1
  )
)
"%WAGE_TAX_NODE%" "%~dp0scripts\start-local.mjs"
if errorlevel 1 (
  echo 起動できませんでした。上のメッセージを確認してください。
  pause
)
endlocal
