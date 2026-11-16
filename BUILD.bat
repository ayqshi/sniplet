@echo off
rem  sniplit — one-click build for Windows. Double-click this file.
rem  Builds everything into the "dist" folder: sniplit.html (single-file app), site\, .exe, .apk, iPhone profile, ads.
setlocal
cd /d "%~dp0"
title sniplit build
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed to build sniplit. Opening the download page...
  echo Install the LTS version, then double-click BUILD.bat again.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
if not exist sniplit.config.json (
  echo.
  set /p SNIPURL="Where will you host sniplit? e.g. https://yourname.github.io/sniplit/  (Enter to skip): "
)
if defined SNIPURL (
  node tools\compile.mjs update --url "%SNIPURL%"
) else (
  node tools\compile.mjs update
)
echo.
echo Your files are in: %~dp0dist
start "" "%~dp0dist"
echo.
choice /c YN /m "Open sniplit now"
if errorlevel 2 goto :eof
node tools\compile.mjs serve
