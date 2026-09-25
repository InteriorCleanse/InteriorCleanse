# Creates the two research environments (Windows PowerShell). Run from the trading-bot folder:
#   powershell -ExecutionPolicy Bypass -File research\setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$py = if ($env:PYTHON) { $env:PYTHON } else { 'python' }
& $py -m venv .venv-vbt; & .venv-vbt\Scripts\python -m pip install -q --upgrade pip; & .venv-vbt\Scripts\pip install -q -r requirements-vectorbt.txt
& $py -m venv .venv-hbt; & .venv-hbt\Scripts\python -m pip install -q --upgrade pip; & .venv-hbt\Scripts\pip install -q -r requirements-hftbacktest.txt
& .venv-vbt\Scripts\python vbt_sweep.py --selftest
& .venv-vbt\Scripts\python bot_styles.py --selftest
& .venv-hbt\Scripts\python hbt_mm.py --selftest
Write-Host 'Research tools ready. See research\README.md.'
