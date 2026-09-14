@echo off
REM Double-click to run Mr. Cash around the clock. If it ever stops, it
REM restarts itself after 10 seconds. Close this window to stop it.
cd /d "%~dp0"
echo.
echo   Mr. Cash - 24/7 paper trading (close this window to stop)
echo.
node src\server.ts
:loop
echo.
echo   Mr. Cash stopped - restarting in 10 seconds...
timeout /t 10 /nobreak >nul
set NO_BROWSER=1
node src\server.ts
goto loop
