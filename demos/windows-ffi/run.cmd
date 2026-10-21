@echo off
setlocal
cd /d "%~dp0..\.."

if not exist node_modules (
  echo Installing dependencies...
  call npm install || exit /b 1
)

if not exist dist\index.js (
  echo Building @geastack/ffi...
  call npm run build || exit /b 1
)

node demos\windows-ffi\demo.mjs
exit /b %errorlevel%
