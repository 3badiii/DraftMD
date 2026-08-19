@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  where winget >nul 2>nul
  if errorlevel 1 goto manual_node_install

  choice /C YN /M "Install Node.js LTS now using Windows Package Manager"
  if errorlevel 2 exit /b 1

  echo Installing Node.js LTS...
  winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-package-agreements --accept-source-agreements
  if errorlevel 1 goto node_install_error

  if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
  where node >nul 2>nul
  if errorlevel 1 goto restart_required
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js with npm enabled.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing DraftMD dependencies...
  call npm install
  if errorlevel 1 goto install_error
)

echo Starting DraftMD at http://localhost:3000
start "" /b node scripts\open-browser.mjs
call npm run dev
exit /b %errorlevel%

:install_error
echo Dependency installation failed. Review the error above and try again.
pause
exit /b 1

:manual_node_install
echo Windows Package Manager was not found.
echo Install Node.js 22.13 or newer, then run this file again.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:node_install_error
echo Node.js installation failed. Install it manually from https://nodejs.org/en/download
pause
exit /b 1

:restart_required
echo Node.js was installed, but Windows has not refreshed the PATH yet.
echo Close this window, then run start-windows.bat again.
pause
exit /b 1
