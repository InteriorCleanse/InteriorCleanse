@echo off
REM Double-click this file to start your trading bot.
cd /d "%~dp0"
echo.
echo   Starting your paper trading bot...
echo   (PAPER MODE - no real money, no exchange account)
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node is not installed yet.
  echo.
  echo   Get it free from https://nodejs.org - click the green LTS button,
  echo   run the installer, then double-click this file again.
  echo.
  pause
  exit /b 1
)
node src\server.ts
echo.
echo   The bot has stopped.
pause
