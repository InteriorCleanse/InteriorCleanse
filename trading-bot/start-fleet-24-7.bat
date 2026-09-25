@echo off
REM Double-click to paper-trade more markets around the clock, one full engine
REM per market. Run it NEXT TO start-24-7.bat: that window keeps trading BTC on
REM its own record; this one adds the others on ports 4174 and up. A market
REM that stops restarts itself; if this whole window stops, it restarts too.
REM Pretend money only. Close this window to stop it.
cd /d "%~dp0"
set MRCASH_SYMBOLS=ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT
set MRCASH_PORT=4174
set MRCASH_DATA_DIR=data-fleet
REM The BTC window already runs the all-markets scan.
set MRCASH_MARKETS=0
echo.
echo   Mr. Cash fleet - 24/7 paper trading on %MRCASH_SYMBOLS% (close this window to stop)
echo.
:loop
node scripts\fleet.mjs
echo.
echo   The fleet stopped - restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
