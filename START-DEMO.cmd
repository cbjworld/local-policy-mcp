@echo off
setlocal
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or later before running this check.
  pause
  exit /b 1
)
pushd "%~dp0"
node --use-system-ca prepare-demo.cjs
set "check_exit=%errorlevel%"
popd
pause
exit /b %check_exit%
